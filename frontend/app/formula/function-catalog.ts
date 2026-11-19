export interface FormulaFunctionMetadata {
  code: string;
  aliases?: string[];
  label: string;
  description: string;
  syntax: string;
  category: "Element-wise" | "Aggregate" | "Monthly";
  argumentTypes: string[];
  minArgs: number;
  maxArgs?: number;
  returnType: string;
  seriesBehavior: "element-wise" | "aggregate" | "series";
}

const elementWise = (
  code: string,
  description: string,
  syntax: string,
  argumentTypes: string[],
  returnType: string,
  options: Pick<FormulaFunctionMetadata, "aliases" | "minArgs" | "maxArgs">,
): FormulaFunctionMetadata => ({
  code,
  label: code,
  description,
  syntax,
  category: "Element-wise",
  argumentTypes,
  returnType,
  seriesBehavior: "element-wise",
  ...options,
});

const aggregate = (
  code: string,
  description: string,
  syntax: string,
  options: Pick<FormulaFunctionMetadata, "aliases" | "minArgs" | "maxArgs">,
): FormulaFunctionMetadata => ({
  code,
  label: code,
  description,
  syntax,
  category: "Aggregate",
  argumentTypes: ["Number hoặc chuỗi số", "…"],
  returnType: "Number",
  seriesBehavior: "aggregate",
  ...options,
});

export const functionCatalog: FormulaFunctionMetadata[] = [
  elementWise(
    "ROUND",
    "Làm tròn theo số chữ số như Excel",
    "ROUND(value, digits)",
    ["Number", "Number"],
    "Number",
    { minArgs: 2, maxArgs: 2 },
  ),
  elementWise(
    "ROUNDUP",
    "Làm tròn ra xa 0",
    "ROUNDUP(value, digits)",
    ["Number", "Number"],
    "Number",
    { minArgs: 2, maxArgs: 2 },
  ),
  elementWise(
    "ROUNDDOWN",
    "Làm tròn về 0",
    "ROUNDDOWN(value, digits)",
    ["Number", "Number"],
    "Number",
    { minArgs: 2, maxArgs: 2 },
  ),
  elementWise("ABS", "Lấy giá trị tuyệt đối", "ABS(value)", ["Number"], "Number", {
    minArgs: 1,
    maxArgs: 1,
  }),
  elementWise(
    "COALESCE",
    "Lấy giá trị đầu tiên không trống",
    "COALESCE(value1, value2, …)",
    ["Any", "…"],
    "Any",
    { minArgs: 1 },
  ),
  elementWise(
    "IF",
    "Chọn giá trị theo điều kiện",
    "IF(condition, value_if_true, value_if_false)",
    ["Boolean", "Any", "Any"],
    "Any",
    { minArgs: 3, maxArgs: 3 },
  ),
  elementWise(
    "IFERROR",
    "Dùng giá trị thay thế khi biểu thức bị lỗi",
    "IFERROR(value, value_if_error)",
    ["Any", "Any"],
    "Any",
    { minArgs: 2, maxArgs: 2 },
  ),
  elementWise(
    "AND",
    "Đúng khi tất cả điều kiện đều đúng",
    "AND(condition1, condition2, …)",
    ["Boolean", "…"],
    "Boolean",
    { minArgs: 1 },
  ),
  elementWise(
    "OR",
    "Đúng khi có ít nhất một điều kiện đúng",
    "OR(condition1, condition2, …)",
    ["Boolean", "…"],
    "Boolean",
    { minArgs: 1 },
  ),
  elementWise("NOT", "Đảo ngược điều kiện", "NOT(condition)", ["Boolean"], "Boolean", {
    minArgs: 1,
    maxArgs: 1,
  }),
  elementWise(
    "ISBLANK",
    "Kiểm tra giá trị có đang trống hay không",
    "ISBLANK(value)",
    ["Any"],
    "Boolean",
    { minArgs: 1, maxArgs: 1 },
  ),
  elementWise(
    "ISNUMBER",
    "Kiểm tra giá trị có phải là số hay không",
    "ISNUMBER(value)",
    ["Any"],
    "Boolean",
    { minArgs: 1, maxArgs: 1 },
  ),
  elementWise(
    "ISTEXT",
    "Kiểm tra giá trị có phải là văn bản hay không",
    "ISTEXT(value)",
    ["Any"],
    "Boolean",
    { minArgs: 1, maxArgs: 1 },
  ),
  aggregate("SUM", "Cộng các số hoặc chuỗi số", "SUM(number1, number2, …)", { minArgs: 1 }),
  aggregate("AVERAGE", "Tính trung bình cộng", "AVERAGE(number1, number2, …)", {
    aliases: ["AVG"],
    minArgs: 1,
  }),
  aggregate("MIN", "Lấy giá trị nhỏ nhất", "MIN(number1, number2, …)", { minArgs: 1 }),
  aggregate("MAX", "Lấy giá trị lớn nhất", "MAX(number1, number2, …)", { minArgs: 1 }),
  aggregate("COUNT", "Đếm các giá trị số", "COUNT(value1, value2, …)", { minArgs: 1 }),
  aggregate(
    "SUMPRODUCT",
    "Nhân các phần tử tương ứng rồi cộng kết quả",
    "SUMPRODUCT(array1, array2, …)",
    { minArgs: 1 },
  ),
  {
    code: "LAST",
    label: "LAST",
    description: "Lấy giá trị cuối cùng khác trống trong chuỗi tháng (hàm của hệ thống)",
    syntax: "LAST(month_series)",
    category: "Monthly",
    argumentTypes: ["Series<Any>"],
    minArgs: 1,
    maxArgs: 1,
    returnType: "Any",
    seriesBehavior: "aggregate",
  },
  {
    code: "CUMSUM",
    label: "CUMSUM",
    description: "Tính tổng lũy kế theo tháng (hàm của hệ thống)",
    syntax: "CUMSUM(month_series)",
    category: "Monthly",
    argumentTypes: ["Series<Number>"],
    minArgs: 1,
    maxArgs: 1,
    returnType: "Series<Number>",
    seriesBehavior: "series",
  },
];

export function formulaFunction(name: string): FormulaFunctionMetadata | undefined {
  const normalized = name.toUpperCase();
  return functionCatalog.find(
    (item) => item.code === normalized || item.aliases?.includes(normalized),
  );
}

export function canonicalFunctionName(name: string): string {
  return formulaFunction(name)?.code ?? name.toUpperCase();
}

export function formulaFunctionNames(): string[] {
  return functionCatalog.flatMap((item) => [item.code, ...(item.aliases ?? [])]);
}

export function hasValidFunctionArity(name: string, argumentCount: number): boolean {
  const metadata = formulaFunction(name);
  return Boolean(
    metadata &&
    argumentCount >= metadata.minArgs &&
    (metadata.maxArgs == null || argumentCount <= metadata.maxArgs),
  );
}
