// Wege rund um einen Abend an einer Stelle. Teilen, Check-in und Melden baut der Bereich Sicherheit (ui-member-b);
// stimmen dessen Wege am Ende anders, wird nur diese Datei angepasst.
export const eveningLinks = (id: string) => ({
  detail: `/abende/${id}`,
  find: `/abende/${id}/finden`,
  feedback: `/abende/${id}/rueckmeldung`,
  contact: `/abende/${id}/kontakt`,
  debrief: `/gespraech?art=nachbesprechung&abend=${id}`,
  checkin: `/abende/${id}/checkin`,
  share: `/sicherheit/teilen?abend=${id}`,
  report: `/sicherheit/melden?abend=${id}`,
  help: "/hilfe",
});

export const availabilityLink = (periodId?: string | null) => (periodId ? `/zeiten/${periodId}` : "/zeiten");
