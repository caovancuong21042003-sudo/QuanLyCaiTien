import type { FormulaAst, PeriodSelector } from "./ast";
import { tokenize, type Token } from "./tokenizer";

const precedence: Record<string, number> = {
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

const rightAssociative = new Set(["^"]);

function parsePeriod(value?: string): PeriodSelector | undefined {
  if (!value) return undefined;
  if (value === "current") return { kind: "current" };
  if (value === "previous") return { kind: "previous" };
  if (value === "next") return { kind: "next" };
  if (value === "even" || value === "odd" || value === "ytd") return { kind: value };
  if (value.startsWith("offset:")) return { kind: "offset", amount: Number(value.split(":")[1]) };
  if (value.startsWith("month:")) return { kind: "specific", month: Number(value.split(":")[1]) };
  if (value.startsWith("range:")) {
    const [from, to] = value.slice(6).split("-").map(Number);
    return { kind: "range", from, to };
  }
  if (value.startsWith("selected:"))
    return { kind: "selected", months: value.slice(9).split(",").map(Number) };
  throw new Error("InvalidFormula");
}

export function parseFormula(source: string): FormulaAst {
  const trimmedSource = source.trimStart();
  const tokens = tokenize(trimmedSource.startsWith("=") ? trimmedSource.slice(1) : trimmedSource);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  function primary(): FormulaAst {
    const token = consume();
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      const operand = expression(precedence["^"]);
      return token.value === "+"
        ? operand
        : { kind: "binary", operator: "-", left: { kind: "literal", value: 0 }, right: operand };
    }
    if (token.type === "number") return { kind: "literal", value: Number(token.value) };
    if (token.type === "string") return { kind: "literal", value: token.value };
    if (token.type === "reference") {
      if (token.value.startsWith("summary:")) {
        const parts = token.value.replace(/^summary:/, "").split("|");
        if ((parts[0] !== "row" && parts[0] !== "column") || !parts[1] || !parts[2] || !parts[3])
          throw new Error("InvalidFormula");
        return {
          kind: "summaryReference",
          summaryKind: parts[0],
          summaryId: parts[1],
          metricId: parts[2],
          columnId: parts[3],
          projectScope: parts[4] === "all" || parts[4] === "filtered" ? parts[4] : undefined,
        };
      }
      if (token.value.startsWith("metric:")) {
        const parts = token.value.replace(/^metric:/, "").split("|");
        if (!parts[0]) throw new Error("InvalidFormula");
        return {
          kind: "metricReference",
          metricId: parts[0],
          columnId: parts[1] || undefined,
          period: parsePeriod(parts[2]),
          projectScope: parts[3] === "all" || parts[3] === "filtered" ? parts[3] : undefined,
        };
      }
      const parts = token.value.replace(/^ref:/, "").split("|");
      return {
        kind: "fieldReference",
        fieldId: parts[0],
        columnId: parts[1] || undefined,
        period: parsePeriod(parts[2]),
        projectScope: parts[3] === "all" || parts[3] === "filtered" ? parts[3] : undefined,
      };
    }
    if (token.type === "identifier") {
      if (token.value === "NULL") return { kind: "literal", value: null };
      if (token.value === "TRUE" || token.value === "FALSE")
        return { kind: "literal", value: token.value === "TRUE" };
      if (peek().type !== "leftParen") throw new Error("InvalidFormula");
      consume();
      const args: FormulaAst[] = [];
      if (peek().type !== "rightParen") {
        do {
          args.push(expression(0));
          if (peek().type === "comma") consume();
          else break;
        } while (true);
      }
      if (consume().type !== "rightParen") throw new Error("InvalidFormula");
      return { kind: "function", name: token.value, args };
    }
    if (token.type === "leftParen") {
      const node = expression(0);
      if (consume().type !== "rightParen") throw new Error("InvalidFormula");
      return node;
    }
    throw new Error("InvalidFormula");
  }

  function expression(minimum: number): FormulaAst {
    // Thuật toán precedence climbing giữ đúng độ ưu tiên của phép nhân, so sánh và logic
    // mà không chạy trực tiếp nội dung người dùng hay phụ thuộc parser của JavaScript.
    let left = primary();
    while (peek().type === "operator" && precedence[peek().value] >= minimum) {
      const operator = consume().value as Extract<FormulaAst, { kind: "binary" }>["operator"];
      const right = expression(precedence[operator] + (rightAssociative.has(operator) ? 0 : 1));
      left = { kind: "binary", operator, left, right };
    }
    return left;
  }

  const ast = expression(0);
  if (peek().type !== "eof") throw new Error("InvalidFormula");
  return ast;
}
