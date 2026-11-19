import { describe, expect, it } from "vitest";
import type { FormulaOverride } from "../domain/types";
import { replaceFormulaOverrideCoverage } from "../formula/formula-override-utils";

const override = (id: string, months: number[], columnId = "plan"): FormulaOverride => ({
  id,
  projectId: "project-1",
  fieldId: "savingUsd",
  columnId,
  year: 2026,
  months,
  formula: {
    id: `formula-${id}`,
    columnId,
    ast: { kind: "literal", value: Number(id.replace(/\D/g, "")) || 1 },
    businessExpression: String(Number(id.replace(/\D/g, "")) || 1),
    internalExpression: String(Number(id.replace(/\D/g, "")) || 1),
  },
});

describe("formula override coverage", () => {
  it("chỉ thay tháng giao nhau và giữ công thức cũ cho các tháng còn lại", () => {
    const result = replaceFormulaOverrideCoverage(
      [override("old", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
      [override("new", [5])],
    );

    expect(result).toEqual([
      override("old", [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]),
      override("new", [5]),
    ]);
  });

  it("không ảnh hưởng cấu hình của cột khác", () => {
    const actual = override("actual", [1, 2, 3], "actual");
    const result = replaceFormulaOverrideCoverage(
      [actual, override("plan", [1, 2, 3])],
      [override("new", [2])],
    );

    expect(result).toContainEqual(actual);
    expect(result).toContainEqual(override("plan", [1, 3]));
  });

  it("thay toàn bộ override đang được chỉnh sửa", () => {
    const result = replaceFormulaOverrideCoverage(
      [override("editing", [1, 2, 3]), override("other", [4, 5])],
      [override("editing", [6])],
      "editing",
    );

    expect(result).toEqual([override("other", [4, 5]), override("editing", [6])]);
  });
});
