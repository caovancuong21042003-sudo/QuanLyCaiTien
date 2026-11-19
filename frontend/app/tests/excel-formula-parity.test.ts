import { expect, it } from "vitest";
import { EXCEL_2026_PROJECTS } from "../data/excel-2026-seed";
import { EXCEL_2026_FORMULA_DATA } from "../data/excel-2026-formula-data";
import { createSeedState, DEMO_YEAR, EXCEL_2026_SOURCE_ROW_ORDER } from "../data/seed";
import { templateFormulaForProject } from "../domain/metadata";
import { FormulaEngine } from "../formula/formula-engine";

it("tính lại đúng mọi ô kết quả tháng của 48 dự án Excel", () => {
  const state = createSeedState();
  const engine = new FormulaEngine(state);
  const sourceByRow = new Map(EXCEL_2026_PROJECTS.map((item) => [item.sourceRow, item]));
  const formulaSourceByRow = new Map(EXCEL_2026_FORMULA_DATA.map((item) => [item.sourceRow, item]));
  const mismatches: unknown[] = [];
  state.projects.forEach((project, projectIndex) => {
    const sourceRow = EXCEL_2026_SOURCE_ROW_ORDER[projectIndex];
    const source = sourceByRow.get(sourceRow)!;
    const formulaSource = formulaSourceByRow.get(sourceRow)!;
    const projectOverride = state.projectFormulaOverrides.find(
      (item) => item.projectId === project.id && item.fieldId === "targetMonthlySaving",
    );
    const effectiveKind = projectOverride
      ? projectOverride.formula.ast.kind === "literal"
        ? "constant"
        : "formula"
      : templateFormulaForProject(state, project.id, "targetMonthlySaving", "plan")
        ? "formula"
        : undefined;
    if (effectiveKind !== (formulaSource.targetFormula ? "formula" : "constant"))
      mismatches.push({
        sourceRow,
        field: "targetMonthlySaving",
        expectedKind: formulaSource.targetFormula ? "formula" : "constant",
        actualKind: effectiveKind,
      });
    const targetResult = engine.calculate(project.id, "targetMonthlySaving", DEMO_YEAR, 1, "plan");
    const targetActual = targetResult.value.kind === "scalar" ? targetResult.value.value : null;
    if (
      source.targetSaving !== targetActual &&
      !(
        typeof source.targetSaving === "number" &&
        typeof targetActual === "number" &&
        Math.abs(source.targetSaving - targetActual) < 1e-8
      )
    )
      mismatches.push({
        sourceRow,
        field: "targetMonthlySaving",
        expected: source.targetSaving,
        actual: targetActual,
      });
    (["plan", "actual"] as const).forEach((columnId) => {
      const expectedValues = columnId === "plan" ? source.planSaving : source.actualSaving;
      const expectedFormulas =
        columnId === "plan" ? formulaSource.resultPlanFormulas : formulaSource.resultActualFormulas;
      expectedValues.forEach((expected, monthIndex) => {
        const configuredOverride = state.formulaOverrides.find(
          (item) =>
            item.projectId === project.id &&
            item.fieldId === "savingUsd" &&
            item.columnId === columnId &&
            item.months.includes(monthIndex + 1),
        );
        const expectedKind = expectedFormulas[monthIndex]
          ? "formula"
          : expected !== null
            ? "constant"
            : undefined;
        const configuredKind = configuredOverride
          ? configuredOverride.formula.ast.kind === "literal"
            ? "constant"
            : "formula"
          : undefined;
        if (configuredKind !== expectedKind)
          mismatches.push({
            sourceRow,
            columnId,
            month: monthIndex + 1,
            expectedKind,
            actualKind: configuredKind,
          });
        const result = engine.calculate(
          project.id,
          "savingUsd",
          DEMO_YEAR,
          monthIndex + 1,
          columnId,
        );
        const actual = result.value.kind === "scalar" ? result.value.value : null;
        if (
          expected !== actual &&
          !(
            typeof expected === "number" &&
            typeof actual === "number" &&
            Math.abs(expected - actual) < 1e-8
          )
        )
          mismatches.push({ sourceRow, columnId, month: monthIndex + 1, expected, actual });
      });
    });
  });
  expect(mismatches).toEqual([]);
});
