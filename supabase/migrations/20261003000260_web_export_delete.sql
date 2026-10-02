-- Fermata · Web-App (M2): Datenexport (Art. 15/20 DSGVO) und Kontolöschung (Art. 17 DSGVO)
-- Export: alle eigenen Daten, nie Daten über andere (keine fremden IDs, Namen oder Rückmeldungen).
-- Löschung: Supabase Auth löscht die Person, die Fremdschlüssel löschen mit (on delete cascade);
-- was das Gesetz verlangt, bleibt ohne Personenbezug (z. B. billing.contract_actions mit user_id null).

create or replace function app.export_account(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_waitlist jsonb := null;
  v_result jsonb;
begin
  select u.email::text into v_email from auth.users u where u.id = p_user;
  if v_email is null then
    raise exception 'Person nicht gefunden' using errcode = 'P0002';
  end if;
  if to_regclass('public.waitlist') is not null then
    execute $q$select to_jsonb(w) - 'id' - 'confirm_token_hash' - 'status_token_hash' - 'invited_by_code'
               from public.waitlist w where lower(w.email::text) = $1 limit 1$q$ into v_waitlist using lower(v_email);
  end if;

  select jsonb_build_object(
    'export', jsonb_build_object(
      'format', 'fermata-datenexport',
      'version', 1,
      'erstellt_am', app.now(),
      'hinweis', 'Alle Daten, die Fermata über Sie gespeichert hat. Daten über andere Menschen sind nicht enthalten.'
    ),
    'anmeldung', (select jsonb_build_object('email', u.email, 'erstellt_am', u.created_at, 'letzte_anmeldung', u.last_sign_in_at,
                                             'zwei_faktor', (select count(*) from auth.mfa_factors mf where mf.user_id = u.id and mf.status = 'verified'))
                  from auth.users u where u.id = p_user),
    'konto', (select to_jsonb(a) - 'user_id' from app.accounts a where a.user_id = p_user),
    'einladung', (select coalesce(jsonb_agg(jsonb_build_object('eingeladen_am', i.invited_at, 'gueltig_bis', i.expires_at,
                                   'angenommen_am', i.accepted_at) order by i.invited_at), '[]'::jsonb)
                  from app.account_invitations i where i.user_id = p_user),
    'angaben', (select to_jsonb(f) - 'user_id' from private.account_facts f where f.user_id = p_user),
    'ort_fuer_die_auswahl', (select to_jsonb(g) - 'user_id' from app.geo g where g.user_id = p_user),
    'einwilligungen', (select coalesce(jsonb_agg(jsonb_build_object('art', c.kind, 'aktion', c.action, 'fassung', c.document_version,
                                        'zeitpunkt', c.at, 'quelle', c.source) order by c.at, c.id), '[]'::jsonb)
                       from app.consents c where c.user_id = p_user),
    'besondere_angaben', jsonb_build_object(
      'geschlecht_und_suche', (select jsonb_build_object('geschlecht', sensitive.dec(pi.gender_enc),
                                 'gesucht', string_to_array(sensitive.dec(pi.seeking_genders_enc), ','),
                                 'orientierung', sensitive.dec(pi.orientation_enc), 'geaendert_am', pi.updated_at)
                               from sensitive.profile_identity pi where pi.user_id = p_user),
      'religion_und_gesundheit', (select jsonb_build_object('religion', sensitive.dec(ps.religion_enc),
                                    'bedeutung', sensitive.dec(ps.religion_importance_enc), 'gleiche_religion_noetig', ps.religion_must_match,
                                    'gesundheit', sensitive.dec(ps.health_notes_enc), 'geaendert_am', ps.updated_at)
                                  from sensitive.profile_sensitive ps where ps.user_id = p_user)
    ),
    'ausweispruefungen', (select coalesce(jsonb_agg(to_jsonb(v) - 'user_id' order by v.started_at), '[]'::jsonb)
                          from app.verifications v where v.user_id = p_user),
    'profil', (select to_jsonb(p) - 'user_id' from app.profile_core p where p.user_id = p_user),
    'wuensche', (select coalesce(jsonb_agg(to_jsonb(w) - 'user_id' order by w.created_at), '[]'::jsonb) from app.wants w where w.user_id = p_user),
    'ausschluesse', (select coalesce(jsonb_agg(to_jsonb(d) - 'user_id' order by d.created_at), '[]'::jsonb) from app.dealbreakers d where d.user_id = p_user),
    'gewichte', (select pw.weights from app.personal_weights pw where pw.user_id = p_user),
    'profil_vektor', (select jsonb_build_object('modell', pe.model, 'geaendert_am', pe.updated_at, 'werte', pe.embedding::text::jsonb)
                      from app.profile_embeddings pe where pe.user_id = p_user),
    'freie_zeiten', (select coalesce(jsonb_agg(jsonb_build_object('zeitraum', aw.period_id, 'von', aw.starts_at, 'bis', aw.ends_at)
                                     order by aw.starts_at), '[]'::jsonb)
                     from app.availability_windows aw where aw.user_id = p_user),
    'gespraeche', (select coalesce(jsonb_agg(to_jsonb(s) - 'user_id' - 'room_name'
                                     || jsonb_build_object('transkript', (select t.turns from app.interview_transcripts t where t.session_id = s.id),
                                                           'transkript_loeschung_am', (select t.delete_at from app.interview_transcripts t where t.session_id = s.id))
                                     order by s.created_at), '[]'::jsonb)
                   from app.interview_sessions s where s.user_id = p_user),
    -- Abende nur aus eigener Sicht: keine ID, kein Name und keine Rückmeldung des Gegenübers.
    'abende', (select coalesce(jsonb_agg(jsonb_build_object(
                   'abend', e.id,
                   'zustand', e.state,
                   'beginn', e.starts_at,
                   'bestaetigt_am', e.confirmed_at,
                   'lokal', (select jsonb_build_object('name', ve.name, 'ort', ve.city) from app.venues ve where ve.id = e.venue_id),
                   'warum_sie_beide', (select pr.reasons_text from app.pairings pr where pr.id = e.pairing_id),
                   'zeitvorschlaege', e.proposed_times,
                   'meine_wunschzeiten', case when e.requested_by = p_user then e.requested_times when e.countered_by = p_user then e.countered_times end,
                   'von_mir_abgesagt', e.cancelled_by = p_user,
                   'absagegrund', case when e.cancelled_by = p_user then e.cancel_reason end,
                   'meine_handlungen', (select coalesce(jsonb_agg(jsonb_build_object('ereignis', ev.event, 'zeitpunkt', ev.at) order by ev.at), '[]'::jsonb)
                                        from app.evening_events ev where ev.evening_id = e.id and ev.actor = p_user)
                 ) order by e.created_at), '[]'::jsonb)
               from app.evenings e where p_user in (e.user_a, e.user_b)),
    'rueckmeldungen', (select coalesce(jsonb_agg(to_jsonb(fb) - 'user_id' order by fb.created_at), '[]'::jsonb)
                       from app.feedback fb where fb.user_id = p_user),
    'kontakt_teilen', (select coalesce(jsonb_agg(to_jsonb(cs) - 'user_id' order by cs.consented_at), '[]'::jsonb)
                       from app.contact_shares cs where cs.user_id = p_user),
    'blockiert', (select coalesce(jsonb_agg(jsonb_build_object('am', b.created_at) order by b.created_at), '[]'::jsonb)
                  from app.blocks b where b.blocker = p_user),
    'mitteilungs_abos', (select coalesce(jsonb_agg(jsonb_build_object('plattform', ps.platform, 'erstellt_am', ps.created_at) order by ps.created_at), '[]'::jsonb)
                         from app.push_subscriptions ps where ps.user_id = p_user),
    'abend_teilen', (select coalesce(jsonb_agg(jsonb_build_object('abend', ts.evening_id, 'erstellt_am', ts.created_at,
                                       'gueltig_bis', ts.expires_at, 'zurueckgezogen_am', ts.revoked_at) order by ts.created_at), '[]'::jsonb)
                     from app.trust_shares ts where ts.user_id = p_user),
    'mitgliedschaft', (select to_jsonb(m) - 'user_id' from billing.memberships m where m.user_id = p_user),
    'zeitraeume', (select coalesce(jsonb_agg(to_jsonb(mp) - 'user_id' order by mp.starts_at), '[]'::jsonb)
                   from billing.membership_periods mp where mp.user_id = p_user),
    'kontingent', (select coalesce(jsonb_agg(jsonb_build_object('zeitpunkt', l.at, 'art', l.kind, 'menge', l.amount,
                                   'abend', l.evening_id, 'gueltig_bis', l.expires_at, 'notiz', l.note) order by l.at, l.id), '[]'::jsonb)
                   from billing.evening_ledger l where l.user_id = p_user),
    'verfuegbare_abende', billing.available_evenings(p_user),
    'vertragshandlungen', (select coalesce(jsonb_agg(to_jsonb(ca) - 'user_id' order by ca.at), '[]'::jsonb)
                           from billing.contract_actions ca where ca.user_id = p_user),
    -- Eigene Meldungen ohne die gemeldete Person.
    'meine_meldungen', (select coalesce(jsonb_agg(jsonb_build_object('erstellt_am', r.created_at, 'zusammenhang', r.context,
                                         'art', r.category, 'beschreibung', r.description, 'rueckmeldung_erwuenscht', r.wants_contact,
                                         'stand', r.status) order by r.created_at), '[]'::jsonb)
                        from safety.reports r where r.reporter = p_user),
    'massnahmen', (select coalesce(jsonb_agg(jsonb_build_object('art', s.kind, 'grund', s.reason, 'von', s.starts_at, 'bis', s.ends_at,
                                    'aufgehoben_am', s.lifted_at) order by s.created_at), '[]'::jsonb)
                   from safety.sanctions s where s.user_id = p_user),
    'widersprueche', (select coalesce(jsonb_agg(jsonb_build_object('erstellt_am', ap.created_at, 'text', ap.text, 'stand', ap.status,
                                       'entschieden_am', ap.decided_at, 'begruendung', ap.decision_note) order by ap.created_at), '[]'::jsonb)
                      from safety.appeals ap where ap.user_id = p_user),
    'benachrichtigungen', (select coalesce(jsonb_agg(jsonb_build_object('zeitpunkt', n.at, 'kanal', n.channel, 'vorlage', n.template,
                                            'status', n.status) order by n.at), '[]'::jsonb)
                           from ops.notifications_log n where n.user_id = p_user),
    'warteliste', v_waitlist
  ) into v_result;
  return v_result;
end;
$$;
comment on function app.export_account(uuid) is 'Alle eigenen Daten als JSON (Art. 15/20 DSGVO). Art.-9-Angaben entschlüsselt, nur für die Person selbst.';
revoke execute on function app.export_account(uuid) from public, anon, authenticated;
grant execute on function app.export_account(uuid) to service_role;

create or replace function api.my_export()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000';
  end if;
  insert into ops.audit_log (actor, action, target_table, target_id) values (uid, 'account.exported', 'auth.users', uid::text);
  return app.export_account(uid);
end;
$$;
comment on function api.my_export() is 'Datenexport der angemeldeten Person (für Edge Function account-export und die spätere Store-App).';
grant execute on function api.my_export() to authenticated;

-- ---------------------------------------------------------------------------
-- Löschung, Schritt 1 (vor dem Löschen in Supabase Auth): Protokoll, Vorbereitung, Angaben für die Bestätigungs-Mail.
-- ---------------------------------------------------------------------------
create or replace function ops.account_deletion_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_first text;
  v_form text;
  v_risky boolean;
begin
  select u.email::text into v_email from auth.users u where u.id = p_user;
  if v_email is null then
    raise exception 'Person nicht gefunden' using errcode = 'P0002';
  end if;
  if exists (select 1 from app.admin_users a where a.user_id = p_user) then
    -- Admins entfernt nur ein anderer Admin (sonst sperrt sich Fermata aus).
    raise exception 'Admin-Konten werden nicht selbst gelöscht' using errcode = '42501', hint = 'admin_account';
  end if;
  select f.first_name into v_first from private.account_facts f where f.user_id = p_user;
  select a.address_form into v_form from app.accounts a where a.user_id = p_user;

  update app.accounts set deletion_requested_at = app.now() where user_id = p_user;

  -- Sicherheit: Wer während einer Sperre oder offenen Meldung löscht, hinterlässt Benn die Sperrlisten-Hashes
  -- (ohne Namen, ohne Ausweisnummer), damit über einen Ausschluss noch entschieden werden kann.
  v_risky := safety.is_suspended(p_user)
          or exists (select 1 from safety.reports r where r.reported = p_user and r.status in ('open', 'in_review'));
  if v_risky then
    insert into safety.safety_flags (user_id, source, kind, severity, details)
    select null, 'system', 'konto_geloescht_waehrend_pruefung', 'hoch',
           jsonb_build_object('hashes', coalesce(jsonb_agg(jsonb_build_object('doc_hash', h.doc_hash, 'name_hash', h.name_hash)), '[]'::jsonb),
                              'reports', (select coalesce(jsonb_agg(r.id), '[]'::jsonb) from safety.reports r where r.reported = p_user))
    from safety.verification_hashes h where h.user_id = p_user;
  end if;

  -- Was ohne Fremdschlüssel am Konto hängt: Einladungen (E-Mail im Klartext), Versandprotokoll.
  delete from app.account_invitations where user_id = p_user or email = v_email::extensions.citext;
  delete from ops.notifications_log where user_id = p_user;
  -- Warteliste (M1), falls vorhanden: Eintrag gehört zur Person und wird mitgelöscht.
  if to_regclass('public.waitlist') is not null then
    begin
      execute 'delete from public.waitlist where lower(email::text) = $1' using lower(v_email);
    exception when foreign_key_violation then
      raise notice 'Wartelisten-Eintrag konnte nicht gelöscht werden (Fremdschlüssel).';
    end;
  end if;

  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (p_user, 'account.deletion_requested', 'auth.users', p_user::text, jsonb_build_object('safety_hold', v_risky));

  return jsonb_build_object('email', v_email, 'first_name', v_first, 'address_form', coalesce(v_form, 'sie'));
end;
$$;
comment on function ops.account_deletion_prepare(uuid) is 'Vor der Löschung: Audit, Einladungen/Protokolle entfernen, Sicherheits-Hinweis bei laufender Prüfung.';

-- Löschung, Schritt 2 (nach dem Löschen in Supabase Auth): Nachweis.
create or replace function ops.account_deletion_done(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gone boolean;
begin
  v_gone := not exists (select 1 from auth.users u where u.id = p_user);
  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (null, 'account.deleted', 'auth.users', p_user::text, jsonb_build_object('complete', v_gone));
  return v_gone;
end;
$$;

revoke execute on function ops.account_deletion_prepare(uuid), ops.account_deletion_done(uuid) from public, anon, authenticated;
grant execute on function ops.account_deletion_prepare(uuid), ops.account_deletion_done(uuid) to service_role;
