import type { SeriesAxis } from "../domain/calculation-result";
import type { ProjectFieldDefinition, SemanticType } from "../domain/types";
import type { FormulaAst } from "./ast";
import { canonicalFunctionName, hasValidFunctionArity } from "./function-catalog";

export type FormulaValueType = SemanticType | "Null" | `Series<${SemanticType},${SeriesAxis}>`;

const isSeries = (type: FormulaValueType) => type.startsWith("Series<");

function seriesAxis(type: FormulaValueType): SeriesAxis | undefined {
  if (!isSeries(type)) return undefined;
  return type.slice(type.lastIndexOf(",") + 1, -1) as SeriesAxis;
}

function semanticType(type: FormulaValueType): SemanticType | "Null" {
  if (!isSeries(type)) return type as SemanticType | "Null";
  return type.slice(7, type.lastIndexOf(",")) as SemanticType;
}

function withAxis(type: SemanticType | "Null", axis?: SeriesAxis): FormulaValueType {
  if (!axis || type === "Null") return type;
  return `Series<${type},${axis}>`;
}

function commonAxis(types: FormulaValueType[]): SeriesAxis | undefined {
  const axes = [...new Set(types.flatMap((type) => (seriesAxis(type) ? [seriesAxis(type)!] : [])))];
  if (axes.length > 1) throw new Error("IncompatibleSeriesAxis");
  return axes[0];
}

const isNumeric = (type: FormulaValueType) => {
  const semantic = semanticType(type);
  return semantic === "Number";
};

const isBoolean = (type: FormulaValueType) => {
  const semantic = semanticType(type);
  return semantic === "Boolean" || semantic === "Null";
};

function requireNumeric(types: FormulaValueType[]) {
  if (types.some((type) => semanticType(type) !== "Null" && !isNumeric(type)))
    throw new Error("InvalidType");
}

function referenceAxis(
  ast: Extract<FormulaAst, { kind: "fieldReference" | "metricReference" }>,
  field: ProjectFieldDefinition,
): SeriesAxis | undefined {
  const multipleProjects = ast.projectScope === "all" || ast.projectScope === "filtered";
  const multipleMonths =
    field.scope !== "project" &&
    Boolean(ast.period && ["range", "selected", "even", "odd", "ytd"].includes(ast.period.kind));
  if (multipleProjects && multipleMonths) return "projectMonth";
  if (multipleProjects) return "project";
  if (multipleMonths) return "month";
  return undefined;
}

export function typeCheck(ast: FormulaAst, fields: ProjectFieldDefinition[]): FormulaValueType {
  // Kiểm tra kiểu trước khi tính để công thức sai không tạo ra kết quả dở dang.
  if (ast.kind === "literal") {
    if (ast.value == null) return "Null";
    if (typeof ast.value === "number") return "Number";
    if (typeof ast.value === "boolean") return "Boolean";
    return "Text";
  }
  if (ast.kind === "fieldReference") {
    const field = fields.find((item) => item.id === ast.fieldId);
    if (!field) throw new Error("MissingField");
    return withAxis(field.semanticType, referenceAxis(ast, field));
  }
  if (ast.kind === "metricReference") {
    const field = fields.find((item) => item.id === ast.metricId);
    if (!field) throw new Error("MissingField");
    return withAxis(field.semanticType, referenceAxis(ast, field));
  }
  if (ast.kind === "summaryReference") {
    const field = fields.find((item) => item.id === ast.metricId);
    if (!field) throw new Error("MissingField");
    const axis =
      ast.summaryKind === "column" &&
      (ast.projectScope === "all" || ast.projectScope === "filtered")
        ? "project"
        : undefined;
    return withAxis(field.semanticType, axis);
  }
  if (ast.kind === "binary") {
    const left = typeCheck(ast.left, fields);
    const right = typeCheck(ast.right, fields);
    const axis = commonAxis([left, right]);
    const leftSemantic = semanticType(left);
    const rightSemantic = semanticType(right);
    if (["AND", "OR"].includes(ast.operator)) {
      if (!isBoolean(left) || !isBoolean(right)) throw new Error("InvalidType");
      return withAxis("Boolean", axis);
    }
    if ([">", ">=", "<", "<=", "=", "!="].includes(ast.operator)) return withAxis("Boolean", axis);
    if (
      leftSemantic !== "Null" &&
      rightSemantic !== "Null" &&
      (!isNumeric(left) || !isNumeric(right))
    )
      throw new Error("InvalidType");
    return withAxis("Number", axis);
  }

  const name = canonicalFunctionName(ast.name);
  if (!hasValidFunctionArity(name, ast.args.length)) throw new Error("InvalidFormula");
  const argumentTypes = ast.args.map((argument) => typeCheck(argument, fields));

  if (["SUM", "AVERAGE", "MIN", "MAX", "SUMPRODUCT"].includes(name)) {
    requireNumeric(argumentTypes);
    if (name === "SUMPRODUCT") commonAxis(argumentTypes);
    return "Number";
  }
  if (name === "COUNT") return "Number";
  if (name === "LAST") {
    const input = argumentTypes[0];
    const axis = seriesAxis(input);
    if (axis && axis !== "month") throw new Error("IncompatibleSeriesAxis");
    return semanticType(input);
  }
  if (name === "CUMSUM") {
    const input = argumentTypes[0];
    if (seriesAxis(input) !== "month")
      throw new Error(seriesAxis(input) ? "IncompatibleSeriesAxis" : "InvalidType");
    if (!isNumeric(input)) throw new Error("InvalidType");
    return "Series<Number,month>";
  }
  if (name === "IF") {
    if (!isBoolean(argumentTypes[0])) throw new Error("InvalidType");
    const axis = commonAxis(argumentTypes);
    const yesType = semanticType(argumentTypes[1]);
    const noType = semanticType(argumentTypes[2]);
    return withAxis(yesType === "Null" ? noType : yesType, axis);
  }
  if (name === "IFERROR" || name === "COALESCE") {
    const axis = commonAxis(argumentTypes);
    const resultType = argumentTypes.find((type) => semanticType(type) !== "Null") ?? "Null";
    return withAxis(semanticType(resultType), axis);
  }
  if (["AND", "OR", "NOT"].includes(name)) {
    if (argumentTypes.some((type) => !isBoolean(type))) throw new Error("InvalidType");
    return withAxis("Boolean", commonAxis(argumentTypes));
  }
  if (["ISBLANK", "ISNUMBER", "ISTEXT"].includes(name))
    return withAxis("Boolean", seriesAxis(argumentTypes[0]));

  requireNumeric(argumentTypes);
  const first = argumentTypes[0];
  return withAxis("Number", commonAxis(argumentTypes) ?? seriesAxis(first));
}
