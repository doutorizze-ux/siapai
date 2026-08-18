export const SEMESTER_PLAN_DESCRIPTION =
  "Plano semestral. Acesso válido até o fim do semestre-calendário em que o pagamento for confirmado.";

function brazilCalendarParts(referenceDate: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
  });
  const parts = formatter.formatToParts(referenceDate);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: valueFor("year"), month: valueFor("month") };
}

/**
 * O plano é semestral por calendário escolar, e não por seis meses corridos.
 * Janeiro a junho vencem em 30/06; julho a dezembro vencem em 31/12.
 */
export function getSemesterExpiryDate(referenceDate = new Date()): string {
  const { year, month } = brazilCalendarParts(referenceDate);
  return month <= 6 ? `${year}-06-30` : `${year}-12-31`;
}

export function getSemesterExpiryLabel(referenceDate = new Date()): string {
  const [year, month, day] = getSemesterExpiryDate(referenceDate).split("-");
  return `${day}/${month}/${year}`;
}
