import {
  errorResult,
  monthFromSeriesKey,
  monthSeriesKey,
  projectMonthSeriesKey,
  projectSeriesKey,
  scalar,
  series,
  valueResult,
  type CalculationResult,
  type TraceEntry,
} from "../domain/calculation-result";
import type { FormulaAst } from "./ast";
import type { KkvState, ProjectFieldDefinition } from "../domain/types";
import { DependencyGraph } from "./dependency-graph";
import { evaluateAst } from "./evaluator";
import { resolvePeriod } from "./period-resolver";
import { typeCheck } from "./type-checker";
import { astToBusinessExpression } from "./ast-utils";
import {
  baseFormulaForProject,
  defaultMonthlyColumnId,
  fieldDefinitionForProject,
  monthlyFieldForSummaryMetric,
  monthlyFieldAllowsColumn,
  summaryMetricAsField,
} from "../domain/metadata";

const rawValue = (value: unknown) =>
  typeof value === "object" && value != null && "numericValue" in value
    ? (value as { numericValue: unknown }).numericValue
    : value;

type ResolvableReference = Extract<
  FormulaAst,
  { kind: "fieldReference" | "metricReference" | "summaryReference" }
>;

export interface FormulaEvaluationContext {
  /** Toàn bộ dự án thỏa bộ lọc, không phải riêng các hàng đang được render trên màn hình. */
  filteredProjectIds?: readonly string[];
}

/**
 * Tính công thức trên một snapshot state không thay đổi.
 * Một engine được tái sử dụng trong cùng lần render để cache kết quả các dependency.
 */
export class FormulaEngine {
  private readonly graph = new DependencyGraph();
  constructor(
    private readonly state: KkvState,
    private readonly context: FormulaEvaluationContext = {},
  ) {}

  private field(projectId: string, fieldId: string) {
    return fieldDefinitionForProject(this.state, projectId, fieldId);
  }

  private anyField(fieldId: string) {
    return (
      this.state.fieldDefinitions.find((field) => field.id === fieldId) ??
      (this.state.monthlySummaryMetrics.find((metric) => metric.id === fieldId)
        ? summaryMetricAsField(
            this.state.monthlySummaryMetrics.find((metric) => metric.id === fieldId)!,
          )
        : undefined)
    );
  }

  calculate(
    projectId: string,
    fieldId: string,
    year: number,
    month: number,
    columnId?: string,
  ): CalculationResult {
    return this.calculateNode(
      projectId,
      fieldId,
      year,
      month,
      columnId ?? defaultMonthlyColumnId(this.state),
    );
  }

  calculateMetric(
    projectId: string,
    metricId: string,
    year: number,
    month: number,
    columnId?: string,
  ): CalculationResult {
    const resolvedColumnId = columnId ?? defaultMonthlyColumnId(this.state);
    return this.resolveMetricReference(
      projectId,
      { kind: "metricReference", metricId, period: { kind: "current" } },
      year,
      month,
      resolvedColumnId,
    );
  }

  evaluate(
    projectId: string,
    ast: FormulaAst,
    year: number,
    month: number,
    columnId?: string,
  ): CalculationResult {
    const resolvedColumnId = columnId ?? defaultMonthlyColumnId(this.state);
    return this.evaluateWithResolver(ast, (reference) => {
      if (reference.kind === "summaryReference")
        return this.resolveSummaryReferenceAtMonth(
          projectId,
          reference,
          year,
          month,
          resolvedColumnId,
        );
      if (reference.kind === "metricReference")
        return this.resolveMetricReference(projectId, reference, year, month, resolvedColumnId);
      return this.resolveReference(projectId, reference, year, month, resolvedColumnId);
    });
  }

  calculateSummaryColumn(
    projectId: string,
    summaryColumnId: string,
    metricId: string,
    year: number,
    columnId: string,
  ): CalculationResult {
    return this.calculateSummaryColumnNode(projectId, summaryColumnId, metricId, year, columnId);
  }

  calculateSummaryRowAtMonth(
    projectId: string,
    summaryRowId: string,
    metricId: string,
    year: number,
    month: number,
    columnId: string,
  ): CalculationResult {
    return this.calculateSummaryRowAtMonthNode(
      projectId,
      summaryRowId,
      metricId,
      year,
      month,
      columnId,
    );
  }

  calculateSummaryRowAtSummaryColumn(
    projectId: string,
    summaryRowId: string,
    metricId: string,
    year: number,
    summaryColumnId: string,
    columnId: string,
  ): CalculationResult {
    return this.calculateSummaryRowAtSummaryColumnNode(
      projectId,
      summaryRowId,
      metricId,
      year,
      summaryColumnId,
      columnId,
    );
  }

  evaluateSummaryRowAtSummaryColumn(
    projectId: string,
    ast: FormulaAst,
    year: number,
    summaryColumnId: string,
    columnId: string,
  ): CalculationResult {
    return this.evaluateWithResolver(
      ast,
      (reference) =>
        reference.kind === "summaryReference"
          ? this.resolveSummaryReferenceAtSummaryColumn(
              projectId,
              reference,
              year,
              summaryColumnId,
              columnId,
            )
          : reference.kind === "metricReference"
            ? this.resolveSummaryColumnReference(
                projectId,
                reference,
                year,
                summaryColumnId,
                columnId,
              )
            : errorResult("MissingField"),
      this.summaryFormulaFields(),
    );
  }

  private summaryFormulaFields() {
    return this.state.monthlySummaryMetrics.map(summaryMetricAsField);
  }

  private evaluateSummaryFormula(
    projectId: string,
    ast: FormulaAst,
    year: number,
    month: number,
    columnId: string,
  ) {
    return this.evaluateWithResolver(
      ast,
      (reference) =>
        reference.kind === "summaryReference"
          ? this.resolveSummaryReferenceAtMonth(projectId, reference, year, month, columnId)
          : reference.kind === "metricReference"
            ? this.resolveMetricReference(projectId, reference, year, month, columnId)
            : errorResult("MissingField"),
      this.summaryFormulaFields(),
    );
  }

  private evaluateWithResolver(
    ast: FormulaAst,
    resolve: (reference: ResolvableReference) => CalculationResult,
    fields = this.state.fieldDefinitions,
  ): CalculationResult {
    try {
      typeCheck(ast, fields);
    } catch (error) {
      const message = (error as Error).message;
      return errorResult(
        message === "MissingField"
          ? "MissingField"
          : message === "InvalidFormula"
            ? "InvalidFormula"
            : message === "IncompatibleSeriesAxis"
              ? "IncompatibleSeriesAxis"
              : "InvalidType",
      );
    }
    return evaluateAst(ast, { resolve });
  }

  formulaExpression(
    projectId: string,
    fieldId: string,
    year: number,
    month: number,
    columnId?: string,
  ): string | undefined {
    const resolvedColumnId = columnId ?? defaultMonthlyColumnId(this.state);
    const field = this.field(projectId, fieldId);
    if (!field) return undefined;
    const project = this.state.projects.find((item) => item.id === projectId);
    if (field.scope !== "calendar" && project && project.year !== year) return undefined;

    if (field.scope === "project") {
      const projectOverride = this.state.projectFormulaOverrides.find(
        (item) => item.projectId === projectId && item.fieldId === fieldId,
      );
      if (projectOverride)
        return astToBusinessExpression(
          projectOverride.formula.ast,
          this.state,
          projectId,
          resolvedColumnId,
        );
      const baseFormula = baseFormulaForProject(this.state, projectId, field, resolvedColumnId);
      return baseFormula
        ? astToBusinessExpression(baseFormula.ast, this.state, projectId, resolvedColumnId)
        : undefined;
    }
    if (field.scope === "calendar")
      return field.inputMode === "formula" && field.formula
        ? astToBusinessExpression(field.formula.ast, this.state, projectId, resolvedColumnId)
        : undefined;

    // Giữ đúng thứ tự như calculateNode: override project > override chung > công thức mặc định.
    const matchingOverrides = this.state.formulaOverrides.filter(
      (item) =>
        item.fieldId === fieldId &&
        item.columnId === resolvedColumnId &&
        item.year === year &&
        item.months.includes(month),
    );
    const override =
      matchingOverrides.find((item) => item.projectId === projectId) ??
      matchingOverrides.find((item) => !item.projectId);
    if (override)
      return astToBusinessExpression(override.formula.ast, this.state, projectId, resolvedColumnId);
    const defaultFormula = baseFormulaForProject(this.state, projectId, field, resolvedColumnId);
    return defaultFormula
      ? astToBusinessExpression(defaultFormula.ast, this.state, projectId, resolvedColumnId)
      : undefined;
  }

  private calculateNode(
    projectId: string,
    fieldId: string,
    year: number,
    month: number,
    columnId: string,
  ): CalculationResult {
    const key = `${projectId}|${fieldId}|${year}|${month}|${columnId}`;
    // Tập active phát hiện vòng lặp đệ quy; cache tránh tính lại dependency dùng chung.
    const cached = this.graph.get<CalculationResult>(key);
    if (cached) return cached;
    if (!this.graph.enter(key)) return errorResult("CircularDependency");
    const field = this.field(projectId, fieldId);
    if (!field) {
      this.graph.leave(key);
      return errorResult("MissingField");
    }
    const nodeProject = this.state.projects.find((item) => item.id === projectId);
    if (field.scope !== "calendar" && nodeProject && nodeProject.year !== year) {
      const result = valueResult(scalar(null), field.semanticType);
      this.graph.leave(key);
      this.graph.set(key, result);
      return result;
    }
    if (field.scope === "monthly") {
      if (!monthlyFieldAllowsColumn(this.state, projectId, fieldId, columnId)) {
        const result = valueResult(scalar(null), field.semanticType);
        this.graph.leave(key);
        this.graph.set(key, result);
        return result;
      }
    }
    let result: CalculationResult;
    if (field.scope === "project") {
      const projectOverride = this.state.projectFormulaOverrides.find(
        (item) => item.projectId === projectId && item.fieldId === fieldId,
      );
      if (projectOverride)
        result = this.evaluate(projectId, projectOverride.formula.ast, year, month, columnId);
      else {
        const baseFormula = baseFormulaForProject(this.state, projectId, field, columnId);
        result = baseFormula
          ? this.evaluate(projectId, baseFormula.ast, year, month, columnId)
          : this.projectValue(projectId, field);
      }
    } else if (field.scope === "calendar") {
      if (field.formula)
        result = this.evaluate(projectId, field.formula.ast, year, month, columnId);
      else {
        const stored = this.state.calendarValues.find(
          (item) => item.fieldId === fieldId && item.year === year && item.month === month,
        );
        result = valueResult(scalar(rawValue(stored?.value ?? null)), field.semanticType, [
          this.trace(field, stored?.value ?? null, month, undefined, projectId),
        ]);
      }
    } else {
      const matchingOverrides = this.state.formulaOverrides.filter(
        (item) =>
          item.fieldId === fieldId &&
          item.columnId === columnId &&
          item.year === year &&
          item.months.includes(month),
      );
      // Quy tắc riêng của project luôn ưu tiên dù quy tắc chung được tạo trước.
      const override =
        matchingOverrides.find((item) => item.projectId === projectId) ??
        matchingOverrides.find((item) => !item.projectId);
      if (override) result = this.evaluate(projectId, override.formula.ast, year, month, columnId);
      else if (baseFormulaForProject(this.state, projectId, field, columnId))
        result = this.evaluate(
          projectId,
          baseFormulaForProject(this.state, projectId, field, columnId)!.ast,
          year,
          month,
          columnId,
        );
      else if (field.inputMode === "fixed")
        result = valueResult(scalar(rawValue(field.fixedValue ?? null)), field.semanticType, [
          this.trace(field, field.fixedValue ?? null, month, columnId, projectId),
        ]);
      else {
        const stored = this.state.monthlyValues.find(
          (item) =>
            item.projectId === projectId &&
            item.fieldId === fieldId &&
            item.year === year &&
            item.month === month &&
            item.columnId === columnId,
        );
        result = valueResult(scalar(rawValue(stored?.value ?? null)), field.semanticType, [
          this.trace(field, stored?.value ?? null, month, columnId, projectId),
        ]);
      }
    }
    // Giữ lại lỗi gốc để chẩn đoán dù UI nhận giá trị fallback đã cấu hình.
    if (result.state === "Error" && field.errorPolicy?.useDefaultValue)
      result = {
        ...valueResult(
          scalar(field.errorPolicy.defaultValue ?? null),
          field.semanticType,
          result.trace,
        ),
        state: "ErrorFallback",
        originalError: result.errorCode,
        usedFallback: true,
      };
    this.graph.leave(key);
    this.graph.set(key, result);
    return result;
  }

  private projectValue(projectId: string, field: ProjectFieldDefinition): CalculationResult {
    const entry = this.state.fieldValues.find(
      (item) => item.projectId === projectId && item.fieldId === field.id,
    );
    const value = field.inputMode === "fixed" ? (field.fixedValue ?? null) : (entry?.value ?? null);
    return valueResult(scalar(rawValue(value)), field.semanticType, [
      this.trace(field, rawValue(value), undefined, undefined, projectId),
    ]);
  }

  private calculateSummaryColumnNode(
    projectId: string,
    summaryColumnId: string,
    metricId: string,
    year: number,
    columnId: string,
  ): CalculationResult {
    const key = `summary-column|${projectId}|${summaryColumnId}|${metricId}|${year}|${columnId}`;
    const cached = this.graph.get<CalculationResult>(key);
    if (cached) return cached;
    if (!this.graph.enter(key)) return errorResult("CircularDependency");

    const metric = this.state.monthlySummaryMetrics.find((item) => item.id === metricId);
    if (!metric) {
      this.graph.leave(key);
      return errorResult("MissingField");
    }
    const definition = this.state.summaryFormulas.find(
      (item) =>
        item.targetKind === "column" &&
        item.summaryId === summaryColumnId &&
        item.metricId === metricId &&
        item.columnId === columnId,
    );
    if (!definition) {
      const result = valueResult(scalar(null), metric.semanticType);
      this.graph.leave(key);
      this.graph.set(key, result);
      return result;
    }
    const summaryColumn = this.state.summaryColumns.find((item) => item.id === summaryColumnId);
    const contextMonth = summaryColumn?.months.length
      ? Math.max(...summaryColumn.months)
      : (this.state.periods.at(-1)?.month ?? 12);
    const result = this.evaluateSummaryFormula(
      projectId,
      definition.formula.ast,
      year,
      contextMonth,
      columnId,
    );
    this.graph.leave(key);
    this.graph.set(key, result);
    return result;
  }

  private calculateSummaryRowAtMonthNode(
    projectId: string,
    summaryRowId: string,
    metricId: string,
    year: number,
    month: number,
    columnId: string,
  ): CalculationResult {
    const key = `summary-row-month|${summaryRowId}|${metricId}|${year}|${month}|${columnId}`;
    const cached = this.graph.get<CalculationResult>(key);
    if (cached) return cached;
    if (!this.graph.enter(key)) return errorResult("CircularDependency");

    const metric = this.state.monthlySummaryMetrics.find((item) => item.id === metricId);
    const definition = this.state.summaryFormulas.find(
      (item) =>
        item.targetKind === "row" &&
        item.summaryId === summaryRowId &&
        item.metricId === metricId &&
        item.columnId === columnId,
    );
    const result =
      metric && definition
        ? this.evaluateSummaryFormula(projectId, definition.formula.ast, year, month, columnId)
        : metric
          ? valueResult(scalar(null), metric.semanticType)
          : errorResult("MissingField");
    this.graph.leave(key);
    this.graph.set(key, result);
    return result;
  }

  private calculateSummaryRowAtSummaryColumnNode(
    projectId: string,
    summaryRowId: string,
    metricId: string,
    year: number,
    summaryColumnId: string,
    columnId: string,
  ): CalculationResult {
    const key = `summary-row-column|${summaryRowId}|${summaryColumnId}|${metricId}|${year}|${columnId}`;
    const cached = this.graph.get<CalculationResult>(key);
    if (cached) return cached;
    if (!this.graph.enter(key)) return errorResult("CircularDependency");

    const metric = this.state.monthlySummaryMetrics.find((item) => item.id === metricId);
    const definition = this.state.summaryFormulas.find(
      (item) =>
        item.targetKind === "row" &&
        item.summaryId === summaryRowId &&
        item.metricId === metricId &&
        item.columnId === columnId,
    );
    const result =
      metric && definition
        ? this.evaluateSummaryRowAtSummaryColumn(
            projectId,
            definition.formula.ast,
            year,
            summaryColumnId,
            columnId,
          )
        : metric
          ? valueResult(scalar(null), metric.semanticType)
          : errorResult("MissingField");
    this.graph.leave(key);
    this.graph.set(key, result);
    return result;
  }

  private summaryColumnResults(
    reference: Extract<FormulaAst, { kind: "summaryReference" }>,
    year: number,
  ) {
    const filteredIds =
      reference.projectScope === "filtered" && this.context.filteredProjectIds
        ? new Set(this.context.filteredProjectIds)
        : undefined;
    return this.state.projects
      .filter((project) => project.year === year && (!filteredIds || filteredIds.has(project.id)))
      .map((project) => ({
        projectId: project.id,
        result: this.calculateSummaryColumnNode(
          project.id,
          reference.summaryId,
          reference.metricId,
          year,
          reference.columnId,
        ),
      }));
  }

  private summaryColumnSeries(
    reference: Extract<FormulaAst, { kind: "summaryReference" }>,
    year: number,
  ): CalculationResult {
    const field = this.anyField(reference.metricId);
    if (!field) return errorResult("MissingField");
    const results = this.summaryColumnResults(reference, year);
    const failed = results.find((item) => item.result.state === "Error");
    if (failed) return failed.result;
    return valueResult(
      series(
        "project",
        Object.fromEntries(
          results.map(({ projectId, result }) => [
            projectSeriesKey(projectId),
            result.value.kind === "scalar" ? result.value.value : null,
          ]),
        ),
      ),
      field.semanticType,
      results.flatMap(({ result }) => result.trace),
    );
  }

  private resolveSummaryReferenceAtMonth(
    projectId: string,
    reference: Extract<FormulaAst, { kind: "summaryReference" }>,
    year: number,
    month: number,
    currentColumn: string,
  ): CalculationResult {
    if (reference.summaryKind === "row")
      return this.calculateSummaryRowAtMonthNode(
        projectId,
        reference.summaryId,
        reference.metricId,
        year,
        month,
        reference.columnId || currentColumn,
      );
    if (reference.projectScope === "all" || reference.projectScope === "filtered")
      return this.summaryColumnSeries(reference, year);
    return this.calculateSummaryColumnNode(
      projectId,
      reference.summaryId,
      reference.metricId,
      year,
      reference.columnId || currentColumn,
    );
  }

  private resolveSummaryReferenceAtSummaryColumn(
    projectId: string,
    reference: Extract<FormulaAst, { kind: "summaryReference" }>,
    year: number,
    currentSummaryColumnId: string,
    currentColumn: string,
  ): CalculationResult {
    if (reference.summaryKind === "row")
      return this.calculateSummaryRowAtSummaryColumnNode(
        projectId,
        reference.summaryId,
        reference.metricId,
        year,
        currentSummaryColumnId,
        reference.columnId || currentColumn,
      );
    if (reference.projectScope === "all" || reference.projectScope === "filtered")
      return this.summaryColumnSeries(reference, year);
    return this.calculateSummaryColumnNode(
      projectId,
      reference.summaryId,
      reference.metricId,
      year,
      reference.columnId || currentColumn,
    );
  }

  private resolveSummaryColumnReference(
    projectId: string,
    reference: Extract<FormulaAst, { kind: "metricReference" }>,
    year: number,
    summaryColumnId: string,
    currentColumn: string,
  ): CalculationResult {
    const metric = this.state.monthlySummaryMetrics.find((item) => item.id === reference.metricId);
    if (!metric) return errorResult("MissingField");
    const field = summaryMetricAsField(metric);
    const column = reference.columnId ?? currentColumn;
    if (reference.projectScope === "all" || reference.projectScope === "filtered") {
      const filteredIds =
        reference.projectScope === "filtered" && this.context.filteredProjectIds
          ? new Set(this.context.filteredProjectIds)
          : undefined;
      const projects = this.state.projects.filter(
        (project) => project.year === year && (!filteredIds || filteredIds.has(project.id)),
      );
      const results = projects.map((project) => ({
        projectId: project.id,
        result: this.calculateSummaryColumnNode(
          project.id,
          summaryColumnId,
          reference.metricId,
          year,
          column,
        ),
      }));
      const failed = results.find((item) => item.result.state === "Error");
      if (failed) return failed.result;
      return valueResult(
        series(
          "project",
          Object.fromEntries(
            results.map(({ projectId: sourceProjectId, result }) => [
              projectSeriesKey(sourceProjectId),
              result.value.kind === "scalar" ? result.value.value : null,
            ]),
          ),
        ),
        field.semanticType,
        results.flatMap(({ projectId: sourceProjectId, result }) => [
          this.trace(
            field,
            result.value.kind === "scalar" ? result.value.value : null,
            undefined,
            column,
            sourceProjectId,
            0,
          ),
          ...this.nestedTrace(result.trace),
        ]),
      );
    }
    return this.calculateSummaryColumnNode(
      projectId,
      summaryColumnId,
      reference.metricId,
      year,
      column,
    );
  }

  private resolveMetricReference(
    projectId: string,
    reference: Extract<FormulaAst, { kind: "metricReference" }>,
    year: number,
    currentMonth: number,
    currentColumn: string,
  ): CalculationResult {
    const metric = this.state.monthlySummaryMetrics.find((item) => item.id === reference.metricId);
    if (!metric) return errorResult("MissingField");
    if (reference.projectScope === "all" || reference.projectScope === "filtered") {
      const filteredIds =
        reference.projectScope === "filtered" && this.context.filteredProjectIds
          ? new Set(this.context.filteredProjectIds)
          : undefined;
      const projects = this.state.projects.filter(
        (project) => project.year === year && (!filteredIds || filteredIds.has(project.id)),
      );
      const results = projects.map((project) =>
        this.resolveMetricReference(
          project.id,
          { ...reference, projectScope: "current" },
          year,
          currentMonth,
          currentColumn,
        ),
      );
      const failed = results.find((result) => result.state === "Error");
      if (failed) return failed;
      const hasMonthlySeries = results.some((result) => result.value.kind === "series");
      return valueResult(
        series(
          hasMonthlySeries ? "projectMonth" : "project",
          Object.fromEntries(
            results.flatMap((result, index) => {
              const sourceProject = projects[index];
              if (result.value.kind === "scalar")
                return [[projectSeriesKey(sourceProject.id), result.value.value]];
              return Object.entries(result.value.values).map(([key, value]) => {
                const month = monthFromSeriesKey(key);
                return [
                  month == null
                    ? `${projectSeriesKey(sourceProject.id)}|${key}`
                    : projectMonthSeriesKey(sourceProject.id, month),
                  value,
                ];
              });
            }),
          ),
        ),
        metric.semanticType,
        results.flatMap((result) => result.trace),
      );
    }
    const field = monthlyFieldForSummaryMetric(this.state, projectId, metric.id);
    if (!field) return valueResult(scalar(null), metric.semanticType);
    return this.resolveReference(
      projectId,
      {
        kind: "fieldReference",
        fieldId: field.id,
        columnId: reference.columnId,
        period: reference.period,
        projectScope: "current",
      },
      year,
      currentMonth,
      currentColumn,
    );
  }

  private resolveReference(
    projectId: string,
    reference: Extract<FormulaAst, { kind: "fieldReference" }>,
    year: number,
    currentMonth: number,
    currentColumn: string,
  ): CalculationResult {
    const field = this.field(projectId, reference.fieldId);
    if (!field) return errorResult("MissingField");
    if (reference.projectScope === "all" || reference.projectScope === "filtered") {
      const filteredIds =
        reference.projectScope === "filtered" && this.context.filteredProjectIds
          ? new Set(this.context.filteredProjectIds)
          : undefined;
      const projects = this.state.projects.filter(
        (project) => project.year === year && (!filteredIds || filteredIds.has(project.id)),
      );
      const results = projects.map((project) =>
        this.resolveReference(
          project.id,
          { ...reference, projectScope: "current" },
          year,
          currentMonth,
          currentColumn,
        ),
      );
      const failed = results.find((result) => result.state === "Error");
      if (failed) return failed;
      const hasMonthlySeries = results.some((result) => result.value.kind === "series");
      const values = Object.fromEntries(
        results.flatMap((result, index) => {
          const sourceProject = projects[index];
          if (result.value.kind === "scalar")
            return [[projectSeriesKey(sourceProject.id), result.value.value]];
          return Object.entries(result.value.values).map(([key, value]) => {
            const month = monthFromSeriesKey(key);
            return [
              month == null
                ? `${projectSeriesKey(sourceProject.id)}|${key}`
                : projectMonthSeriesKey(sourceProject.id, month),
              value,
            ];
          });
        }),
      );
      return valueResult(
        series(hasMonthlySeries ? "projectMonth" : "project", values),
        field.semanticType,
        results.flatMap((result) => result.trace),
      );
    }
    if (field.scope === "project") {
      const result = this.calculateNode(projectId, field.id, year, currentMonth, currentColumn);
      const value = result.value.kind === "scalar" ? result.value.value : null;
      const rootTrace = this.trace(field, value, undefined, undefined, projectId, 0);
      return {
        ...result,
        trace: this.traceWithNested(rootTrace, result.trace),
      };
    }
    const resolution = resolvePeriod(reference.period, currentMonth);
    if (resolution.outOfRange) return errorResult("OutOfPeriodRange", field.semanticType);
    const column = reference.columnId ?? currentColumn;
    const results = resolution.months.map((month) => ({
      month,
      result: this.calculateNode(projectId, reference.fieldId, year, month, column),
    }));
    const failed = results.find((item) => item.result.state === "Error");
    if (failed) return failed.result;
    const multi =
      resolution.months.length > 1 ||
      (reference.period &&
        ["range", "selected", "even", "odd", "ytd"].includes(reference.period.kind));
    const trace = results.flatMap(({ month, result }) => {
      const rootTrace = this.trace(
        field,
        result.value.kind === "scalar" ? result.value.value : null,
        month,
        column,
        projectId,
        0,
      );
      return this.traceWithNested(rootTrace, result.trace);
    });
    if (!multi) return { ...results[0].result, trace };
    // Reference nhiều kỳ giữ dạng Series theo khóa tháng cho đến khi được hàm tổng hợp xử lý.
    return valueResult(
      series(
        "month",
        Object.fromEntries(
          results.map(({ month, result }) => [
            monthSeriesKey(month),
            result.value.kind === "scalar" ? result.value.value : null,
          ]),
        ),
      ),
      field.semanticType,
      trace,
    );
  }

  private trace(
    field: ProjectFieldDefinition,
    value: unknown,
    month?: number,
    columnId?: string,
    projectId?: string,
    referenceDepth?: number,
  ): TraceEntry {
    return {
      label: field.label,
      fieldId: field.id,
      projectId,
      referenceDepth,
      month,
      columnId,
      value: rawValue(value),
      semanticType: field.semanticType,
    };
  }

  private nestedTrace(trace: TraceEntry[]): TraceEntry[] {
    return trace.map((entry) => ({
      ...entry,
      referenceDepth: (entry.referenceDepth ?? 0) + 1,
    }));
  }

  private traceWithNested(root: TraceEntry, nested: TraceEntry[]): TraceEntry[] {
    const isSameReference = (entry: TraceEntry) =>
      entry.fieldId === root.fieldId &&
      entry.projectId === root.projectId &&
      entry.month === root.month &&
      entry.columnId === root.columnId &&
      (entry.referenceDepth ?? 0) === 0;
    return [root, ...this.nestedTrace(nested.filter((entry) => !isSameReference(entry)))];
  }
}
