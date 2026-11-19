const DEFAULT_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const normalizedMonths = (months: number[]) =>
  [...new Set(months)]
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
    .sort((first, second) => first - second);

export function formatMonthRange(months: number[], allMonths = DEFAULT_MONTHS): string {
  const normalized = normalizedMonths(months);
  const normalizedAll = normalizedMonths(allMonths);
  if (!normalized.length) return "Chưa áp dụng";
  if (
    normalized.length === normalizedAll.length &&
    normalized.every((month, index) => month === normalizedAll[index])
  )
    return "Tất cả các tháng";

  const ranges: string[] = [];
  let rangeStart = normalized[0];
  let previous = normalized[0];
  for (const month of normalized.slice(1)) {
    if (month === previous + 1) {
      previous = month;
      continue;
    }
    ranges.push(rangeStart === previous ? `T${rangeStart}` : `T${rangeStart}–T${previous}`);
    rangeStart = month;
    previous = month;
  }
  ranges.push(rangeStart === previous ? `T${rangeStart}` : `T${rangeStart}–T${previous}`);
  return ranges.join(", ");
}

export function formatMonthApplication(months: number[], allMonths = DEFAULT_MONTHS): string {
  const formatted = formatMonthRange(months, allMonths);
  if (formatted === "Tất cả các tháng") return "Áp dụng tất cả các tháng";
  if (formatted === "Chưa áp dụng") return "Chưa áp dụng tháng nào";
  return `Áp dụng ${formatted}`;
}

export function formatMonthSelectionSummary(months: number[], allMonths = DEFAULT_MONTHS): string {
  const normalized = normalizedMonths(months);
  const normalizedAll = normalizedMonths(allMonths);
  if (!normalized.length) return "Chưa chọn tháng nào";
  if (
    normalized.length === normalizedAll.length &&
    normalized.every((month, index) => month === normalizedAll[index])
  )
    return "Tất cả các tháng";
  if (normalized.length === 1) return `Tháng ${normalized[0]}`;

  const isContinuous = normalized.every(
    (month, index) => index === 0 || month === normalized[index - 1] + 1,
  );
  if (isContinuous) return `Tháng ${normalized[0]}–${normalized.at(-1)}`;
  return `${normalized.length} tháng đã chọn`;
}
