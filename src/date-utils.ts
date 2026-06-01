export function isoFromLocalDate(date = new Date()) {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

export function addCalendarDays(dateIso: string, days: number) {
  const date = localDateFromIso(dateIso);
  date.setDate(date.getDate() + days);
  return isoFromLocalDate(date);
}

export function localDateFromIso(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function yearFromIsoDate(dateIso: string) {
  const [year] = dateIso.split("-");
  return year || String(new Date().getFullYear());
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
