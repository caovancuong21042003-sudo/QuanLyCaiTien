import { FormulaEngine } from "../formula/formula-engine";
import type { ChartDefinition, ChartSeriesDefinition, KkvState, Project } from "./types";

export interface ChartDataSeries {
  definition: ChartSeriesDefinition;
  prefix?: string;
  suffix?: string;
  values: Array<number | null>;
  errorCount: number;
}

export interface ChartDataSet {
  categories: Array<{ key: string; label: string }>;
  series: ChartDataSeries[];
}

function resultNumber(result: ReturnType<FormulaEngine["calculate"]>) {
  if (result.state === "Error" || result.value.kind !== "scalar") return null;
  if (result.value.value == null || result.value.value === "") return null;
  const value = Number(result.value.value);
  return Number.isFinite(value) ? value : null;
}

function fieldAffixes(state: KkvState, fieldId: string) {
  const field =
    state.fieldDefinitions.find((item) => item.id === fieldId) ??
    state.monthlySummaryMetrics.find((item) => item.id === fieldId);
  return { prefix: field?.prefix, suffix: field?.suffix };
}

function sortProjectData(data: ChartDataSet, mode: ChartDefinition["categorySort"]): ChartDataSet {
  if (!mode || mode === "source") return data;
  const order = data.categories.map((_, index) => index);
  const totalAt = (index: number) =>
    data.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0);
  order.sort((left, right) =>
    mode === "valueDesc" ? totalAt(right) - totalAt(left) : totalAt(left) - totalAt(right),
  );
  return {
    categories: order.map((index) => data.categories[index]),
    series: data.series.map((series) => ({
      ...series,
      values: order.map((index) => series.values[index]),
    })),
  };
}

/**
 * Tạo dữ liệu biểu đồ từ chính kết quả FormulaEngine. Hàm này không diễn giải hoặc
 * tính lại công thức, vì cấu hình biểu đồ chỉ có trách nhiệm chọn kết quả cần vẽ.
 */
export function buildChartData(
  state: KkvState,
  definition: ChartDefinition,
  scopedProjects: Project[],
): ChartDataSet {
  const engine = new FormulaEngine(state, {
    filteredProjectIds: scopedProjects.map((project) => project.id),
  });

  if (definition.categoryAxis === "project") {
    const projectLabel = (project: Project) => {
      if (definition.projectLabel === "name") return project.name;
      if (definition.projectLabel === "codeAndName") return `${project.code} · ${project.name}`;
      return project.code;
    };
    const data: ChartDataSet = {
      categories: scopedProjects.map((project) => ({
        key: project.id,
        label: projectLabel(project),
      })),
      series: definition.series.map((series) => {
        let errorCount = 0;
        const values = scopedProjects.map((project) => {
          const result =
            series.sourceKind === "summaryColumn" && series.summaryColumnId
              ? engine.calculateSummaryColumn(
                  project.id,
                  series.summaryColumnId,
                  series.metricId ?? "",
                  state.selectedYear,
                  series.columnId,
                )
              : series.sourceKind === "monthlyField"
                ? engine.calculate(
                    project.id,
                    series.fieldId ?? "",
                    state.selectedYear,
                    series.month ?? state.periods.at(-1)?.month ?? 12,
                    series.columnId,
                  )
                : series.sourceKind === "summaryMetric"
                  ? engine.calculateMetric(
                      project.id,
                      series.metricId ?? "",
                      state.selectedYear,
                      series.month ?? state.periods.at(-1)?.month ?? 12,
                      series.columnId,
                    )
                  : null;
          if (!result) return null;
          if (result.state === "Error") errorCount += 1;
          return resultNumber(result);
        });
        return {
          definition: series,
          ...fieldAffixes(
            state,
            series.sourceKind === "monthlyField" ? (series.fieldId ?? "") : (series.metricId ?? ""),
          ),
          values,
          errorCount,
        };
      }),
    };
    return sortProjectData(data, definition.categorySort);
  }

  const representativeProject = scopedProjects[0];
  return {
    categories: state.periods.map((period) => ({
      key: `m:${period.month}`,
      label: `T${period.month}`,
    })),
    series: definition.series.map((series) => {
      let errorCount = 0;
      const values = state.periods.map((period) => {
        if (!representativeProject) return null;
        const result =
          series.sourceKind === "summaryRow" && series.summaryRowId
            ? engine.calculateSummaryRowAtMonth(
                representativeProject.id,
                series.summaryRowId,
                series.metricId ?? "",
                state.selectedYear,
                period.month,
                series.columnId,
              )
            : series.sourceKind === "monthlyField"
              ? engine.calculate(
                  representativeProject.id,
                  series.fieldId ?? "",
                  state.selectedYear,
                  period.month,
                  series.columnId,
                )
              : null;
        if (!result) return null;
        if (result.state === "Error") errorCount += 1;
        return resultNumber(result);
      });
      return {
        definition: series,
        ...fieldAffixes(
          state,
          series.sourceKind === "monthlyField" ? (series.fieldId ?? "") : (series.metricId ?? ""),
        ),
        values,
        errorCount,
      };
    }),
  };
}
