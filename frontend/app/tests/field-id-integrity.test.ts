import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_YEAR } from "../data/seed";
import type { ProjectFieldDefinition } from "../domain/types";
import { binary, lit, ref, type FormulaAst } from "../formula/ast";
import { metricReferencesInAst, referencesInAst } from "../formula/ast-utils";
import { FormulaEngine } from "../formula/formula-engine";
import { annualSummaryColumn } from "../domain/metadata";

const valueOf = (result: ReturnType<FormulaEngine["calculate"]>) =>
  result.value.kind === "scalar" ? result.value.value : null;

const columnIdsInAst = (ast: FormulaAst): string[] => {
  if (ast.kind === "binary") return [...columnIdsInAst(ast.left), ...columnIdsInAst(ast.right)];
  if (ast.kind === "function") return ast.args.flatMap(columnIdsInAst);
  if (
    ast.kind === "fieldReference" ||
    ast.kind === "metricReference" ||
    ast.kind === "summaryReference"
  )
    return ast.columnId ? [ast.columnId] : [];
  return [];
};

const projectField = (
  id: string,
  code: string,
  label: string,
  inputMode: ProjectFieldDefinition["inputMode"] = "manual",
): ProjectFieldDefinition => ({
  id,
  code,
  label,
  scope: "project",
  ownerType: "project",
  ownerId: "project-1",
  columnType: "standalone",
  semanticType: "Number",
  displayMode: "number",
  inputMode,
  rowIndex: 1,
  sortOrder: 999,
});

describe("fieldId là khóa liên kết duy nhất", () => {
  it("xác định cột kết quả năm bằng role, không phụ thuộc mã kỹ thuật", () => {
    const state = createSeedState();
    const annual = state.summaryColumns.find((column) => column.role === "annual")!;
    annual.code = "renamedAnnualCode";

    expect(annualSummaryColumn(state)?.id).toBe(annual.id);
  });

  it("các quan hệ cấu hình cột đều trỏ tới ID đang tồn tại", () => {
    const state = createSeedState();
    const monthlyColumnIds = new Set(state.monthlyColumns.map((column) => column.id));
    const summaryColumnIds = new Set(state.summaryColumns.map((column) => column.id));
    const summaryProjectColumnIds = new Set(state.summaryProjectColumns.map((column) => column.id));

    const allowedColumnIds = [
      ...state.projectMonthlyFieldConfigs.flatMap((config) => config.allowedColumnIds ?? []),
      ...state.projectFieldTemplates.flatMap((template) =>
        template.fields.flatMap((field) => field.allowedColumnIds),
      ),
      ...state.summaryColumns.flatMap((column) => column.columnIds),
    ];
    const mappedProjectColumnIds = [
      ...state.projectFieldConfigs.flatMap((config) =>
        config.summaryProjectColumnId ? [config.summaryProjectColumnId] : [],
      ),
      ...state.projectFieldTemplates.flatMap((template) =>
        (template.projectFields ?? []).flatMap((field) =>
          field.summaryProjectColumnId ? [field.summaryProjectColumnId] : [],
        ),
      ),
    ];
    const rowSummaryColumnIds = state.summaryRows.flatMap((row) => row.summaryColumnIds);
    const relatedMonthlyColumnIds = [
      ...state.monthlyValues.map((value) => value.columnId),
      ...state.formulaOverrides.map((override) => override.columnId),
      ...state.summaryFormulas.map((formula) => formula.columnId),
      ...state.chartDefinitions.flatMap((chart) => chart.series.map((series) => series.columnId)),
      ...state.projectFieldTemplates.flatMap((template) =>
        (template.formulas ?? []).flatMap((item) => [
          ...(item.columnId ? [item.columnId] : []),
          ...columnIdsInAst(item.formula.ast),
        ]),
      ),
      ...state.fieldDefinitions.flatMap((field) =>
        [field.formula, ...(field.columnFormulas ?? [])].flatMap((formula) =>
          formula
            ? [...(formula.columnId ? [formula.columnId] : []), ...columnIdsInAst(formula.ast)]
            : [],
        ),
      ),
      ...state.formulaOverrides.flatMap((override) => columnIdsInAst(override.formula.ast)),
      ...state.projectFormulaOverrides.flatMap((override) => columnIdsInAst(override.formula.ast)),
      ...state.summaryFormulas.flatMap((formula) => columnIdsInAst(formula.formula.ast)),
    ];

    expect(allowedColumnIds.filter((id) => !monthlyColumnIds.has(id))).toEqual([]);
    expect(mappedProjectColumnIds.filter((id) => !summaryProjectColumnIds.has(id))).toEqual([]);
    expect(rowSummaryColumnIds.filter((id) => !summaryColumnIds.has(id))).toEqual([]);
    expect(relatedMonthlyColumnIds.filter((id) => !monthlyColumnIds.has(id))).toEqual([]);
  });

  it("toàn bộ seed chỉ liên kết tới fieldId đang tồn tại", () => {
    const state = createSeedState();
    const fieldIds = new Set(state.fieldDefinitions.map((field) => field.id));
    const relatedIds = [
      ...state.fieldValues.map((value) => value.fieldId),
      ...state.monthlyValues.map((value) => value.fieldId),
      ...state.calendarValues.map((value) => value.fieldId),
      ...state.projectFieldConfigs.map((config) => config.fieldId),
      ...state.projectMonthlyFieldConfigs.map((config) => config.fieldId),
      ...state.formulaOverrides.map((override) => override.fieldId),
      ...state.projectFormulaOverrides.map((override) => override.fieldId),
      ...state.chartDefinitions.flatMap((chart) =>
        chart.series.flatMap((series) =>
          series.sourceKind === "monthlyField" && series.fieldId ? [series.fieldId] : [],
        ),
      ),
      ...state.projectFieldTemplates.flatMap((template) => [
        ...(template.projectFields ?? []).map((item) => item.fieldId),
        ...template.fields.map((item) => item.fieldId),
        ...(template.formulas ?? []).map((item) => item.fieldId),
      ]),
    ];
    const formulaReferences = [
      ...state.fieldDefinitions.flatMap((field) => [
        ...(field.formula ? referencesInAst(field.formula.ast) : []),
        ...(field.columnFormulas ?? []).flatMap((formula) => referencesInAst(formula.ast)),
      ]),
      ...state.formulaOverrides.flatMap((override) =>
        override.formula ? referencesInAst(override.formula.ast) : [],
      ),
      ...state.projectFormulaOverrides.flatMap((override) =>
        override.formula ? referencesInAst(override.formula.ast) : [],
      ),
      ...state.summaryFormulas.flatMap((summary) => referencesInAst(summary.formula.ast)),
    ];

    const metricIds = new Set(state.monthlySummaryMetrics.map((metric) => metric.id));
    const relatedMetricIds = [
      ...state.summaryFormulas.map((formula) => formula.metricId),
      ...state.summaryFormulas.flatMap((formula) => metricReferencesInAst(formula.formula.ast)),
      ...state.projectMonthlyFieldConfigs.flatMap((config) =>
        config.summaryMetricId ? [config.summaryMetricId] : [],
      ),
      ...state.projectFieldTemplates.flatMap((template) =>
        template.fields.flatMap((config) =>
          config.summaryMetricId ? [config.summaryMetricId] : [],
        ),
      ),
      ...state.chartDefinitions.flatMap((chart) =>
        chart.series.flatMap((series) => (series.metricId ? [series.metricId] : [])),
      ),
    ];

    expect([...relatedIds, ...formulaReferences].filter((id) => !fieldIds.has(id))).toEqual([]);
    expect(relatedMetricIds.filter((id) => !metricIds.has(id))).toEqual([]);
  });

  it("đổi nhãn và mã kỹ thuật không làm mất giá trị hoặc công thức", () => {
    const state = createSeedState();
    const source = projectField("field-source-id", "oldTechnicalCode", "Nguồn cũ");
    const calculated = {
      ...projectField("field-result-id", "oldResultCode", "Kết quả cũ", "formula"),
      formula: {
        id: "formula-by-field-id",
        ast: binary("*", ref("field-source-id"), lit(2)),
        businessExpression: "[Nguồn] × 2",
        internalExpression: "[ref:field-source-id] * 2",
      },
    } satisfies ProjectFieldDefinition;

    state.fieldDefinitions.push(source, calculated);
    state.fieldValues.push({ projectId: "project-1", fieldId: source.id, value: 21 });

    source.code = "renamedTechnicalCode";
    source.label = "Nguồn đã đổi tên";
    calculated.code = "renamedResultCode";
    calculated.label = "Kết quả đã đổi tên";

    expect(
      valueOf(
        new FormulaEngine(state).calculate("project-1", calculated.id, DEMO_YEAR, 1, "actual"),
      ),
    ).toBe(42);
  });

  it("đổi mã kỹ thuật cột tháng không làm đứt dữ liệu hoặc công thức", () => {
    const state = createSeedState();
    const source = state.monthlyValues.find(
      (value) => value.columnId === "actual" && value.value != null,
    )!;
    const before = new FormulaEngine(state).calculate(
      source.projectId,
      source.fieldId,
      source.year,
      source.month,
      source.columnId,
    );
    const actualColumn = state.monthlyColumns.find((column) => column.id === "actual")!;

    actualColumn.code = "actualRenamed";
    actualColumn.label = "Kết quả đã đổi tên";

    const after = new FormulaEngine(state).calculate(
      source.projectId,
      source.fieldId,
      source.year,
      source.month,
      source.columnId,
    );
    expect(after.state).toBe(before.state);
    expect(valueOf(after)).toEqual(valueOf(before));
  });

  it("trường tạo lại có cùng mã kỹ thuật không nhận nhầm giá trị của trường đã xóa", () => {
    const state = createSeedState();
    const removed = projectField("removed-field-id", "reusedTechnicalCode", "Trường cũ");
    state.fieldDefinitions.push(removed);
    state.fieldValues.push({ projectId: "project-1", fieldId: removed.id, value: 99 });

    state.fieldDefinitions = state.fieldDefinitions.filter((field) => field.id !== removed.id);
    const replacement = projectField("replacement-field-id", "reusedTechnicalCode", "Trường mới");
    state.fieldDefinitions.push(replacement);

    expect(
      valueOf(
        new FormulaEngine(state).calculate("project-1", replacement.id, DEMO_YEAR, 1, "actual"),
      ),
    ).toBeNull();
    expect(state.fieldValues.some((value) => value.fieldId === replacement.id)).toBe(false);
  });
});
