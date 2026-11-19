import { describe, expect, it } from "vitest";
import {
  analyzeParentheses,
  completeMissingClosingParentheses,
} from "../formula/formula-validation";

describe("kiểm tra dấu ngoặc công thức", () => {
  it("nhận biết công thức đã cân bằng", () => {
    expect(analyzeParentheses("ROUND(([a] + 2) / 3)").balanced).toBe(true);
  });

  it("đếm dấu đóng còn thiếu và tự bổ sung ở cuối", () => {
    const result = completeMissingClosingParentheses("ROUND(([a] + 2");
    expect(result).toEqual({ source: "ROUND(([a] + 2))", addedCount: 2 });
  });

  it("không tự sửa khi có dấu đóng thừa", () => {
    const analysis = analyzeParentheses("([a] + 2))");
    expect(analysis.unexpectedClosingIndexes).toEqual([9]);
    expect(completeMissingClosingParentheses("([a] + 2))").addedCount).toBe(0);
  });

  it("bỏ qua dấu ngoặc nằm trong chuỗi và reference", () => {
    expect(analyzeParentheses('IF(TRUE, "Nội dung (mẫu)", [ref:field(code)])').balanced).toBe(true);
  });
});
