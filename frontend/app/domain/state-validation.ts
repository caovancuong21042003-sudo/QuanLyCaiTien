import type { FormulaAst } from "../formula/ast";
import type { FormulaDefinition, KkvState } from "./types";

const collectionKeys = [
  "availableYears",
  "projects",
  "fieldDefinitions",
  "fieldValues",
  "projectMonthlyLayouts",
  "projectFieldConfigs",
  "projectMonthlyFieldConfigs",
  "projectFieldTemplates",
  "monthlySummaryMetrics",
  "summaryProjectColumns",
  "columnGroups",
  "monthlyColumns",
  "summaryColumns",
  "summaryRows",
  "summaryFormulas",
  "monthlyValues",
  "calendarValues",
  "periods",
  "formulaOverrides",
  "projectFormulaOverrides",
  "chartDefinitions",
] as const satisfies readonly (keyof KkvState)[];

const unique = (values: string[]) => new Set(values).size === values.length;
const existsOrEmpty = (values: Set<string>, value: string | null | undefined) =>
  value == null || value === "" || values.has(value);

interface ReferenceSets {
  fields: Set<string>;
  metrics: Set<string>;
  columns: Set<string>;
  summaryColumns: Set<string>;
  summaryRows: Set<string>;
}

function astReferencesExist(ast: FormulaAst, references: ReferenceSets): boolean {
  if (ast.kind === "literal") return true;
  if (ast.kind === "binary")
    return astReferencesExist(ast.left, references) && astReferencesExist(ast.right, references);
  if (ast.kind === "function")
    return ast.args.every((argument) => astReferencesExist(argument, references));
  if (ast.kind === "fieldReference")
    return references.fields.has(ast.fieldId) && existsOrEmpty(references.columns, ast.columnId);
  if (ast.kind === "metricReference")
    return references.metrics.has(ast.metricId) && existsOrEmpty(references.columns, ast.columnId);
  return (
    references.metrics.has(ast.metricId) &&
    references.columns.has(ast.columnId) &&
    (ast.summaryKind === "column"
      ? references.summaryColumns.has(ast.summaryId)
      : references.summaryRows.has(ast.summaryId))
  );
}

function formulaReferencesExist(formula: FormulaDefinition | undefined, references: ReferenceSets) {
  if (!formula) return true;
  return (
    existsOrEmpty(references.columns, formula.columnId) &&
    astReferencesExist(formula.ast, references)
  );
}

/**
 * Kiểm tra snapshot trước khi đưa vào UI/engine. Dữ liệu test không hợp lệ được thay bằng seed sạch
 * thay vì để lỗi khóa ngoại xuất hiện muộn tại bảng, biểu đồ hoặc trình tạo công thức.
 */
export function isValidKkvState(input: unknown, expectedSchemaVersion: number): input is KkvState {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  if (
    record.schemaVersion !== expectedSchemaVersion ||
    typeof record.selectedYear !== "number" ||
    collectionKeys.some((key) => !Array.isArray(record[key]))
  )
    return false;

  const state = input as KkvState;
  const projectIds = new Set(state.projects.map((item) => item.id));
  const fieldIds = new Set(state.fieldDefinitions.map((item) => item.id));
  const metricIds = new Set(state.monthlySummaryMetrics.map((item) => item.id));
  const columnIds = new Set(state.monthlyColumns.map((item) => item.id));
  const summaryColumnIds = new Set(state.summaryColumns.map((item) => item.id));
  const summaryRowIds = new Set(state.summaryRows.map((item) => item.id));
  const summaryProjectColumnIds = new Set(state.summaryProjectColumns.map((item) => item.id));
  const templateIds = new Set(state.projectFieldTemplates.map((item) => item.id));
  const references: ReferenceSets = {
    fields: fieldIds,
    metrics: metricIds,
    columns: columnIds,
    summaryColumns: summaryColumnIds,
    summaryRows: summaryRowIds,
  };

  if (
    !state.monthlyColumns.length ||
    !unique(state.projects.map((item) => item.id)) ||
    !unique(state.fieldDefinitions.map((item) => item.id)) ||
    !unique(state.monthlySummaryMetrics.map((item) => item.id)) ||
    !unique(state.monthlyColumns.map((item) => item.id)) ||
    !unique(state.summaryColumns.map((item) => item.id)) ||
    !unique(state.summaryRows.map((item) => item.id)) ||
    state.monthlyColumns.filter((item) => item.role === "actual").length > 1 ||
    state.monthlyColumns.filter((item) => item.role === "plan").length > 1 ||
    state.summaryColumns.filter((item) => item.role === "annual").length > 1
  )
    return false;

  if (
    state.projects.some((project) => !existsOrEmpty(templateIds, project.templateId)) ||
    state.fieldDefinitions.some(
      (field) =>
        (field.ownerType === "project" && !existsOrEmpty(projectIds, field.ownerId)) ||
        (field.ownerType !== "project" && Boolean(field.ownerId)) ||
        !formulaReferencesExist(field.formula, references) ||
        (field.columnFormulas ?? []).some(
          (formula) => !formulaReferencesExist(formula, references),
        ),
    ) ||
    state.fieldValues.some(
      (value) => !projectIds.has(value.projectId) || !fieldIds.has(value.fieldId),
    ) ||
    state.monthlyValues.some(
      (value) =>
        !projectIds.has(value.projectId) ||
        !fieldIds.has(value.fieldId) ||
        !columnIds.has(value.columnId),
    ) ||
    state.calendarValues.some((value) => !fieldIds.has(value.fieldId))
  )
    return false;

  if (
    state.projectFieldConfigs.some(
      (config) =>
        !projectIds.has(config.projectId) ||
        !fieldIds.has(config.fieldId) ||
        !existsOrEmpty(summaryProjectColumnIds, config.summaryProjectColumnId),
    ) ||
    state.projectMonthlyFieldConfigs.some(
      (config) =>
        !projectIds.has(config.projectId) ||
        !fieldIds.has(config.fieldId) ||
        config.allowedColumnIds?.some((id) => !columnIds.has(id)) ||
        !existsOrEmpty(metricIds, config.summaryMetricId),
    ) ||
    !unique(state.projectMonthlyLayouts.map((layout) => layout.projectId)) ||
    state.projectMonthlyLayouts.some((layout) => {
      const rowIds = new Set(layout.rows.map((row) => row.id));
      return (
        !projectIds.has(layout.projectId) ||
        !layout.rows.length ||
        !unique(layout.rows.map((row) => row.id)) ||
        !unique(layout.placements.map((placement) => placement.fieldId)) ||
        layout.rows.some((row) => !Number.isFinite(row.sortOrder)) ||
        layout.placements.some(
          (placement) =>
            !fieldIds.has(placement.fieldId) ||
            !rowIds.has(placement.rowId) ||
            !Number.isFinite(placement.sortOrder),
        )
      );
    })
  )
    return false;

  if (
    state.projectFieldTemplates.some((template) => {
      const templateFieldIds = new Set(template.fields.map((item) => item.fieldId));
      const rowIds = new Set(template.monthlyLayout.rows.map((row) => row.id));
      const placementFieldIds = template.monthlyLayout.placements.map(
        (placement) => placement.fieldId,
      );
      return (
        (template.projectFields ?? []).some(
          (item) =>
            !fieldIds.has(item.fieldId) ||
            !existsOrEmpty(summaryProjectColumnIds, item.summaryProjectColumnId),
        ) ||
        template.fields.some(
          (item) =>
            !fieldIds.has(item.fieldId) ||
            item.allowedColumnIds.some((id) => !columnIds.has(id)) ||
            !existsOrEmpty(metricIds, item.summaryMetricId),
        ) ||
        (template.formulas ?? []).some(
          (item) =>
            !fieldIds.has(item.fieldId) ||
            !existsOrEmpty(columnIds, item.columnId) ||
            !formulaReferencesExist(item.formula, references),
        ) ||
        !unique(template.monthlyLayout.rows.map((row) => row.id)) ||
        !unique(placementFieldIds) ||
        placementFieldIds.length !== templateFieldIds.size ||
        placementFieldIds.some((fieldId) => !templateFieldIds.has(fieldId)) ||
        template.monthlyLayout.rows.some((row) => !Number.isFinite(row.sortOrder)) ||
        template.monthlyLayout.placements.some(
          (placement) => !rowIds.has(placement.rowId) || !Number.isFinite(placement.sortOrder),
        )
      );
    })
  )
    return false;

  if (
    state.summaryColumns.some((column) => column.columnIds.some((id) => !columnIds.has(id))) ||
    state.summaryRows.some((row) => row.summaryColumnIds.some((id) => !summaryColumnIds.has(id))) ||
    state.summaryFormulas.some(
      (item) =>
        !metricIds.has(item.metricId) ||
        !columnIds.has(item.columnId) ||
        (item.targetKind === "column"
          ? !summaryColumnIds.has(item.summaryId)
          : !summaryRowIds.has(item.summaryId)) ||
        !formulaReferencesExist(item.formula, references),
    )
  )
    return false;

  if (
    state.formulaOverrides.some(
      (item) =>
        !existsOrEmpty(projectIds, item.projectId) ||
        !fieldIds.has(item.fieldId) ||
        !columnIds.has(item.columnId) ||
        !formulaReferencesExist(item.formula, references),
    ) ||
    state.projectFormulaOverrides.some(
      (item) =>
        !projectIds.has(item.projectId) ||
        !fieldIds.has(item.fieldId) ||
        !formulaReferencesExist(item.formula, references),
    )
  )
    return false;

  return !state.chartDefinitions.some((chart) =>
    chart.series.some(
      (series) =>
        !columnIds.has(series.columnId) ||
        !existsOrEmpty(fieldIds, series.fieldId) ||
        !existsOrEmpty(metricIds, series.metricId) ||
        !existsOrEmpty(summaryColumnIds, series.summaryColumnId) ||
        !existsOrEmpty(summaryRowIds, series.summaryRowId),
    ),
  );
}
