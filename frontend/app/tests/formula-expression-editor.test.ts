import { describe, expect, it } from "vitest";
import { tokenContent } from "../components/formula-builder/FormulaExpressionEditor";
import { createSeedState } from "../data/seed";
import { metricRef } from "../formula/ast";
import { astToTokens, formulaToTokens } from "../formula/ast-utils";
import { parseFormula } from "../formula/parser";

describe("formula expression editor", () => {
  it("hiển thị metricReference thành chip nghiệp vụ khi mở lại công thức tổng hợp", () => {
    const state = createSeedState();
    const tokens = astToTokens(
      metricRef("savingUsd", "plan", { kind: "current" }, "filtered"),
      state,
    );

    const content = tokenContent(tokens);
    const reference = content.content[0].content[0];

    expect(reference.type).toBe("formulaReference");
    if (!("attrs" in reference)) throw new Error("Metric chưa được chuyển thành formulaReference.");
    expect(reference.attrs).toMatchObject({
      fieldId: "savingUsd",
      columnId: "plan",
      period: "current",
      projectScope: "filtered",
      rawReference: "metric:savingUsd|plan|current|filtered",
      label: "[Hiệu quả · Kế hoạch · Tháng hiện tại · Các dự án theo bộ lọc]",
    });
  });

  it("giữ nguyên rawReference để lưu lại không biến metric thành fieldReference", () => {
    const content = tokenContent([
      {
        raw: "[metric:savingUsd|actual|ytd|all]",
        label: "[Hiệu quả · Thực tế · Từ đầu năm đến hiện tại · Tất cả dự án]",
      },
    ]);

    const reference = content.content[0].content[0];
    if (!("attrs" in reference)) throw new Error("Metric chưa được chuyển thành formulaReference.");
    expect(reference.attrs.rawReference).toBe("metric:savingUsd|actual|ytd|all");
  });

  it("không tự bọc ngoặc quanh các phép toán đã rõ thứ tự", () => {
    const state = createSeedState();
    const ast = parseFormula("[ref:productionQty] * 2 / 100");
    const source = astToTokens(ast, state)
      .map((token) => token.raw)
      .join(" ");

    expect(source).toBe("[ref:productionQty] * 2 / 100");
  });

  it("giữ cặp ngoặc do người dùng chủ động nhập", () => {
    const state = createSeedState();
    const internalExpression = "([ref:productionQty] * 2) / 100";
    const tokens = formulaToTokens(
      {
        id: "explicit-parentheses",
        ast: parseFormula(internalExpression),
        internalExpression,
        businessExpression: "",
        preserveUserParentheses: true,
      },
      state,
    );

    expect(tokens.map((token) => token.raw).join("")).toBe(internalExpression);
  });

  it("chỉ thêm ngoặc khi AST cần bảo toàn thứ tự tính", () => {
    const state = createSeedState();
    const ast = parseFormula("([ref:productionQty] + 2) * 100");
    const source = astToTokens(ast, state)
      .map((token) => token.raw)
      .join(" ");

    expect(source).toBe("( [ref:productionQty] + 2 ) * 100");
  });
});
