import { describe, expect, it } from "vitest";
import {
  formatMonthApplication,
  formatMonthRange,
  formatMonthSelectionSummary,
} from "../utils/month-range";

describe("định dạng phạm vi tháng", () => {
  it("rút gọn đủ 12 tháng", () => {
    expect(formatMonthRange([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe("Tất cả các tháng");
    expect(formatMonthApplication([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(
      "Áp dụng tất cả các tháng",
    );
  });

  it("gộp tháng liên tiếp và giữ tháng rời", () => {
    expect(formatMonthRange([12, 3, 2, 1, 7, 10, 11, 7])).toBe("T1–T3, T7, T10–T12");
    expect(formatMonthApplication([5, 6, 7])).toBe("Áp dụng T5–T7");
  });

  it("hiển thị rõ khi không có tháng", () => {
    expect(formatMonthRange([])).toBe("Chưa áp dụng");
    expect(formatMonthApplication([])).toBe("Chưa áp dụng tháng nào");
  });

  it("tóm tắt phạm vi tháng mà không liệt kê dài", () => {
    expect(formatMonthSelectionSummary([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(
      "Tất cả các tháng",
    );
    expect(formatMonthSelectionSummary([3])).toBe("Tháng 3");
    expect(formatMonthSelectionSummary([3, 4, 5, 6])).toBe("Tháng 3–6");
    expect(formatMonthSelectionSummary([1, 2, 4, 7, 9])).toBe("5 tháng đã chọn");
  });
});
