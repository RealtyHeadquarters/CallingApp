// UPPER_SNAKE enum value -> "Title Case" for human-readable exports/reports.
export function titleCaseEnum(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
