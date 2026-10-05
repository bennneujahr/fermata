-- Fermata · M5: Ausführungsrechte der Funktionen aus 0510–0560 (und der Kern-Funktionen der Abende).
--
-- Hintergrund: In Postgres darf PUBLIC jede neue Funktion ausführen. Die schema-bezogenen Standardrechte
-- der Grundmigration („alter default privileges in schema … revoke execute … from public“) können das
-- nicht entziehen – schema-bezogene Standardrechte ergänzen die globalen nur. Ohne diese Migration könnten
-- angemeldete Mitglieder z. B. app.evening_transition() oder app.contact_share_for() direkt über die API
-- (Schema app ist freigegeben) aufrufen. Deshalb hier ausdrücklich: PUBLIC und anon verlieren das Recht;
-- Mitglieder-RPCs in api sind je Funktion an authenticated vergeben, Jobs laufen als service_role.
-- Offener Punkt für den Kern (docs/bereiche/abende.md): dasselbe für alle übrigen Funktionen prüfen.

do $$
declare
  f record;
  v_names text[] := array[
    'api.admin_create_availability_period',
    'api.admin_create_slots',
    'api.admin_create_venue',
    'api.admin_delete_slot',
    'api.admin_resolve_evening',
    'api.admin_set_venue_active',
    'api.admin_update_slot',
    'api.admin_update_venue',
    'api.admin_venue_slots',
    'api.admin_venues',
    'api.debrief_offer',
    'api.delete_push_subscription',
    'api.evening_cancel',
    'api.evening_confirm',
    'api.evening_counter',
    'api.evening_decline',
    'api.evening_detail',
    'api.evening_find_info',
    'api.evening_request_time',
    'api.evening_time_options',
    'api.my_availability',
    'api.my_availability_periods',
    'api.my_contact_share',
    'api.my_evenings',
    'api.my_push_subscriptions',
    'api.save_push_subscription',
    'api.set_availability',
    'api.set_recognition_hint',
    'api.submit_feedback',
    'app.availability_can_answer',
    'app.availability_eligible',
    'app.berlin_at',
    'app.contact_share_for',
    'app.debrief_minutes',
    'app.debrief_offer_for',
    'app.evening_after_transition',
    'app.evening_cancel_deadlines',
    'app.evening_check_active',
    'app.evening_check_reason',
    'app.evening_check_times',
    'app.evening_duration',
    'app.evening_feedback_open',
    'app.evening_flag',
    'app.evening_for_member',
    'app.evening_handle_deadline',
    'app.evening_my_action',
    'app.evening_my_deadline',
    'app.evening_notify',
    'app.evening_on_insert',
    'app.evening_other',
    'app.evening_period_id',
    'app.evening_release_slot',
    'app.evening_reserve_slot',
    'app.evening_resolve_outcome',
    'app.evening_safety_hold',
    'app.evening_schedule_answer',
    'app.evening_schedule_confirmed',
    'app.evening_schedule_deadline_reminder',
    'app.evening_time_options',
    'app.evening_try_release_contacts',
    'app.generate_table_code',
    'app.iso_utc',
    'app.jsonb_to_times',
    'app.m5_fail',
    'app.m5_require_admin',
    'app.member_first_name',
    'app.times_to_jsonb',
    'app.venue_apply',
    'app.venue_notify',
    'app.venue_public',
    'ops.availability_send_requests',
    'ops.availability_tick',
    'ops.create_availability_period',
    'ops.enqueue_notification',
    'ops.log_notification',
    'ops.notification_context',
    'ops.notify_after_sent',
    'ops.notify_claim',
    'ops.notify_complete',
    'ops.notify_finish_if_done',
    'ops.notify_kick',
    'ops.process_evening_deadlines',
    'ops.purge_evening_data',
    'ops.push_subscription_result',
    'ops.quiet_hours_end',
    'ops.schedule_evening_jobs',
    'ops.venue_confirm_reservation',
    'ops.venue_reservation_summary',
    'app.evening_transition',
    'app.shared_windows'
  ];
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname || '.' || p.proname) = any (v_names)
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end
$$;

-- Reine Zeit-Helfer dürfen alle Angemeldeten nutzen (keine Daten).
grant execute on function app.berlin_at(date, time), app.iso_utc(timestamptz), app.times_to_jsonb(timestamptz[]),
  app.jsonb_to_times(jsonb) to authenticated, service_role;
-- Jobs und Edge Functions
grant execute on function app.evening_transition(uuid, text, uuid, jsonb) to service_role;

-- Abstimmung mit der Integration: PUBLIC verliert das Ausführungsrecht für alle Funktionen in app, api und ops.
-- Was Mitglieder, Jobs oder die Auswahl aufrufen sollen, hat ein ausdrückliches grant (authenticated,
-- service_role über die Standardrechte, fermata_matcher, fermata_agent).
revoke execute on all functions in schema app, api, ops from public;
