import { describe, expect, it } from "vitest";
import { createSeedState } from "../data/seed";
import { monthlyFieldForSummaryMetric } from "../domain/metadata";
import { FormulaEngine } from "../formula/formula-engine";
import { parseFormula } from "../formula/parser";
import { migrateState } from "../repositories/local-storage-repository";

describe("cấu hình tổng hợp", () => {
  it("ghi đè Không tổng hợp loại dự án khỏi chỉ tiêu kế thừa từ mẫu", () => {
    const state = createSeedState();
    const project = state.projects.find(
      (candidate) => monthlyFieldForSummaryMetric(state, candidate.id, "savingUsd") != null,
    )!;
    const inheritedField = monthlyFieldForSummaryMetric(state, project.id, "savingUsd")!;

    const existing = state.projectMonthlyFieldConfigs.find(
      (config) => config.projectId === project.id && config.fieldId === inheritedField.id,
    );
    if (existing) existing.summaryMetricId = null;
    else
      state.projectMonthlyFieldConfigs.push({
        projectId: project.id,
        fieldId: inheritedField.id,
        summaryMetricId: null,
      });

    expect(monthlyFieldForSummaryMetric(state, project.id, "savingUsd")).toBeUndefined();
  });

  it("tổng hợp field riêng của dự án qua metricId thay vì dựa vào tên field", () => {
    const state = createSeedState();
    const project = state.projects[0];
    const source = state.fieldDefinitions.find((field) => field.id === "savingUsd")!;
    const privateField = {
      ...structuredClone(source),
      id: "private-saving-for-project-1",
      code: "privateSavingForProject1",
      label: "Giá trị cải tiến riêng",
      projectId: project.id,
      inputMode: "manual" as const,
      formula: undefined,
      columnFormulas: undefined,
    };
    state.fieldDefinitions.push(privateField);
    const inheritedSavingConfig = state.projectMonthlyFieldConfigs.find(
      (config) => config.projectId === project.id && config.fieldId === "savingUsd",
    );
    if (inheritedSavingConfig) inheritedSavingConfig.summaryMetricId = null;
    else
      state.projectMonthlyFieldConfigs.push({
        projectId: project.id,
        fieldId: "savingUsd",
        summaryMetricId: null,
      });
    state.projectMonthlyFieldConfigs.push({
      projectId: project.id,
      fieldId: privateField.id,
      visible: true,
      summaryMetricId: "savingUsd",
      allowedColumnIds: state.monthlyColumns.map((column) => column.id),
    });
    state.monthlyValues.push({
      projectId: project.id,
      fieldId: privateField.id,
      year: state.selectedYear,
      month: 1,
      columnId: "actual",
      value: 123,
    });

    const engine = new FormulaEngine(state, { filteredProjectIds: [project.id] });
    const result = engine.calculateSummaryRowAtMonth(
      project.id,
      "summary-row-total",
      "savingUsd",
      state.selectedYear,
      1,
      "actual",
    );

    expect(result.state).toBe("Value");
    expect(result.value).toEqual({ kind: "scalar", value: 123 });
    expect(result.trace.some((entry) => entry.fieldId === privateField.id)).toBe(true);
  });

  it("tạo Tổng năm và Tổng cộng dưới dạng metadata mặc định", () => {
    const state = createSeedState();

    expect(state.summaryColumns).toEqual([
      expect.objectContaining({
        code: "annualTotal",
        label: "Tổng năm",
        months: state.periods.map((period) => period.month),
        columnIds: state.monthlyColumns.map((column) => column.id),
        enabled: true,
      }),
    ]);
    expect(state.summaryRows[0]).toEqual(
      expect.objectContaining({
        code: "grandTotal",
        label: "Tổng cộng",
        showInMonthlyColumns: true,
        summaryColumnIds: ["summary-column-year"],
        enabled: true,
      }),
    );
    expect(state.summaryRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "cumulativeTotal",
          label: "Lũy kế",
          showInMonthlyColumns: true,
          summaryColumnIds: ["summary-column-year"],
        }),
      ]),
    );
    expect(state.summaryFormulas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetKind: "column",
          summaryId: "summary-column-year",
          metricId: "savingUsd",
          columnId: "actual",
        }),
        expect.objectContaining({
          targetKind: "row",
          summaryId: "summary-row-total",
          metricId: "savingUsd",
          columnId: "actual",
        }),
      ]),
    );
    const monthlyTotal = state.summaryFormulas.find(
      (formula) =>
        formula.targetKind === "row" &&
        formula.metricId === "savingUsd" &&
        formula.columnId === "actual",
    );
    expect(monthlyTotal?.formula.ast).toMatchObject({
      kind: "function",
      args: [expect.objectContaining({ projectScope: "filtered" })],
    });
    const cumulativeTotal = state.summaryFormulas.find(
      (formula) =>
        formula.targetKind === "row" &&
        formula.summaryId === "summary-row-cumulative" &&
        formula.metricId === "savingUsd" &&
        formula.columnId === "actual",
    );
    expect(cumulativeTotal?.formula.ast).toMatchObject({
      kind: "function",
      args: [expect.objectContaining({ period: { kind: "ytd" }, projectScope: "filtered" })],
    });
  });

  it("schema 23 thiếu dữ liệu được bổ sung dòng lũy kế mà không sửa dòng tổng cộng", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 23;
    legacy.summaryRows = legacy.summaryRows.filter((row) => row.code !== "cumulativeTotal");
    legacy.summaryFormulas = legacy.summaryFormulas.filter(
      (formula) => formula.summaryId !== "summary-row-cumulative",
    );

    const migrated = migrateState(legacy);

    expect(migrated.summaryRows.some((row) => row.code === "grandTotal")).toBe(true);
    expect(migrated.summaryRows.some((row) => row.code === "cumulativeTotal")).toBe(true);
    expect(
      migrated.summaryFormulas.some(
        (formula) =>
          formula.summaryId === "summary-row-cumulative" &&
          formula.formula.ast.kind === "function" &&
          formula.formula.ast.args[0]?.kind === "metricReference" &&
          formula.formula.ast.args[0].period?.kind === "ytd",
      ),
    ).toBe(true);
  });

  it("lũy kế hiệu quả bằng tổng các dòng tổng cộng từ T1 đến tháng hiện tại", () => {
    const state = createSeedState();
    const projectIds = state.projects
      .filter((project) => project.year === state.selectedYear)
      .map((project) => project.id);
    const engine = new FormulaEngine(state, { filteredProjectIds: projectIds });

    for (const columnId of ["plan", "actual"]) {
      const totalFormula = state.summaryFormulas.find(
        (item) =>
          item.targetKind === "row" &&
          item.summaryId === "summary-row-total" &&
          item.metricId === "savingUsd" &&
          item.columnId === columnId,
      )!;
      const cumulativeFormula = state.summaryFormulas.find(
        (item) =>
          item.targetKind === "row" &&
          item.summaryId === "summary-row-cumulative" &&
          item.metricId === "savingUsd" &&
          item.columnId === columnId,
      )!;
      let expected = 0;

      for (let month = 1; month <= 12; month += 1) {
        const monthly = engine.evaluate(
          projectIds[0] ?? "",
          totalFormula.formula.ast,
          state.selectedYear,
          month,
          columnId,
        );
        const cumulative = engine.evaluate(
          projectIds[0] ?? "",
          cumulativeFormula.formula.ast,
          state.selectedYear,
          month,
          columnId,
        );
        const monthlyValue = monthly.value.kind === "scalar" ? monthly.value.value : null;
        const cumulativeValue = cumulative.value.kind === "scalar" ? cumulative.value.value : null;
        if (typeof monthlyValue === "number") expected += monthlyValue;
        expect(cumulativeValue).toBeCloseTo(expected, 8);
      }
    }
  });

  it("tham chiếu kết quả tổng hợp để tính chênh lệch lũy kế theo tháng và Tổng năm", () => {
    const state = createSeedState();
    const projectIds = state.projects
      .filter((project) => project.year === state.selectedYear)
      .map((project) => project.id);
    const engine = new FormulaEngine(state, { filteredProjectIds: projectIds });
    const projectId = projectIds[0] ?? "";

    for (let month = 1; month <= 12; month += 1) {
      const plan = engine.calculateSummaryRowAtMonth(
        projectId,
        "summary-row-cumulative",
        "savingUsd",
        state.selectedYear,
        month,
        "plan",
      );
      const actual = engine.calculateSummaryRowAtMonth(
        projectId,
        "summary-row-cumulative",
        "savingUsd",
        state.selectedYear,
        month,
        "actual",
      );
      const variance = engine.calculateSummaryRowAtMonth(
        projectId,
        "summary-row-cumulative-variance",
        "savingUsd",
        state.selectedYear,
        month,
        "actual",
      );
      const planValue = plan.value.kind === "scalar" ? Number(plan.value.value) : 0;
      const actualValue = actual.value.kind === "scalar" ? Number(actual.value.value) : 0;
      const varianceValue = variance.value.kind === "scalar" ? Number(variance.value.value) : 0;
      expect(varianceValue).toBeCloseTo(actualValue - planValue, 8);
    }

    const annualVariance = engine.calculateSummaryRowAtSummaryColumn(
      projectId,
      "summary-row-cumulative-variance",
      "savingUsd",
      state.selectedYear,
      "summary-column-year",
      "actual",
    );
    const annualPlan = engine.calculateSummaryRowAtSummaryColumn(
      projectId,
      "summary-row-cumulative",
      "savingUsd",
      state.selectedYear,
      "summary-column-year",
      "plan",
    );
    const annualActual = engine.calculateSummaryRowAtSummaryColumn(
      projectId,
      "summary-row-cumulative",
      "savingUsd",
      state.selectedYear,
      "summary-column-year",
      "actual",
    );
    const annualPlanValue = annualPlan.value.kind === "scalar" ? Number(annualPlan.value.value) : 0;
    const annualActualValue =
      annualActual.value.kind === "scalar" ? Number(annualActual.value.value) : 0;
    const annualVarianceValue =
      annualVariance.value.kind === "scalar" ? Number(annualVariance.value.value) : 0;
    expect(annualVarianceValue).toBeCloseTo(annualActualValue - annualPlanValue, 8);
  });

  it("đọc được cú pháp reference tổng hợp và chặn vòng lặp", () => {
    const ast = parseFormula(
      "[summary:row|summary-row-cumulative|savingUsd|actual] - [summary:row|summary-row-cumulative|savingUsd|plan]",
    );
    expect(ast).toMatchObject({
      kind: "binary",
      left: { kind: "summaryReference", summaryKind: "row", columnId: "actual" },
      right: { kind: "summaryReference", summaryKind: "row", columnId: "plan" },
    });

    const state = createSeedState();
    const variance = state.summaryFormulas.find(
      (item) => item.id === "summary-formula-cumulative-variance-saving-actual",
    )!;
    variance.formula.ast = {
      kind: "summaryReference",
      summaryKind: "row",
      summaryId: "summary-row-cumulative-variance",
      metricId: "savingUsd",
      columnId: "actual",
    };
    const engine = new FormulaEngine(state);
    const result = engine.calculateSummaryRowAtMonth(
      state.projects[0]?.id ?? "",
      "summary-row-cumulative-variance",
      "savingUsd",
      state.selectedYear,
      1,
      "actual",
    );
    expect(result).toMatchObject({ state: "Error", errorCode: "CircularDependency" });
  });

  it("schema 24 được bổ sung dòng chênh lệch lũy kế", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 24;
    legacy.summaryRows = legacy.summaryRows.filter((row) => row.code !== "cumulativeVariance");
    legacy.summaryFormulas = legacy.summaryFormulas.filter(
      (formula) => formula.summaryId !== "summary-row-cumulative-variance",
    );

    const migrated = migrateState(legacy);

    expect(migrated.summaryRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "cumulativeVariance" })]),
    );
    expect(
      migrated.summaryFormulas.some(
        (formula) =>
          formula.summaryId === "summary-row-cumulative-variance" &&
          formula.formula.ast.kind === "binary",
      ),
    ).toBe(true);
  });

  it("schema 20 tự bật dòng tổng hợp cho các cột tổng hợp đã có", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 20;
    legacy.summaryRows = legacy.summaryRows.map((row) => ({
      ...row,
      summaryColumnIds: [],
    }));

    const migrated = migrateState(legacy);

    expect(migrated.summaryRows[0].summaryColumnIds).toEqual(["summary-column-year"]);
  });

  it("chuyển tổng cộng mặc định của schema 19 sang phạm vi theo bộ lọc", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 19;
    const formula = legacy.summaryFormulas.find(
      (item) =>
        item.targetKind === "row" && item.metricId === "savingUsd" && item.columnId === "actual",
    )!;
    const reference = formula.formula.ast.kind === "function" ? formula.formula.ast.args[0] : null;
    if (reference?.kind === "metricReference") reference.projectScope = "all";

    const migrated = migrateState(legacy);
    const migratedFormula = migrated.summaryFormulas.find((item) => item.id === formula.id)!;
    expect(migratedFormula.formula.ast).toMatchObject({
      kind: "function",
      args: [expect.objectContaining({ projectScope: "filtered" })],
    });
  });

  it("chuyển cấu hình schema 18 sang công thức tổng hợp mà không làm mất dữ liệu cũ", () => {
    const current = createSeedState();
    const legacy = { ...structuredClone(current), schemaVersion: 18 } as Record<string, unknown>;
    delete legacy.summaryFormulas;
    legacy.summaryRows = current.summaryRows.map((row) => ({
      ...row,
      fieldAggregations: { savingUsd: "sum" },
    }));

    const migrated = migrateState(legacy);

    expect(migrated.projects).toHaveLength(current.projects.length);
    expect(migrated.summaryColumns[0]?.label).toBe("Tổng năm");
    expect(
      migrated.summaryFormulas.some(
        (formula) =>
          formula.targetKind === "row" &&
          formula.metricId === "savingUsd" &&
          formula.columnId === "actual",
      ),
    ).toBe(true);
  });
});
