// Gemeinsamer Rückgabewert der Server Actions (für useActionState).
export interface ActionState {
  ok?: boolean;
  /** Fehlerschlüssel (hint aus der Datenbank oder eigener Schlüssel), Text kommt aus src/copy. */
  error?: string;
  fields?: Record<string, string>;
  /** Eingaben zurückgeben, damit das Formular nach einem Fehler gefüllt bleibt. */
  values?: Record<string, string>;
  message?: string;
}

export const initialState: ActionState = {};
