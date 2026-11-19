import {
  errorResult,
  monthFromSeriesKey,
  scalar,
  series,
  valueResult,
  type CalculationResult,
  type RuntimeValue,
  type SeriesAxis,
  type TraceEntry,
} from "../domain/calculation-result";
import type { FormulaAst } from "./ast";
import { canonicalFunctionName, hasValidFunctionArity } from "./function-catalog";

export interface EvaluationContext {
  resolve(
    reference: Extract<
      FormulaAst,
      { kind: "fieldReference" | "metricReference" | "summaryReference" }
    >,
  ): CalculationResult;
}

const keys = (value: RuntimeValue) => (value.kind === "series" ? Object.keys(value.values) : []);
const at = (value: RuntimeValue, key?: string) =>
  value.kind === "scalar" ? value.value : key == null ? null : (value.values[key] ?? null);

function seriesAxes(values: RuntimeValue[]): SeriesAxis[] {
  return [...new Set(values.flatMap((value) => (value.kind === "series" ? [value.axis] : [])))];
}

function hasIncompatibleSeriesAxes(values: RuntimeValue[]): boolean {
  return seriesAxes(values).length > 1;
}

function orderedMonthKeys(value: Extract<RuntimeValue, { kind: "series" }>): string[] {
  return Object.keys(value.values).sort(
    (left, right) =>
      (monthFromSeriesKey(left) ?? Number.MAX_SAFE_INTEGER) -
      (monthFromSeriesKey(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

function mapValues(values: RuntimeValue[], callback: (items: unknown[]) => unknown): RuntimeValue {
  // Scalar được áp dụng lên từng phần tử. Series chỉ được ghép sau khi đã xác nhận
  // cùng trục, và luôn ghép bằng khóa nghiệp vụ thay vì vị trí trong mảng.
  const axis = seriesAxes(values)[0];
  const itemKeys = [...new Set(values.flatMap(keys))];
  if (!axis || !itemKeys.length) return scalar(callback(values.map((value) => at(value))));
  return series(
    axis,
    Object.fromEntries(
      itemKeys.map((key) => [key, callback(values.map((value) => at(value, key)))]),
    ),
  );
}

function flattenedValues(inputs: RuntimeValue[]): unknown[] {
  return inputs.flatMap((input) =>
    input.kind === "series" ? Object.values(input.values) : [input.value],
  );
}

function aggregate(name: string, inputs: RuntimeValue[]): CalculationResult {
  const values = flattenedValues(inputs).filter((item): item is number => typeof item === "number");
  if (name === "COUNT") return valueResult(scalar(values.length), "Number");
  // Giữ NULL khi toàn bộ nguồn chưa có dữ liệu để bảng phân biệt được "chưa nhập"
  // với số 0 thật. Đây là quy tắc nghiệp vụ chủ động khác Excel.
  if (!values.length) return valueResult(scalar(null), "Number");
  if (name === "SUM")
    return valueResult(scalar(values.reduce((sum, item) => sum + item, 0)), "Number");
  if (name === "AVERAGE")
    return valueResult(
      scalar(values.reduce((sum, item) => sum + item, 0) / values.length),
      "Number",
    );
  if (name === "MIN") return valueResult(scalar(Math.min(...values)), "Number");
  return valueResult(scalar(Math.max(...values)), "Number");
}

function sumProduct(inputs: RuntimeValue[]): CalculationResult {
  if (hasIncompatibleSeriesAxes(inputs)) return errorResult("IncompatibleSeriesAxis", "Number");
  const axis = seriesAxes(inputs)[0];
  const itemKeys = [...new Set(inputs.flatMap(keys))];
  const product = (items: unknown[]) =>
    items.reduce<number>((result, item) => result * (typeof item === "number" ? item : 0), 1);
  if (!axis || !itemKeys.length)
    return valueResult(scalar(product(inputs.map((input) => at(input)))), "Number");
  return valueResult(
    scalar(
      itemKeys.reduce((total, key) => total + product(inputs.map((input) => at(input, key))), 0),
    ),
    "Number",
  );
}

function excelRound(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = Math.abs(value) * factor;
  return (Math.sign(value) * Math.round(scaled + Number.EPSILON * Math.max(1, scaled))) / factor;
}

function evaluateBinaryValue(
  operator: Extract<FormulaAst, { kind: "binary" }>["operator"],
  left: unknown,
  right: unknown,
): { value: unknown; error?: "InvalidType" | "DivideByZero" } {
  // NULL chủ động lan truyền; muốn dùng giá trị thay thế phải viết COALESCE rõ ràng.
  if (left == null || right == null) return { value: null };
  if (
    ["+", "-", "*", "/", "^"].includes(operator) &&
    (typeof left !== "number" || typeof right !== "number")
  )
    return { value: null, error: "InvalidType" };
  if (operator === "/" && right === 0) return { value: null, error: "DivideByZero" };
  if (operator === "^" && left === 0 && (right as number) < 0)
    return { value: null, error: "DivideByZero" };
  switch (operator) {
    case "+":
      return { value: (left as number) + (right as number) };
    case "-":
      return { value: (left as number) - (right as number) };
    case "*":
      return { value: (left as number) * (right as number) };
    case "/":
      return { value: (left as number) / (right as number) };
    case "^":
      return { value: (left as number) ** (right as number) };
    case ">":
      return { value: left > right };
    case ">=":
      return { value: left >= right };
    case "<":
      return { value: left < right };
    case "<=":
      return { value: left <= right };
    case "=":
      return { value: left === right };
    case "!=":
      return { value: left !== right };
    case "AND":
      return { value: Boolean(left) && Boolean(right) };
    case "OR":
      return { value: Boolean(left) || Boolean(right) };
  }
}

export function evaluateAst(ast: FormulaAst, context: EvaluationContext): CalculationResult {
  if (ast.kind === "literal")
    return valueResult(
      scalar(ast.value),
      typeof ast.value === "boolean"
        ? "Boolean"
        : typeof ast.value === "string"
          ? "Text"
          : "Number",
    );
  if (
    ast.kind === "fieldReference" ||
    ast.kind === "metricReference" ||
    ast.kind === "summaryReference"
  )
    return context.resolve(ast);
  if (ast.kind === "binary") {
    const left = evaluateAst(ast.left, context);
    if (left.state === "Error") return left;
    if (left.value.kind === "scalar") {
      if (ast.operator === "AND" && left.value.value === false)
        return valueResult(scalar(false), "Boolean", left.trace);
      if (ast.operator === "OR" && left.value.value === true)
        return valueResult(scalar(true), "Boolean", left.trace);
    }
    const right = evaluateAst(ast.right, context);
    if (right.state === "Error") return right;
    const trace = [...left.trace, ...right.trace];
    if (hasIncompatibleSeriesAxes([left.value, right.value]))
      return errorResult("IncompatibleSeriesAxis", left.semanticType, trace);

    let binaryError: "InvalidType" | "DivideByZero" | undefined;
    const value = mapValues([left.value, right.value], ([a, b]) => {
      const evaluated = evaluateBinaryValue(ast.operator, a, b);
      binaryError ??= evaluated.error;
      return evaluated.value;
    });
    const semanticType = [">", ">=", "<", "<=", "=", "!=", "AND", "OR"].includes(ast.operator)
      ? "Boolean"
      : "Number";
    return binaryError
      ? errorResult(binaryError, semanticType, trace)
      : valueResult(value, semanticType, trace);
  }

  const name = canonicalFunctionName(ast.name);
  if (!hasValidFunctionArity(name, ast.args.length)) return errorResult("InvalidFormula", "Number");

  if (name === "IFERROR") {
    const primary = evaluateAst(ast.args[0], context);
    if (primary.state !== "Error") return primary;
    const fallback = evaluateAst(ast.args[1], context);
    if (fallback.state === "Error") return fallback;
    return {
      ...fallback,
      state: "ErrorFallback",
      originalError: primary.errorCode,
      usedFallback: true,
      trace: [...primary.trace, ...fallback.trace],
    };
  }

  let args: CalculationResult[];
  if (name === "IF") {
    const condition = evaluateAst(ast.args[0], context);
    if (condition.state === "Error") return condition;
    if (condition.value.kind === "scalar") {
      if (condition.value.value == null)
        return valueResult(scalar(null), "Number", condition.trace);
      const selected = evaluateAst(condition.value.value ? ast.args[1] : ast.args[2], context);
      return {
        ...selected,
        state:
          condition.state === "ErrorFallback" && selected.state !== "Error"
            ? "ErrorFallback"
            : selected.state,
        originalError: selected.originalError ?? condition.originalError,
        usedFallback: condition.usedFallback || selected.usedFallback,
        trace: [...condition.trace, ...selected.trace],
      };
    }
    args = [condition, ...ast.args.slice(1).map((argument) => evaluateAst(argument, context))];
  } else {
    args = ast.args.map((arg) => evaluateAst(arg, context));
  }
  const failed = args.find((result) => result.state === "Error");
  if (failed) return failed;
  const trace: TraceEntry[] = args.flatMap((result) => result.trace);
  const inputs = args.map((item) => item.value);
  const input = inputs[0];

  if (name === "LAST" && input.kind === "series" && input.axis !== "month")
    return errorResult("IncompatibleSeriesAxis", args[0].semanticType, trace);
  if (["SUM", "AVERAGE", "MIN", "MAX", "COUNT"].includes(name)) {
    const result = aggregate(name, inputs);
    return { ...result, trace };
  }
  if (name === "SUMPRODUCT") {
    const result = sumProduct(inputs);
    return { ...result, trace };
  }
  if (name === "LAST") {
    const result =
      input.kind === "series"
        ? scalar(
            orderedMonthKeys(input)
              .map((key) => input.values[key])
              .filter((item) => item != null)
              .at(-1) ?? null,
          )
        : scalar(input.value);
    return valueResult(result, args[0].semanticType, trace);
  }

  if (name === "CUMSUM") {
    if (input.kind !== "series") return errorResult("InvalidType", "Number", trace);
    if (input.axis !== "month") return errorResult("IncompatibleSeriesAxis", "Number", trace);
    let total = 0;
    const output: Record<string, unknown> = {};
    for (const key of orderedMonthKeys(input)) {
      const value = input.values[key];
      if (typeof value === "number") {
        total += value;
        output[key] = total;
      } else output[key] = null;
    }
    return valueResult(series("month", output), "Number", trace);
  }

  if (hasIncompatibleSeriesAxes(inputs))
    return errorResult("IncompatibleSeriesAxis", args[0]?.semanticType ?? "Number", trace);
  const result = mapValues(inputs, (values) => {
    if (name === "COALESCE") return values.find((item) => item != null) ?? null;
    if (name === "IF") return values[0] == null ? null : values[0] ? values[1] : values[2];
    if (name === "AND") return values.every(Boolean);
    if (name === "OR") return values.some(Boolean);
    if (name === "NOT") return !Boolean(values[0]);
    if (name === "ISBLANK") return values[0] == null;
    if (name === "ISNUMBER") return typeof values[0] === "number";
    if (name === "ISTEXT") return typeof values[0] === "string";
    if (values[0] == null || typeof values[0] !== "number") return null;
    const digits = typeof values[1] === "number" ? values[1] : 0;
    const factor = 10 ** digits;
    if (name === "ROUND") return excelRound(values[0], digits);
    if (name === "ROUNDUP")
      return (
        (values[0] >= 0 ? Math.ceil(values[0] * factor) : Math.floor(values[0] * factor)) / factor
      );
    if (name === "ROUNDDOWN")
      return (
        (values[0] >= 0 ? Math.floor(values[0] * factor) : Math.ceil(values[0] * factor)) / factor
      );
    if (name === "ABS") return Math.abs(values[0]);
    return null;
  });
  const supported = [
    "COALESCE",
    "IF",
    "AND",
    "OR",
    "NOT",
    "ISBLANK",
    "ISNUMBER",
    "ISTEXT",
    "ROUND",
    "ROUNDUP",
    "ROUNDDOWN",
    "ABS",
  ];
  if (!supported.includes(name)) return errorResult("InvalidFormula", "Number", trace);
  const semanticType = ["AND", "OR", "NOT", "ISBLANK", "ISNUMBER", "ISTEXT"].includes(name)
    ? "Boolean"
    : (args[0]?.semanticType ?? "Number");
  return valueResult(result, semanticType, trace);
}
