export type FormulaErrorCode =
  | "DivideByZero"
  | "InvalidFormula"
  | "InvalidType"
  | "IncompatibleSeriesAxis"
  | "MissingField"
  | "CircularDependency"
  | "OutOfPeriodRange";

export type SeriesAxis = "month" | "project" | "projectMonth";

export type RuntimeValue =
  | { kind: "scalar"; value: unknown }
  | { kind: "series"; axis: SeriesAxis; values: Record<string, unknown> };

export interface TraceEntry {
  label: string;
  fieldId: string;
  projectId?: string;
  referenceDepth?: number;
  month?: number;
  columnId?: string;
  value: unknown;
  semanticType: string;
}

export interface CalculationResult {
  state: "Value" | "Null" | "Error" | "ErrorFallback";
  value: RuntimeValue;
  semanticType: string;
  errorCode?: FormulaErrorCode;
  originalError?: FormulaErrorCode;
  usedFallback: boolean;
  trace: TraceEntry[];
}

export const scalar = (value: unknown): RuntimeValue => ({ kind: "scalar", value });
export const series = (axis: SeriesAxis, values: Record<string, unknown>): RuntimeValue => ({
  kind: "series",
  axis,
  values,
});

export const monthSeriesKey = (month: number) => `m:${month}`;
export const projectSeriesKey = (projectId: string) => `p:${projectId}`;
export const projectMonthSeriesKey = (projectId: string, month: number) =>
  `${projectSeriesKey(projectId)}|${monthSeriesKey(month)}`;

export const monthFromSeriesKey = (key: string): number | undefined => {
  const match = /(?:^|\|)m:(\d+)$/.exec(key);
  return match ? Number(match[1]) : undefined;
};

export const valueResult = (
  value: RuntimeValue,
  semanticType = "Number",
  trace: TraceEntry[] = [],
): CalculationResult => ({
  state:
    value.kind === "scalar" && value.value == null
      ? "Null"
      : value.kind === "series" && Object.values(value.values).every((item) => item == null)
        ? "Null"
        : "Value",
  value,
  semanticType,
  usedFallback: false,
  trace,
});

export const errorResult = (
  errorCode: FormulaErrorCode,
  semanticType = "Number",
  trace: TraceEntry[] = [],
): CalculationResult => ({
  state: "Error",
  value: scalar(null),
  semanticType,
  errorCode,
  usedFallback: false,
  trace,
});
