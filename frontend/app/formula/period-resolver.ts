import type { PeriodSelector } from "./ast";

export interface PeriodResolution {
  months: number[];
  outOfRange: boolean;
}

export function resolvePeriod(
  period: PeriodSelector | undefined,
  currentMonth: number,
): PeriodResolution {
  // Period được giải quyết tập trung tại đây để mọi reference dùng chung quy tắc biên tháng;
  // evaluator chỉ cần xử lý giá trị Scalar và Series.
  const selector = period ?? { kind: "current" as const };
  let months: number[];
  switch (selector.kind) {
    case "current":
      months = [currentMonth];
      break;
    case "previous":
      months = [currentMonth - 1];
      break;
    case "next":
      months = [currentMonth + 1];
      break;
    case "offset":
      months = [currentMonth + selector.amount];
      break;
    case "specific":
      months = [selector.month];
      break;
    case "range":
      months = Array.from(
        { length: selector.to - selector.from + 1 },
        (_, index) => selector.from + index,
      );
      break;
    case "selected":
      months = [...selector.months];
      break;
    case "even":
      months = [2, 4, 6, 8, 10, 12];
      break;
    case "odd":
      months = [1, 3, 5, 7, 9, 11];
      break;
    case "ytd":
      months = Array.from({ length: currentMonth }, (_, index) => index + 1);
      break;
  }
  return { months, outOfRange: months.some((month) => month < 1 || month > 12) };
}
