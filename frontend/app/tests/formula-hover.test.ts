import { describe, expect, it } from "vitest";
import { buildFormulaHoverContent } from "../components/formula-hover/useFormulaHoverCard";
import { createSeedState } from "../data/seed";
import { binary, ref } from "../formula/ast";
import { FormulaEngine } from "../formula/formula-engine";

describe("Formula hover", () => {
  it("hiển thị giá trị tham chiếu và kết quả với tiền tố, hậu tố theo dự án", () => {
    const state = createSeedState();
    const project = state.projects[0];
    const field = state.fieldDefinitions.find((item) => item.code === "targetMonthlySaving");
    expect(project).toBeDefined();
    expect(field).toBeDefined();
    if (!project || !field) return;
    state.projectFormulaOverrides = state.projectFormulaOverrides.filter(
      (item) => !(item.projectId === project.id && item.fieldId === field.id),
    );
    const reductionField = state.fieldDefinitions.find(
      (item) => item.code === "targetMonthlyReduction",
    );
    expect(reductionField).toBeDefined();
    if (!reductionField) return;
    reductionField.inputMode = "formula";
    reductionField.formula = {
      id: "formula-test-reduction",
      ast: binary("-", ref("baselineCycle"), ref("targetCycle")),
      internalExpression: "([ref:baselineCycle] - [ref:targetCycle])",
      businessExpression: "([Hiện trạng] - [Mục tiêu đạt được])",
    };
    const reductionValue = state.fieldValues.find(
      (item) => item.projectId === project.id && item.fieldId === reductionField.id,
    )!;
    reductionValue.value = {
      numericValue: 0.0005,
      leftNote: "Mức giảm",
      rightNote: "%/tháng",
    };
    const savingValue = state.fieldValues.find(
      (item) => item.projectId === project.id && item.fieldId === field.id,
    )!;
    savingValue.value = { numericValue: 106.20012, rightNote: "USD/tháng" };

    const engine = new FormulaEngine(state);
    const formula = engine.formulaExpression(
      project.id,
      field.id,
      state.selectedYear,
      12,
      "actual",
    );
    const result = engine.calculate(project.id, field.id, state.selectedYear, 12, "actual");
    const content = buildFormulaHoverContent({
      formula,
      result,
      state,
      projectId: project.id,
      resultField: field,
    });

    const expectedReductionLabel =
      state.projectFieldConfigs.find(
        (config) => config.projectId === project.id && config.fieldId === reductionField.id,
      )?.displayLabel ?? reductionField.label;
    expect(content?.inputs?.some((item) => item.label === expectedReductionLabel)).toBe(true);
    expect(content?.inputs?.some((item) => item.value.includes("Mức giảm"))).toBe(true);
    expect(content?.inputs?.some((item) => item.value.includes("%/tháng"))).toBe(true);
    expect(content?.inputs?.some((item) => item.label === "Hiện trạng")).toBe(false);
    expect(content?.inputs?.some((item) => item.label === "Mục tiêu đạt được")).toBe(false);
    expect(content?.result).toContain("USD/tháng");
  });
});
