// Formulare der Sicherheit: Sanktion verhängen, aufheben, Widerspruch entscheiden, Hinweis erledigen.
import { decideAppealAction, imposeSanctionAction, liftSanctionAction, reviewFlagAction } from "@/app/admin/_actions/safety";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, Notice, RadioGroup, Select, TextArea } from "@/components/ui";
import { adminSafety as c } from "@/copy/admin-sicherheit";

export function ImposeSanctionForm({ userId, reportId }: { userId: string; reportId?: string | null }) {
  return (
    <ActionForm
      action={imposeSanctionAction}
      submitLabel={c.sanction.submit}
      variant="danger"
      errors={c.errors}
      resetOnSuccess
      confirm={{ title: c.sanction.dialogTitle, text: c.sanction.dialogText, confirmLabel: c.sanction.confirm, danger: true }}
    >
      <input type="hidden" name="user_id" value={userId} />
      {reportId ? <input type="hidden" name="report_id" value={reportId} /> : null}
      <Select
        label={c.sanction.kind}
        name="kind"
        defaultValue="hinweis"
        options={Object.entries(c.sanction.kinds).map(([value, label]) => ({ value, label }))}
      />
      <TextArea label={c.sanction.reason} hint={c.sanction.reasonHint} name="reason" rows={3} className="textarea--plain" required minLength={3} maxLength={2000} />
      <Field label={c.sanction.endsAt} hint={c.sanction.endsAtHint} name="ends_at" type="datetime-local" />
      <Notice tone="info">{c.sanction.exclusionNote}</Notice>
      <p className="muted text-sm">{c.sanction.provisionalNote}</p>
    </ActionForm>
  );
}

export function LiftSanctionForm({ sanctionId, compact }: { sanctionId: string; compact?: boolean }) {
  return (
    <ActionForm
      action={liftSanctionAction}
      submitLabel={c.lift.submit}
      variant="secondary"
      size="sm"
      errors={c.errors}
      className={compact ? "inline-form" : undefined}
      confirm={{ title: c.lift.dialogTitle, text: c.lift.dialogText, confirmLabel: c.lift.confirm }}
    >
      <input type="hidden" name="sanction_id" value={sanctionId} />
      <Field label={c.lift.reason} name="reason" required minLength={3} maxLength={500} />
    </ActionForm>
  );
}

export function DecideAppealForm({ appealId }: { appealId: string }) {
  return (
    <ActionForm
      action={decideAppealAction}
      submitLabel={c.appeals.submit}
      errors={c.errors}
      confirm={{ title: c.appeals.dialogTitle, text: c.appeals.dialogText, confirmLabel: c.appeals.confirm }}
    >
      <input type="hidden" name="appeal_id" value={appealId} />
      <RadioGroup
        legend={c.appeals.decision}
        name="decision"
        options={Object.entries(c.appeals.decisions).map(([value, label]) => ({ value, label }))}
        required
      />
      <TextArea label={c.appeals.note} name="note" rows={3} className="textarea--plain" required minLength={3} maxLength={2000} />
    </ActionForm>
  );
}

export function ReviewFlagForm({ flagId }: { flagId: string }) {
  return (
    <ActionForm action={reviewFlagAction} submitLabel={c.flags.review} variant="secondary" size="sm" errors={c.errors} className="inline-form">
      <input type="hidden" name="flag_id" value={flagId} />
      <Field label={c.flags.outcome} name="outcome" required minLength={2} maxLength={500} />
    </ActionForm>
  );
}
