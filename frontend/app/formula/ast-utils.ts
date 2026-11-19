import type { FormulaDefinition, KkvState } from "../domain/types";
import type { FormulaAst, PeriodSelector } from "./ast";
import { parseFormula } from "./parser";
import {
  effectiveMonthlyField,
  effectiveProjectField,
  fieldDefinitionForProject,
} from "../domain/metadata";
import { canonicalFunctionName } from "./function-catalog";
import { summaryMetricAsField } from "../domain/metadata";

export interface DisplayToken {
  raw: string;
  label: string;
}

type BinaryOperator = Extract<FormulaAst, { kind: "binary" }>["operator"];
const operatorPrecedence: Record<BinaryOperator, number> = {
  OR: 1,
  AND: 2,
  "=": 3,
  "!=": 3,
  ">": 3,
  ">=": 3,
  "<": 3,
  "<=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
  "^": 6,
};

const projectScopeLabel = (scope: "current" | "all" | "filtered" | undefined) =>
  scope === "filtered" ? "Các dự án theo bộ lọc" : scope === "all" ? "Tất cả dự án" : undefined;

export function periodToSyntax(period?: PeriodSelector): string {
  if (!period || period.kind === "current") return "current";
  if (
    period.kind === "previous" ||
    period.kind === "next" ||
    period.kind === "even" ||
    period.kind === "odd" ||
    period.kind === "ytd"
  )
    return period.kind;
  if (period.kind === "offset") return `offset:${period.amount}`;
  if (period.kind === "specific") return `month:${period.month}`;
  if (period.kind === "range") return `range:${period.from}-${period.to}`;
  return `selected:${period.months.join(",")}`;
}

export function periodLabel(period?: PeriodSelector): string {
  if (!period || period.kind === "current") return "Tháng hiện tại";
  if (period.kind === "previous") return "Tháng trước";
  if (period.kind === "next") return "Tháng sau";
  if (period.kind === "offset")
    return `${Math.abs(period.amount)} tháng ${period.amount < 0 ? "trước" : "sau"}`;
  if (period.kind === "specific") return `Tháng ${period.month}`;
  if (period.kind === "range") return `Tháng ${period.from}→${period.to}`;
  if (period.kind === "selected") return `Tháng ${period.months.join(", ")}`;
  if (period.kind === "even") return "Các tháng chẵn";
  if (period.kind === "odd") return "Các tháng lẻ";
  return "Từ đầu năm đến hiện tại";
}

export function astToTokens(
  ast: FormulaAst,
  state: KkvState,
  projectId?: string,
  currentColumnId?: string,
): DisplayToken[] {
  return astNodeToTokens(ast, state, projectId, currentColumnId);
}

function astNodeToTokens(
  ast: FormulaAst,
  state: KkvState,
  projectId?: string,
  currentColumnId?: string,
  parentOperator?: BinaryOperator,
  side?: "left" | "right",
): DisplayToken[] {
  if (ast.kind === "literal") {
    const raw =
      ast.value === null
        ? "NULL"
        : typeof ast.value === "string"
          ? JSON.stringify(ast.value)
          : String(ast.value);
    return [{ raw, label: raw }];
  }
  if (ast.kind === "fieldReference") {
    const sourceField = projectId
      ? fieldDefinitionForProject(state, projectId, ast.fieldId)
      : state.fieldDefinitions.find((item) => item.id === ast.fieldId);
    const field =
      sourceField && projectId
        ? sourceField.scope === "monthly"
          ? effectiveMonthlyField(state, projectId, sourceField)
          : sourceField.scope === "project"
            ? effectiveProjectField(state, projectId, sourceField)
            : sourceField
        : sourceField;
    const raw =
      ast.columnId || ast.period || Boolean(ast.projectScope)
        ? `[ref:${ast.fieldId}|${ast.columnId ?? ""}|${periodToSyntax(ast.period)}${
            ast.projectScope ? `|${ast.projectScope}` : ""
          }]`
        : `[ref:${ast.fieldId}]`;
    // Reference không ghi rõ cột sẽ kế thừa cột của ô kết quả đang được tính.
    // Truyền ngữ cảnh này khi hiển thị để không mặc định nhầm thành cột Thực tế.
    const displayColumnId = ast.columnId ?? currentColumnId;
    const column =
      state.monthlyColumns.find((item) => item.id === displayColumnId)?.label ?? displayColumnId;
    const baseLabel =
      field?.scope === "monthly" || ast.columnId
        ? `[${field?.label ?? ast.fieldId} · ${column ?? "Thực tế"} · ${periodLabel(ast.period)}]`
        : `[${field?.label ?? ast.fieldId}]`;
    const scopeLabel = projectScopeLabel(ast.projectScope);
    const label = scopeLabel ? baseLabel.replace(/]$/, ` · ${scopeLabel}]`) : baseLabel;
    return [{ raw, label }];
  }
  if (ast.kind === "metricReference") {
    const metric = state.monthlySummaryMetrics.find((item) => item.id === ast.metricId);
    const field = metric ? summaryMetricAsField(metric) : undefined;
    const raw = `[metric:${ast.metricId}|${ast.columnId ?? ""}|${periodToSyntax(ast.period)}${
      ast.projectScope ? `|${ast.projectScope}` : ""
    }]`;
    const displayColumnId = ast.columnId ?? currentColumnId;
    const column =
      state.monthlyColumns.find((item) => item.id === displayColumnId)?.label ??
      displayColumnId ??
      "Thực tế";
    const baseLabel = `[${field?.label ?? ast.metricId} · ${column} · ${periodLabel(ast.period)}]`;
    const scopeLabel = projectScopeLabel(ast.projectScope);
    return [{ raw, label: scopeLabel ? baseLabel.replace(/]$/, ` · ${scopeLabel}]`) : baseLabel }];
  }
  if (ast.kind === "summaryReference") {
    const summary =
      ast.summaryKind === "row"
        ? state.summaryRows.find((item) => item.id === ast.summaryId)
        : state.summaryColumns.find((item) => item.id === ast.summaryId);
    const metric = state.monthlySummaryMetrics.find((item) => item.id === ast.metricId);
    const field = metric ? summaryMetricAsField(metric) : undefined;
    const column =
      state.monthlyColumns.find((item) => item.id === ast.columnId)?.label ?? ast.columnId;
    const scopeLabel = projectScopeLabel(ast.projectScope);
    const positionLabel = ast.summaryKind === "row" ? "Cột hiện tại" : "Kết quả cột";
    const label = `[${summary?.label ?? ast.summaryId} · ${field?.label ?? ast.metricId} · ${column} · ${positionLabel}${
      scopeLabel ? ` · ${scopeLabel}` : ""
    }]`;
    const raw = `[summary:${ast.summaryKind}|${ast.summaryId}|${ast.metricId}|${ast.columnId}${
      ast.projectScope ? `|${ast.projectScope}` : ""
    }]`;
    return [{ raw, label }];
  }
  if (ast.kind === "binary") {
    const operatorLabel = ast.operator === "*" ? "×" : ast.operator === "/" ? "÷" : ast.operator;
    const body = [
      ...astNodeToTokens(ast.left, state, projectId, currentColumnId, ast.operator, "left"),
      { raw: ast.operator, label: operatorLabel },
      ...astNodeToTokens(ast.right, state, projectId, currentColumnId, ast.operator, "right"),
    ];
    return parentOperator && needsParentheses(ast.operator, parentOperator, side)
      ? [{ raw: "(", label: "(" }, ...body, { raw: ")", label: ")" }]
      : body;
  }
  const functionName = canonicalFunctionName(ast.name);
  return [
    { raw: `${functionName}(`, label: `${functionName} (` },
    ...ast.args.flatMap((argument, index) => [
      ...(index ? [{ raw: ",", label: "," }] : []),
      ...astNodeToTokens(argument, state, projectId, currentColumnId),
    ]),
    { raw: ")", label: ")" },
  ];
}

function needsParentheses(
  child: BinaryOperator,
  parent: BinaryOperator,
  side: "left" | "right" | undefined,
) {
  const childPrecedence = operatorPrecedence[child];
  const parentPrecedence = operatorPrecedence[parent];
  if (childPrecedence < parentPrecedence) return true;
  if (childPrecedence > parentPrecedence) return false;
  if (parent === "^") return side === "left";
  if (side !== "right") return false;
  if (parent === "-" || parent === "/") return true;
  return parentPrecedence <= operatorPrecedence["="];
}

/**
 * Mở lại đúng biểu thức người dùng đã nhập. AST chỉ là nguồn tính toán; chuỗi nội bộ giữ cách
 * người dùng chủ động đặt ngoặc. Công thức sinh tự động/cũ không có chuỗi parse được sẽ dùng
 * formatter AST tối giản ở trên.
 */
export function formulaToTokens(
  formula: FormulaDefinition,
  state: KkvState,
  projectId?: string,
  currentColumnId?: string,
): DisplayToken[] {
  const source = formula.preserveUserParentheses ? formula.internalExpression?.trim() : undefined;
  if (!source) return astToTokens(formula.ast, state, projectId, currentColumnId);
  try {
    parseFormula(source);
  } catch {
    return astToTokens(formula.ast, state, projectId, currentColumnId);
  }

  const parts = source.split(/(\[(?:ref|metric|summary):[^\]]+\])/g).filter(Boolean);
  return parts.flatMap((part) => {
    if (!/^\[(?:ref|metric|summary):/.test(part)) return [{ raw: part, label: part }];
    try {
      const reference = parseFormula(part);
      return astToTokens(reference, state, projectId, currentColumnId);
    } catch {
      return [{ raw: part, label: part }];
    }
  });
}

export function astToBusinessExpression(
  ast: FormulaAst,
  state: KkvState,
  projectId?: string,
  currentColumnId?: string,
): string {
  return astToTokens(ast, state, projectId, currentColumnId)
    .map((token) => token.label)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function serializeAst(ast: FormulaAst): string {
  return astToRawTokens(ast).join(" ");
}

function astToRawTokens(
  ast: FormulaAst,
  parentOperator?: BinaryOperator,
  side?: "left" | "right",
): string[] {
  if (ast.kind === "literal")
    return [
      ast.value === null
        ? "NULL"
        : typeof ast.value === "string"
          ? JSON.stringify(ast.value)
          : String(ast.value),
    ];
  if (ast.kind === "fieldReference")
    return [
      ast.columnId || ast.period || Boolean(ast.projectScope)
        ? `[ref:${ast.fieldId}|${ast.columnId ?? ""}|${periodToSyntax(ast.period)}${
            ast.projectScope ? `|${ast.projectScope}` : ""
          }]`
        : `[ref:${ast.fieldId}]`,
    ];
  if (ast.kind === "metricReference")
    return [
      `[metric:${ast.metricId}|${ast.columnId ?? ""}|${periodToSyntax(ast.period)}${
        ast.projectScope ? `|${ast.projectScope}` : ""
      }]`,
    ];
  if (ast.kind === "summaryReference")
    return [
      `[summary:${ast.summaryKind}|${ast.summaryId}|${ast.metricId}|${ast.columnId}${
        ast.projectScope ? `|${ast.projectScope}` : ""
      }]`,
    ];
  if (ast.kind === "binary") {
    const body = [
      ...astToRawTokens(ast.left, ast.operator, "left"),
      ast.operator,
      ...astToRawTokens(ast.right, ast.operator, "right"),
    ];
    return parentOperator && needsParentheses(ast.operator, parentOperator, side)
      ? ["(", ...body, ")"]
      : body;
  }
  return [
    `${canonicalFunctionName(ast.name)}(`,
    ...ast.args.flatMap((argument, index) => [
      ...(index ? [","] : []),
      ...astToRawTokens(argument),
    ]),
    ")",
  ];
}

export function referencesInAst(ast: FormulaAst): string[] {
  if (ast.kind === "fieldReference") return [ast.fieldId];
  if (ast.kind === "binary") return [...referencesInAst(ast.left), ...referencesInAst(ast.right)];
  if (ast.kind === "function") return ast.args.flatMap(referencesInAst);
  return [];
}

export function metricReferencesInAst(ast: FormulaAst): string[] {
  if (ast.kind === "metricReference" || ast.kind === "summaryReference") return [ast.metricId];
  if (ast.kind === "binary")
    return [...metricReferencesInAst(ast.left), ...metricReferencesInAst(ast.right)];
  if (ast.kind === "function") return ast.args.flatMap(metricReferencesInAst);
  return [];
}
