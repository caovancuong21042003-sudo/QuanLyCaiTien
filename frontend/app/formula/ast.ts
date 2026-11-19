export type PeriodSelector =
  | { kind: "current" }
  | { kind: "previous" }
  | { kind: "next" }
  | { kind: "offset"; amount: number }
  | { kind: "specific"; month: number }
  | { kind: "range"; from: number; to: number }
  | { kind: "selected"; months: number[] }
  | { kind: "even" }
  | { kind: "odd" }
  | { kind: "ytd" };

export type ProjectScope = "current" | "all" | "filtered";

export type SummaryReferenceKind = "row" | "column";

export type FormulaAst =
  | { kind: "literal"; value: number | string | boolean | null }
  | {
      kind: "fieldReference";
      fieldId: string;
      columnId?: string;
      period?: PeriodSelector;
      projectScope?: ProjectScope;
    }
  | {
      kind: "metricReference";
      metricId: string;
      columnId?: string;
      period?: PeriodSelector;
      projectScope?: ProjectScope;
    }
  | {
      kind: "summaryReference";
      summaryKind: SummaryReferenceKind;
      summaryId: string;
      metricId: string;
      columnId: string;
      projectScope?: ProjectScope;
    }
  | {
      kind: "binary";
      operator: "+" | "-" | "*" | "/" | "^" | ">" | ">=" | "<" | "<=" | "=" | "!=" | "AND" | "OR";
      left: FormulaAst;
      right: FormulaAst;
    }
  | { kind: "function"; name: string; args: FormulaAst[] };

export const ref = (
  fieldId: string,
  columnId?: string,
  period?: PeriodSelector,
  projectScope?: ProjectScope,
): FormulaAst => ({ kind: "fieldReference", fieldId, columnId, period, projectScope });

export const metricRef = (
  metricId: string,
  columnId?: string,
  period?: PeriodSelector,
  projectScope?: ProjectScope,
): FormulaAst => ({ kind: "metricReference", metricId, columnId, period, projectScope });

export const summaryRef = (
  summaryKind: SummaryReferenceKind,
  summaryId: string,
  metricId: string,
  columnId: string,
  projectScope?: ProjectScope,
): FormulaAst => ({
  kind: "summaryReference",
  summaryKind,
  summaryId,
  metricId,
  columnId,
  projectScope,
});

export const lit = (value: number | string | boolean | null): FormulaAst => ({
  kind: "literal",
  value,
});

export const binary = (
  operator: Extract<FormulaAst, { kind: "binary" }>["operator"],
  left: FormulaAst,
  right: FormulaAst,
): FormulaAst => ({ kind: "binary", operator, left, right });
