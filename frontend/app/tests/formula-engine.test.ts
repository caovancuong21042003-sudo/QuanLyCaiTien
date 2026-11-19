import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_YEAR } from "../data/seed";
import {
  effectiveMonthlyField,
  fieldFormulaForColumn,
  formatFieldValue,
  monthlyFieldAllowsColumn,
  monthlyFieldsForProject,
  monthlyLayoutForProject,
  projectsForYear,
  richTextToPlainText,
} from "../domain/metadata";
import { scalar, series, valueResult } from "../domain/calculation-result";
import { binary, lit, ref, type FormulaAst } from "../formula/ast";
import { evaluateAst } from "../formula/evaluator";
import { FormulaEngine } from "../formula/formula-engine";
import { parseFormula } from "../formula/parser";
import { typeCheck } from "../formula/type-checker";
import { astToTokens } from "../formula/ast-utils";
import { migrateState } from "../repositories/local-storage-repository";
import type { ProjectMonthlyFieldConfig } from "../domain/types";

const scalarValue = (result: ReturnType<FormulaEngine["evaluate"]>) =>
  result.value.kind === "scalar" ? result.value.value : undefined;
const formula = (targetId: string, ast: FormulaAst) => ({
  id: `test-${targetId}`,
  ast,
  businessExpression: "test",
  internalExpression: "test",
});
const fn = (name: string, args: FormulaAst[]): FormulaAst => ({ kind: "function", name, args });
const zeroWhenBlankOrError = (value: FormulaAst): FormulaAst =>
  fn("IFERROR", [fn("IF", [fn("ISBLANK", [value]), lit(0), value]), lit(0)]);
const annualSummaryValue = (
  state: ReturnType<typeof createSeedState>,
  projectId: string,
  metricId: string,
  columnId: string,
) => {
  const summaryColumn = state.summaryColumns.find((item) => item.code === "annualTotal")!;
  const result = new FormulaEngine(state).calculateSummaryColumn(
    projectId,
    summaryColumn.id,
    metricId,
    state.selectedYear,
    columnId,
  );
  return result.value.kind === "scalar" ? result.value.value : null;
};

describe("Formula Engine", () => {
  it("tự chọn cột mặc định theo role Thực tế thay vì ID được viết cứng", () => {
    const state = createSeedState();
    const project = state.projects[0];
    state.monthlyColumns = [
      ...state.monthlyColumns.map((column) =>
        column.role === "actual" ? { ...column, role: undefined } : column,
      ),
      {
        id: "actual-column-by-role",
        code: "actualResult",
        label: "Kết quả",
        role: "actual",
        sortOrder: 30,
      },
    ];
    state.fieldDefinitions.push({
      id: "role-default-field",
      code: "roleDefaultField",
      label: "Giá trị theo cột mặc định",
      scope: "monthly",
      ownerType: "project",
      ownerId: project.id,
      columnType: "standalone",
      semanticType: "Number",
      displayMode: "number",
      inputMode: "manual",
      rowIndex: 1,
      sortOrder: 999,
    });
    state.projectMonthlyFieldConfigs.push({
      projectId: project.id,
      fieldId: "role-default-field",
      visible: true,
      allowedColumnIds: ["actual-column-by-role"],
    });
    state.monthlyValues.push({
      projectId: project.id,
      fieldId: "role-default-field",
      year: state.selectedYear,
      month: 1,
      columnId: "actual-column-by-role",
      value: 44,
    });

    expect(
      scalarValue(
        new FormulaEngine(state).calculate(project.id, "role-default-field", state.selectedYear, 1),
      ),
    ).toBe(44);
  });

  it("ưu tiên công thức riêng của dự án, sau đó mới dùng công thức của mẫu", () => {
    const state = createSeedState();
    const project = state.projects[0];
    const template = state.projectFieldTemplates.find((item) => item.id === project.templateId)!;
    template.formulas = [
      ...(template.formulas ?? []).filter(
        (item) => !(item.fieldId === "savingUsd" && item.columnId === "actual"),
      ),
      {
        fieldId: "savingUsd",
        columnId: "actual",
        formula: formula("savingUsd", lit(123)),
      },
    ];
    state.formulaOverrides = state.formulaOverrides.filter(
      (item) => !(item.projectId === project.id && item.fieldId === "savingUsd"),
    );
    state.monthlyValues = state.monthlyValues.filter(
      (item) =>
        !(
          item.projectId === project.id &&
          item.fieldId === "savingUsd" &&
          item.columnId === "actual" &&
          item.month === 1
        ),
    );

    expect(
      scalarValue(
        new FormulaEngine(state).calculate(project.id, "savingUsd", DEMO_YEAR, 1, "actual"),
      ),
    ).toBe(123);

    state.formulaOverrides.push({
      id: "override-template-test",
      projectId: project.id,
      fieldId: "savingUsd",
      columnId: "actual",
      year: DEMO_YEAR,
      months: [1],
      formula: formula("savingUsd", lit(456)),
    });
    expect(
      scalarValue(
        new FormulaEngine(state).calculate(project.id, "savingUsd", DEMO_YEAR, 1, "actual"),
      ),
    ).toBe(456);
  });

  it("hàm SUM chưa có tham số không làm evaluator phát sinh exception", () => {
    const ast: FormulaAst = { kind: "function", name: "SUM", args: [] };
    const result = evaluateAst(ast, {
      resolve: () => valueResult(scalar(null)),
    });

    expect(result.state).toBe("Error");
    expect(result.errorCode).toBe("InvalidFormula");
    expect(() => typeCheck(ast, createSeedState().fieldDefinitions)).toThrow("InvalidFormula");
  });

  it("SUM nhận nhiều đối số giống cách nhập quen thuộc trong Excel", () => {
    const ast = parseFormula("=SUM(1, 2, 3)");
    expect(typeCheck(ast, [])).toBe("Number");
    expect(
      scalarValue(
        evaluateAst(ast, {
          resolve: () => valueResult(scalar(null)),
        }),
      ),
    ).toBe(6);
  });

  it("chấp nhận dấu chấm phẩy làm dấu phân cách đối số", () => {
    const ast = parseFormula("SUM(1; 2; 3)");
    expect(
      scalarValue(
        evaluateAst(ast, {
          resolve: () => valueResult(scalar(null)),
        }),
      ),
    ).toBe(6);
  });

  it("AVERAGE thân thiện với Excel và vẫn tương thích AVG cũ", () => {
    const calculate = (source: string) =>
      scalarValue(
        evaluateAst(parseFormula(source), {
          resolve: () => valueResult(scalar(null)),
        }),
      );

    expect(calculate("AVERAGE(2, 4, 9)")).toBe(5);
    expect(calculate("AVG(2, 4, 9)")).toBe(5);
  });

  it("IFERROR chỉ tính giá trị thay thế khi biểu thức đầu bị lỗi", () => {
    const fallback = evaluateAst(parseFormula("IFERROR(10 / 0, 99)"), {
      resolve: () => valueResult(scalar(null)),
    });
    const untouched = evaluateAst(parseFormula("IFERROR(10 / 2, 99)"), {
      resolve: () => valueResult(scalar(null)),
    });

    expect(scalarValue(fallback)).toBe(99);
    expect(fallback).toMatchObject({ state: "ErrorFallback", originalError: "DivideByZero" });
    expect(scalarValue(untouched)).toBe(5);
    expect(untouched.usedFallback).toBe(false);
  });

  it("hỗ trợ hàm logic và hàm kiểm tra giá trị quen thuộc", () => {
    const calculate = (source: string) =>
      scalarValue(
        evaluateAst(parseFormula(source), {
          resolve: () => valueResult(scalar(null)),
        }),
      );

    expect(calculate("AND(TRUE, 2 > 1, NOT(FALSE))")).toBe(true);
    expect(calculate("OR(FALSE, 2 < 1, TRUE)")).toBe(true);
    expect(calculate("ISBLANK(NULL)")).toBe(true);
    expect(calculate("ISNUMBER(-12.5)")).toBe(true);
    expect(calculate('ISTEXT("KKV")')).toBe(true);
  });

  it("hỗ trợ cú pháp số âm, lũy thừa và dấu khác Excel", () => {
    const calculate = (source: string) =>
      scalarValue(
        evaluateAst(parseFormula(source), {
          resolve: () => valueResult(scalar(null)),
        }),
      );

    expect(calculate("=-2^2")).toBe(-4);
    expect(calculate("=2^-2")).toBe(0.25);
    expect(calculate("1<>2")).toBe(true);
  });

  it("ROUND làm tròn số âm ra xa 0 tại điểm giữa như Excel", () => {
    const result = evaluateAst(parseFormula("ROUND(-1.5, 0)"), {
      resolve: () => valueResult(scalar(null)),
    });
    expect(scalarValue(result)).toBe(-2);
  });

  it("SUMPRODUCT nhân các phần tử cùng khóa rồi cộng", () => {
    const result = evaluateAst(
      {
        kind: "function",
        name: "SUMPRODUCT",
        args: [ref("quantity"), ref("price")],
      },
      {
        resolve: (reference) =>
          valueResult(
            reference.kind === "fieldReference" && reference.fieldId === "quantity"
              ? series("month", { "m:1": 2, "m:2": 3, "m:3": null })
              : series("month", { "m:1": 10, "m:2": 20, "m:3": 30 }),
            "Number",
          ),
      },
    );

    expect(scalarValue(result)).toBe(80);
  });

  it("LAST lấy giá trị cuối cùng khác NULL của một chuỗi", () => {
    const result = evaluateAst(
      {
        kind: "function",
        name: "LAST",
        args: [ref("value", undefined, { kind: "range", from: 1, to: 4 })],
      },
      {
        resolve: () =>
          valueResult(
            series("month", { "m:1": 10, "m:2": null, "m:3": 25, "m:4": null }),
            "Number",
          ),
      },
    );
    expect(scalarValue(result)).toBe(25);
  });

  it("hiển thị reference kế thừa đúng cột của ô đang tính", () => {
    const state = createSeedState();
    state.formulaOverrides = state.formulaOverrides.filter(
      (item) => !(item.projectId === "project-2" && item.fieldId === "savingUsd"),
    );
    state.formulaOverrides.push({
      id: "test-inherited-column",
      projectId: "project-2",
      fieldId: "savingUsd",
      columnId: "plan",
      year: DEMO_YEAR,
      months: [3],
      formula: formula("savingUsd", ref("savingHours", undefined, { kind: "current" })),
    });
    state.formulaOverrides.push({
      id: "test-inherited-column-actual",
      projectId: "project-2",
      fieldId: "savingUsd",
      columnId: "actual",
      year: DEMO_YEAR,
      months: [3],
      formula: formula("savingUsd", ref("savingHours", undefined, { kind: "current" })),
    });
    const engine = new FormulaEngine(state);

    const planExpression = engine.formulaExpression("project-2", "savingUsd", DEMO_YEAR, 3, "plan");
    const actualExpression = engine.formulaExpression(
      "project-2",
      "savingUsd",
      DEMO_YEAR,
      3,
      "actual",
    );

    expect(planExpression).toContain("Mức cải thiện · Kế hoạch · Tháng hiện tại");
    expect(planExpression).not.toContain("Mức cải thiện · Thực tế · Tháng hiện tại");
    expect(actualExpression).toContain("Mức cải thiện · Thực tế · Tháng hiện tại");
  });

  it("parser giữ phạm vi tất cả dự án của reference tổng hợp", () => {
    expect(parseFormula("[ref:savingUsd|actual|current|all]")).toEqual({
      kind: "fieldReference",
      fieldId: "savingUsd",
      columnId: "actual",
      period: { kind: "current" },
      projectScope: "all",
    });
  });

  it("parser giữ phạm vi dự án theo bộ lọc", () => {
    expect(parseFormula("[ref:savingUsd|actual|current|filtered]")).toEqual({
      kind: "fieldReference",
      fieldId: "savingUsd",
      columnId: "actual",
      period: { kind: "current" },
      projectScope: "filtered",
    });
  });

  it("parser phân biệt tham chiếu field dự án và chỉ tiêu tổng hợp", () => {
    expect(parseFormula("[ref:productionQty|actual|current]")).toMatchObject({
      kind: "fieldReference",
      fieldId: "productionQty",
    });
    expect(parseFormula("[metric:savingUsd|actual|current|filtered]")).toEqual({
      kind: "metricReference",
      metricId: "savingUsd",
      columnId: "actual",
      period: { kind: "current" },
      projectScope: "filtered",
    });
  });

  it("1. nhân semantic monthly reference với project field", () => {
    const result = evaluateAst(binary("*", ref("hours"), ref("cost")), {
      resolve: (reference) =>
        valueResult(
          scalar(reference.kind === "fieldReference" && reference.fieldId === "hours" ? 28.71 : 18),
        ),
    });
    expect(scalarValue(result)).toBeCloseTo(516.78);
  });

  it("2. self-reference cùng tháng trả CircularDependency", () => {
    const state = createSeedState();
    state.formulaOverrides = [];
    const field = state.fieldDefinitions.find((item) => item.code === "savingHours")!;
    field.formula = formula(field.id, ref(field.id, "actual", { kind: "current" }));
    expect(
      new FormulaEngine(state).calculate("project-1", field.id, DEMO_YEAR, 2, "actual").errorCode,
    ).toBe("CircularDependency");
  });

  it("3. self-reference tháng trước hợp lệ khi công thức tự xử lý giá trị thiếu", () => {
    const state = createSeedState();
    const field = state.fieldDefinitions.find((item) => item.code === "cumulativeSaving")!;
    const result = new FormulaEngine(state).calculate(
      "project-1",
      field.id,
      DEMO_YEAR,
      4,
      "actual",
    );
    expect(result.state, JSON.stringify(result)).toBe("Value");
    expect(typeof scalarValue(result)).toBe("number");
  });

  it("công thức tự coi kết quả tháng trước bị trống hoặc lỗi là 0", () => {
    const state = createSeedState();
    state.formulaOverrides = state.formulaOverrides.filter(
      (item) => !(item.projectId === "project-5" && item.fieldId === "cumulativeReductionPeople"),
    );
    const field = state.fieldDefinitions.find((item) => item.code === "cumulativeReductionPeople")!;
    field.inputMode = "formula";
    field.formula = formula(
      field.id,
      binary(
        "+",
        ref("reductionPeople", "plan", { kind: "current" }),
        zeroWhenBlankOrError(ref(field.id, "plan", { kind: "previous" })),
      ),
    );

    const engine = new FormulaEngine(state);

    expect(scalarValue(engine.calculate("project-5", field.id, DEMO_YEAR, 4, "plan"))).toBeNull();
    expect(scalarValue(engine.calculate("project-5", field.id, DEMO_YEAR, 5, "plan"))).toBe(2);
    expect(scalarValue(engine.calculate("project-5", field.id, DEMO_YEAR, 6, "plan"))).toBe(4);
  });

  it("công thức riêng tự xử lý tháng trước chưa có dữ liệu", () => {
    const state = createSeedState();
    const fieldId = "cumulativeReductionPeople";
    state.formulaOverrides.push({
      id: "override-cumulative-from-may",
      projectId: "project-1",
      fieldId,
      columnId: "plan",
      year: DEMO_YEAR,
      months: [5, 6, 7, 8, 9, 10, 11, 12],
      formula: formula(
        fieldId,
        binary(
          "+",
          zeroWhenBlankOrError(ref(fieldId, undefined, { kind: "previous" })),
          ref("reductionPeople", undefined, { kind: "current" }),
        ),
      ),
    });

    const engine = new FormulaEngine(state);
    const input = scalarValue(
      engine.calculate("project-1", "reductionPeople", DEMO_YEAR, 5, "plan"),
    );
    const result = scalarValue(engine.calculate("project-1", fieldId, DEMO_YEAR, 5, "plan"));

    expect(result).toBe(input);
  });

  it("4. January tham chiếu Previous Month không vượt năm", () => {
    const state = createSeedState();
    const result = new FormulaEngine(state).evaluate(
      "project-1",
      ref("productionQty", "actual", { kind: "previous" }),
      DEMO_YEAR,
      1,
      "actual",
    );
    expect(scalarValue(result)).toBeNull();
    expect(result.errorCode).toBe("OutOfPeriodRange");
  });

  it("5. Previous Month không bỏ qua tháng NULL", () => {
    const state = createSeedState();
    state.monthlyValues.push({
      projectId: "project-1",
      fieldId: "productionQty",
      year: DEMO_YEAR,
      month: 2,
      columnId: "actual",
      value: null,
    });
    const result = new FormulaEngine(state).evaluate(
      "project-1",
      ref("productionQty", "actual", { kind: "previous" }),
      DEMO_YEAR,
      3,
      "actual",
    );
    expect(result.state).toBe("Null");
    expect(scalarValue(result)).toBeNull();
  });

  it("6. NULL + 10 vẫn là NULL", () => {
    const result = evaluateAst(binary("+", lit(null), lit(10)), {
      resolve: () => valueResult(scalar(null)),
    });
    expect(result.state).toBe("Null");
  });

  it("7. COALESCE(NULL, 0) trả 0", () => {
    const result = evaluateAst(
      { kind: "function", name: "COALESCE", args: [lit(null), lit(0)] },
      { resolve: () => valueResult(scalar(null)) },
    );
    expect(scalarValue(result)).toBe(0);
  });

  it("8. SUM bỏ qua phần tử NULL", () => {
    const result = evaluateAst(
      { kind: "function", name: "SUM", args: [ref("values")] },
      {
        resolve: () => valueResult(series("month", { "m:1": 10, "m:2": null, "m:3": 5 })),
      },
    );
    expect(scalarValue(result)).toBe(15);
  });

  it("9. SUM toàn NULL trả NULL", () => {
    const result = evaluateAst(
      { kind: "function", name: "SUM", args: [ref("values")] },
      { resolve: () => valueResult(series("month", { "m:1": null, "m:2": null })) },
    );
    expect(scalarValue(result)).toBeNull();
  });

  it("10. chia cho 0 trả DivideByZero", () => {
    expect(
      evaluateAst(binary("/", lit(10), lit(0)), { resolve: () => valueResult(scalar(null)) })
        .errorCode,
    ).toBe("DivideByZero");
  });

  it("IF chỉ tính nhánh được chọn khi điều kiện là scalar", () => {
    const divideByZero = binary("/", lit(10), lit(0));
    const whenTrue = evaluateAst(
      { kind: "function", name: "IF", args: [lit(true), lit(25), divideByZero] },
      { resolve: () => valueResult(scalar(null)) },
    );
    const whenFalse = evaluateAst(
      { kind: "function", name: "IF", args: [lit(false), divideByZero, lit(40)] },
      { resolve: () => valueResult(scalar(null)) },
    );

    expect(scalarValue(whenTrue)).toBe(25);
    expect(scalarValue(whenFalse)).toBe(40);
  });

  it("IF vẫn trả lỗi nếu lỗi nằm trong nhánh được chọn", () => {
    const result = evaluateAst(
      {
        kind: "function",
        name: "IF",
        args: [lit(true), binary("/", lit(10), lit(0)), lit(0)],
      },
      { resolve: () => valueResult(scalar(null)) },
    );

    expect(result.errorCode).toBe("DivideByZero");
  });

  it("AND và OR dừng sớm khi vế trái đã quyết định kết quả", () => {
    const invalidRight = binary(">", binary("/", lit(10), lit(0)), lit(1));
    const andResult = evaluateAst(binary("AND", lit(false), invalidRight), {
      resolve: () => valueResult(scalar(null)),
    });
    const orResult = evaluateAst(binary("OR", lit(true), invalidRight), {
      resolve: () => valueResult(scalar(null)),
    });

    expect(scalarValue(andResult)).toBe(false);
    expect(scalarValue(orResult)).toBe(true);
  });

  it("AND và OR vẫn tính vế phải khi vế trái chưa quyết định kết quả", () => {
    const invalidRight = binary(">", binary("/", lit(10), lit(0)), lit(1));
    const andResult = evaluateAst(binary("AND", lit(true), invalidRight), {
      resolve: () => valueResult(scalar(null)),
    });
    const orResult = evaluateAst(binary("OR", lit(false), invalidRight), {
      resolve: () => valueResult(scalar(null)),
    });

    expect(andResult.errorCode).toBe("DivideByZero");
    expect(orResult.errorCode).toBe("DivideByZero");
  });

  it("IF với điều kiện series vẫn tính theo từng khóa cùng trục", () => {
    const result = evaluateAst(
      { kind: "function", name: "IF", args: [ref("condition"), lit(1), lit(0)] },
      {
        resolve: () =>
          valueResult(series("project", { "p:project-a": true, "p:project-b": false }), "Boolean"),
      },
    );

    expect(result.value).toEqual(series("project", { "p:project-a": 1, "p:project-b": 0 }));
  });

  it("11. Text nhân Number bị chặn type", () => {
    const state = createSeedState();
    const ast = binary("*", { kind: "literal", value: "text" }, lit(2));
    expect(() => typeCheck(ast, state.fieldDefinitions)).toThrow("InvalidType");
    expect(new FormulaEngine(state).evaluate("project-1", ast, DEMO_YEAR, 1).errorCode).toBe(
      "InvalidType",
    );
  });

  it("12. Series nhân Scalar theo từng tháng", () => {
    const result = evaluateAst(binary("*", ref("series"), lit(2)), {
      resolve: () => valueResult(series("month", { "m:1": 4, "m:3": 6 })),
    });
    expect(result.value).toEqual(series("month", { "m:1": 8, "m:3": 12 }));
  });

  it("13. hai Series match theo month key, không theo index", () => {
    const result = evaluateAst(binary("+", ref("left"), ref("right")), {
      resolve: (reference) =>
        valueResult(
          reference.kind === "fieldReference" && reference.fieldId === "left"
            ? series("month", { "m:1": 10, "m:3": 30 })
            : series("month", { "m:2": 20, "m:3": 3 }),
        ),
    });
    expect(result.value).toEqual(series("month", { "m:1": null, "m:2": null, "m:3": 33 }));
  });

  it("ghép hai chuỗi dự án theo ID, không phụ thuộc thứ tự phần tử", () => {
    const result = evaluateAst(binary("/", ref("defects"), ref("production")), {
      resolve: (reference) =>
        valueResult(
          reference.kind === "fieldReference" && reference.fieldId === "defects"
            ? series("project", { "p:project-b": 10, "p:project-a": 5 })
            : series("project", { "p:project-a": 100, "p:project-b": 200 }),
        ),
    });

    expect(result.value).toEqual(series("project", { "p:project-b": 0.05, "p:project-a": 0.05 }));
  });

  it("chặn phép toán trực tiếp giữa chuỗi tháng và chuỗi dự án", () => {
    const result = evaluateAst(binary("+", ref("monthly"), ref("projects")), {
      resolve: (reference) =>
        valueResult(
          reference.kind === "fieldReference" && reference.fieldId === "monthly"
            ? series("month", { "m:1": 10 })
            : series("project", { "p:project-1": 20 }),
        ),
    });

    expect(result.errorCode).toBe("IncompatibleSeriesAxis");
  });

  it("type checker phát hiện hai reference khác trục trước khi tính", () => {
    const state = createSeedState();
    const ast = binary(
      "+",
      ref("savingUsd", "actual", { kind: "range", from: 1, to: 3 }),
      ref("savingUsd", "actual", { kind: "current" }, "all"),
    );

    expect(() => typeCheck(ast, state.fieldDefinitions)).toThrow("IncompatibleSeriesAxis");
  });

  it("LAST và CUMSUM không nhận chuỗi dự án", () => {
    const context = {
      resolve: () => valueResult(series("project", { "p:project-1": 10, "p:project-2": 20 })),
    };
    const last = evaluateAst({ kind: "function", name: "LAST", args: [ref("values")] }, context);
    const cumulative = evaluateAst(
      { kind: "function", name: "CUMSUM", args: [ref("values")] },
      context,
    );

    expect(last.errorCode).toBe("IncompatibleSeriesAxis");
    expect(cumulative.errorCode).toBe("IncompatibleSeriesAxis");
  });

  it("reference nhiều dự án và nhiều tháng giữ trục cùng khóa dự án-tháng", () => {
    const state = createSeedState();
    const projects = projectsForYear(state).slice(0, 2);
    const engine = new FormulaEngine(state, {
      filteredProjectIds: projects.map((project) => project.id),
    });
    const result = engine.evaluate(
      projects[0].id,
      ref("savingUsd", "actual", { kind: "range", from: 1, to: 2 }, "filtered"),
      DEMO_YEAR,
      2,
      "actual",
    );

    expect(result.value.kind).toBe("series");
    if (result.value.kind !== "series") return;
    expect(result.value.axis).toBe("projectMonth");
    expect(Object.keys(result.value.values)).toEqual(
      expect.arrayContaining([
        `p:${projects[0].id}|m:1`,
        `p:${projects[0].id}|m:2`,
        `p:${projects[1].id}|m:1`,
        `p:${projects[1].id}|m:2`,
      ]),
    );
  });

  it("14. phát hiện vòng giữa hai field", () => {
    const state = createSeedState();
    state.formulaOverrides = [];
    state.fieldDefinitions.find((item) => item.code === "savingHours")!.formula = formula(
      "savingHours",
      ref("savingUsd", "actual", { kind: "current" }),
    );
    state.fieldDefinitions.find((item) => item.code === "savingUsd")!.formula = formula(
      "savingUsd",
      ref("savingHours", "actual", { kind: "current" }),
    );
    expect(
      new FormulaEngine(state).calculate("project-1", "savingHours", DEMO_YEAR, 4, "actual")
        .errorCode,
    ).toBe("CircularDependency");
  });

  it("15. Phần trăm lưu đúng số người dùng nhìn thấy", () => {
    const field = createSeedState().fieldDefinitions.find((item) => item.code === "defectRate")!;
    expect(field.semanticType).toBe("Number");
    expect(formatFieldValue(5, field)).toBe("5%");
  });

  it("prefix và suffix riêng của project thay cách hiển thị mặc định", () => {
    const field = createSeedState().fieldDefinitions.find((item) => item.code === "budget")!;
    expect(formatFieldValue(6800, field, { leftNote: "Chi phí AMR", rightNote: "USD/dự án" })).toBe(
      "Chi phí AMR 6.800 USD/dự án",
    );
  });

  it("16. override ưu tiên hơn default formula", () => {
    const state = createSeedState();
    state.formulaOverrides = [
      {
        id: "test-override",
        projectId: "project-1",
        fieldId: "savingUsd",
        columnId: "actual",
        year: DEMO_YEAR,
        months: [5],
        formula: formula(
          "savingUsd",
          binary("*", ref("savingHours", "actual", { kind: "current" }), lit(20)),
        ),
      },
    ];
    const engine = new FormulaEngine(state);
    const hours = Number(
      scalarValue(engine.calculate("project-1", "savingHours", DEMO_YEAR, 5, "actual")),
    );
    const saving = Number(
      scalarValue(engine.calculate("project-1", "savingUsd", DEMO_YEAR, 5, "actual")),
    );
    expect(saving).toBeCloseTo(hours * 20);
  });

  it("công thức mặc định chỉ áp dụng cho các cột đã chọn", () => {
    const state = createSeedState();
    const field = state.fieldDefinitions.find((item) => item.code === "savingHours")!;
    state.formulaOverrides = state.formulaOverrides.filter(
      (override) => override.fieldId !== field.id,
    );
    field.inputMode = "formula";
    field.formula = {
      ...formula(field.id, lit(42)),
      columnId: "plan",
    };
    state.monthlyValues.push({
      projectId: "project-1",
      fieldId: field.id,
      year: DEMO_YEAR,
      month: 5,
      columnId: "actual",
      value: 7,
    });

    const engine = new FormulaEngine(state);

    expect(scalarValue(engine.calculate("project-1", field.id, DEMO_YEAR, 5, "plan"))).toBe(42);
    expect(scalarValue(engine.calculate("project-1", field.id, DEMO_YEAR, 5, "actual"))).toBe(7);
    expect(engine.formulaExpression("project-1", field.id, DEMO_YEAR, 5, "actual")).toBeUndefined();
  });

  it("17. một override áp dụng cho nhiều tháng", () => {
    const state = createSeedState();
    state.formulaOverrides = [
      {
        id: "test-override-range",
        projectId: "project-1",
        fieldId: "savingUsd",
        columnId: "actual",
        year: DEMO_YEAR,
        months: [5, 6, 7],
        formula: formula(
          "savingUsd",
          binary("*", ref("savingHours", "actual", { kind: "current" }), lit(20)),
        ),
      },
    ];
    const engine = new FormulaEngine(state);
    for (const month of [5, 6, 7]) {
      const hours = Number(
        scalarValue(engine.calculate("project-1", "savingHours", DEMO_YEAR, month, "actual")),
      );
      expect(
        Number(scalarValue(engine.calculate("project-1", "savingUsd", DEMO_YEAR, month, "actual"))),
      ).toBeCloseTo(hours * 20);
    }
  });

  it("18. trace giữ cả monthly reference và project field", () => {
    const result = new FormulaEngine(createSeedState()).calculate(
      "project-3",
      "savingHours",
      DEMO_YEAR,
      5,
      "actual",
    );
    expect(
      result.trace.some((item) => item.fieldId === "productionQty" && item.month === 5),
      JSON.stringify(result),
    ).toBe(true);
    expect(
      result.trace.some((item) => item.fieldId === "baselineCycle" && item.month == null),
    ).toBe(true);
  });

  it("trace không lặp lại chính trường tham chiếu trực tiếp", () => {
    const state = createSeedState();
    const result = new FormulaEngine(state).evaluate(
      state.projects[0].id,
      ref("productionQty", "actual", { kind: "current" }),
      DEMO_YEAR,
      6,
      "actual",
    );

    expect(
      result.trace.filter(
        (entry) =>
          entry.fieldId === "productionQty" && entry.month === 6 && entry.columnId === "actual",
      ),
    ).toHaveLength(1);
  });

  it("parser tạo AST từ semantic reference an toàn", () => {
    expect(
      parseFormula("ROUNDUP([ref:productionQty|actual|range:1-6] / [ref:factor], 0)").kind,
    ).toBe("function");
  });

  it("công thức đã lưu có thể nạp lại thành token và parse để sửa", () => {
    const state = createSeedState();
    const original = fieldFormulaForColumn(
      state.fieldDefinitions.find((item) => item.code === "savingHours"),
      "actual",
    )!.ast;
    const reloaded = astToTokens(original, state)
      .map((token) => token.raw)
      .join(" ");
    expect(parseFormula(reloaded)).toEqual(original);
  });

  it("tham chiếu theo cột kết quả không bị đổi thành Thực tế khi mở để sửa", () => {
    const state = createSeedState();
    const original = ref("productionQty", undefined, { kind: "current" });
    const tokens = astToTokens(original, state, state.projects[0].id, "plan");
    const reloaded = tokens.map((token) => token.raw).join(" ");

    expect(tokens[0].label).toContain("Kế hoạch");
    expect(reloaded).toBe("[ref:productionQty||current]");
    expect(parseFormula(reloaded)).toEqual(original);
  });

  it("project field ở input mode Formula được tính thay vì đọc stored value", () => {
    const state = createSeedState();
    const budget = state.fieldValues.find(
      (item) => item.projectId === "project-1" && item.fieldId === "budget",
    )!;
    budget.value = { numericValue: 9000, rightNote: "USD" };
    state.fieldDefinitions.push({
      id: "project-formula",
      code: "annualBudgetDouble",
      label: "Ngân sách x2",
      scope: "project",
      ownerType: "project",
      ownerId: "project-1",
      columnType: "standalone",
      semanticType: "Number",
      displayMode: "number",
      suffix: "USD",
      inputMode: "formula",
      rowIndex: 1,
      sortOrder: 999,
      formula: formula("project-formula", binary("*", ref("budget"), lit(2))),
    });
    const result = new FormulaEngine(state).calculate(
      "project-1",
      "project-formula",
      DEMO_YEAR,
      1,
      "actual",
    );
    expect(scalarValue(result)).toBe(18000);
  });

  it("mỗi project có thể dùng công thức riêng cho cùng một field", () => {
    const state = createSeedState();
    const budget = state.fieldDefinitions.find(
      (item) => item.code === "budget" && item.ownerType === "library",
    )!;
    budget.inputMode = "formula";
    budget.formula = formula("budget", lit(100));
    state.projectFormulaOverrides.push({
      id: "project-1-budget-formula",
      projectId: "project-1",
      fieldId: "budget",
      formula: formula("budget", lit(250)),
    });

    const engine = new FormulaEngine(state);
    expect(scalarValue(engine.calculate("project-1", "budget", DEMO_YEAR, 1, "actual"))).toBe(250);
    expect(scalarValue(engine.calculate("project-2", "budget", DEMO_YEAR, 1, "actual"))).toBe(100);
  });

  it("công thức tháng riêng của project ưu tiên hơn công thức áp dụng chung", () => {
    const state = createSeedState();
    state.formulaOverrides = [
      {
        id: "all-projects",
        fieldId: "savingUsd",
        columnId: "actual",
        year: DEMO_YEAR,
        months: [4],
        formula: formula("savingUsd", lit(100)),
      },
      {
        id: "project-1-only",
        projectId: "project-1",
        fieldId: "savingUsd",
        columnId: "actual",
        year: DEMO_YEAR,
        months: [4],
        formula: formula("savingUsd", lit(250)),
      },
    ];

    const engine = new FormulaEngine(state);
    expect(scalarValue(engine.calculate("project-1", "savingUsd", DEMO_YEAR, 4, "actual"))).toBe(
      250,
    );
    expect(scalarValue(engine.calculate("project-2", "savingUsd", DEMO_YEAR, 4, "actual"))).toBe(
      100,
    );
  });

  it("rich text có thể rút gọn thành nội dung đọc được trong bảng", () => {
    const document = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Mục tiêu" }] },
        { type: "paragraph", content: [{ type: "text", text: "Giảm thời gian setup" }] },
      ],
    };
    expect(richTextToPlainText(document)).toBe("Mục tiêu Giảm thời gian setup");
  });

  it("bộ seed có đủ 48 hạng mục của sheet chính và giữ các công thức đặc thù", () => {
    const state = createSeedState();
    const engine = new FormulaEngine(state);

    expect(state.projects).toHaveLength(48);
    expect(
      scalarValue(engine.calculate("project-1", "savingUsd", DEMO_YEAR, 3, "actual")),
    ).toBeCloseTo(40_930 * 0.7166 * (0.0057 - 0.0023));
    expect(
      scalarValue(engine.calculate("project-2", "savingUsd", DEMO_YEAR, 3, "actual")),
    ).toBeCloseTo(3 * 2 * 0.59 * 2);
    expect(
      scalarValue(engine.calculate("project-3", "savingUsd", DEMO_YEAR, 3, "actual")),
    ).toBeCloseTo(((40_320 * (32 - 30)) / 3600 / 4) * 9.6);
    expect(
      scalarValue(engine.calculate("project-4", "savingUsd", DEMO_YEAR, 4, "actual")),
    ).toBeCloseTo(3 * 8 * 21 * 3);
    expect(
      scalarValue(engine.calculate("project-5", "savingUsd", DEMO_YEAR, 7, "plan")),
    ).toBeCloseTo(6 * 11 * 27 * 3);
    expect(
      scalarValue(engine.calculate("project-5", "savingUsd", DEMO_YEAR, 7, "actual")),
    ).toBeNull();
  });

  it("tổng năm của 5 project khớp các ô AP/AQ trong Excel", () => {
    const state = createSeedState();
    const annual = (projectId: string, columnId: string) =>
      annualSummaryValue(state, projectId, "savingUsd", columnId);

    expect(annual("project-1", "plan")).toBeCloseTo(525.41112);
    expect(annual("project-1", "actual")).toBeCloseTo(869.56708418);
    expect(annual("project-2", "plan")).toBeCloseTo(49.56);
    expect(annual("project-2", "actual")).toBeCloseTo(25.96);
    expect(annual("project-3", "plan")).toBeCloseTo(1152);
    expect(annual("project-3", "actual")).toBeCloseTo(282.72);
    expect(annual("project-4", "plan")).toBeCloseTo(14976);
    expect(annual("project-4", "actual")).toBeCloseTo(6768);
    expect(annual("project-5", "plan")).toBeCloseTo(55506);
    expect(annual("project-5", "actual")).toBeNull();
  });

  it("field lũy kế lấy giá trị cuối kỳ thay vì cộng lặp", () => {
    const state = createSeedState();
    const definition = state.summaryFormulas.find(
      (item) =>
        item.targetKind === "column" &&
        item.metricId === "cumulativeSaving" &&
        item.columnId === "actual",
    );
    expect(definition?.formula.ast).toMatchObject({ kind: "function", name: "LAST" });
  });

  it("AMR Logistics khởi tạo lũy kế ở tháng 9 rồi phụ thuộc tháng trước", () => {
    const state = createSeedState();
    const engine = new FormulaEngine(state);
    const cumulative = [9, 10, 11, 12].map((month) =>
      scalarValue(
        engine.calculate("project-6", "cumulativeReductionPeople", DEMO_YEAR, month, "plan"),
      ),
    );
    const savings = [9, 10, 11, 12].map((month) =>
      Number(scalarValue(engine.calculate("project-6", "savingUsd", DEMO_YEAR, month, "plan"))),
    );

    expect(cumulative).toEqual([1, 2, 4, 6]);
    expect(savings).toEqual([660, 1584, 2904, 4950]);
    expect(savings.reduce((sum, value) => sum + value, 0)).toBe(10098);
    expect(
      scalarValue(engine.calculate("project-6", "savingUsd", DEMO_YEAR, 12, "actual")),
    ).toBeNull();
  });

  it("RPA giữ nguyên khác biệt giữa 0 và NULL", () => {
    const state = createSeedState();
    const engine = new FormulaEngine(state);
    const actual = state.periods.map(
      (period) =>
        scalarValue(
          engine.calculate("project-7", "savingUsd", DEMO_YEAR, period.month, "actual"),
        ) as number | null,
    );

    expect(actual.slice(0, 6)).toEqual([1800, 0, 0, 273, 189, 0]);
    expect(actual[6]).toBe(0);
    expect(annualSummaryValue(state, "project-7", "savingUsd", "actual")).toBe(2262);
  });

  it("bảo dưỡng khuôn và shot VN082311-0102 khớp tổng Excel", () => {
    const state = createSeedState();
    const annual = (projectId: string, columnId: string) =>
      annualSummaryValue(state, projectId, "savingUsd", columnId);

    expect(annual("project-8", "plan")).toBe(1440);
    expect(annual("project-8", "actual")).toBe(651);
    expect(annual("project-9", "plan")).toBeCloseTo(125.20625);
    expect(annual("project-9", "actual")).toBeCloseTo(56.615);
  });

  it("hạng mục được nhập thêm giữ đúng kết quả tại dòng nguồn Excel", () => {
    const result = new FormulaEngine(createSeedState()).calculate(
      "project-10",
      "savingUsd",
      DEMO_YEAR,
      3,
      "actual",
    );
    expect(scalarValue(result)).toBeCloseTo(4.4636265);
  });

  it("calendar field dùng chung theo năm và tháng, không phụ thuộc project hay cột dữ liệu", () => {
    const state = createSeedState();
    const engine = new FormulaEngine(state);
    expect(scalarValue(engine.calculate("project-1", "workingDays", DEMO_YEAR, 1, "plan"))).toBe(
      24,
    );
    expect(scalarValue(engine.calculate("project-8", "workingDays", DEMO_YEAR, 1, "actual"))).toBe(
      24,
    );
    expect(
      scalarValue(engine.calculate("project-1", "workingDays", DEMO_YEAR + 1, 1, "actual")),
    ).toBeNull();
    expect(state.monthlyValues.some((item) => item.fieldId === "workingDays")).toBe(false);
  });

  it("năm mới không nhìn thấy project của năm cũ", () => {
    const state = createSeedState();
    state.availableYears.push(DEMO_YEAR + 1);
    state.selectedYear = DEMO_YEAR + 1;
    expect(projectsForYear(state)).toEqual([]);
    expect(
      scalarValue(
        new FormulaEngine(state).calculate("project-1", "budget", DEMO_YEAR + 1, 1, "actual"),
      ),
    ).toBeNull();
  });

  it("bố cục tháng dùng row ID ổn định và thứ tự hàng độc lập", () => {
    const state = createSeedState();
    const inherited = monthlyLayoutForProject(state, "project-1");
    const reversedRows = [...inherited.rows].reverse();
    state.projectMonthlyLayouts = [
      ...state.projectMonthlyLayouts.filter((item) => item.projectId !== "project-1"),
      {
        projectId: "project-1",
        rows: reversedRows.map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 })),
        placements: inherited.placements,
      },
    ];
    expect(monthlyLayoutForProject(state, "project-1").rows[0].id).toBe(reversedRows[0].id);
    expect(monthlyFieldsForProject(state, "project-1")[0].rowIndex).toBe(1);
  });

  it("làm tròn hiển thị không làm tròn giá trị dùng cho công thức phụ thuộc", () => {
    const state = createSeedState();
    const rawField = {
      id: "test-raw-saving",
      code: "rawSaving",
      label: "Dự Kiến Giảm",
      scope: "project" as const,
      ownerType: "project" as const,
      ownerId: "project-1",
      columnType: "standalone" as const,
      semanticType: "Number" as const,
      displayMode: "number" as const,
      displayPrecision: 0,
      inputMode: "formula" as const,
      suffix: "H/M",
      rowIndex: 2 as const,
      sortOrder: 900,
      formula: formula(
        "rawSaving",
        binary("/", binary("*", binary("-", lit(510), lit(400)), lit(13_800)), lit(3_600)),
      ),
    };
    const usdField = {
      id: "test-usd-saving",
      code: "usdSaving",
      label: "Giảm USD",
      scope: "project" as const,
      ownerType: "project" as const,
      ownerId: "project-1",
      columnType: "standalone" as const,
      semanticType: "Number" as const,
      displayMode: "number" as const,
      inputMode: "formula" as const,
      suffix: "USD",
      rowIndex: 2 as const,
      sortOrder: 910,
      formula: formula("test-usd-saving", binary("*", ref("test-raw-saving"), lit(3))),
    };
    state.fieldDefinitions.push(rawField, usdField);
    const engine = new FormulaEngine(state);
    const raw = scalarValue(
      engine.calculate("project-1", "test-raw-saving", DEMO_YEAR, 1, "actual"),
    );
    const usd = scalarValue(
      engine.calculate("project-1", "test-usd-saving", DEMO_YEAR, 1, "actual"),
    );
    expect(raw).toBeCloseTo(421.6666667);
    expect(formatFieldValue(raw, rawField)).toBe("422 H/M");
    expect(usd).toBe(1265);
  });

  it("công thức riêng của project phải thắng giá trị project cũ khi field khác tham chiếu", () => {
    const state = createSeedState();
    const rawField = {
      id: "test-project-raw-saving",
      code: "projectRawSaving",
      label: "Dự Kiến Giảm",
      scope: "project" as const,
      ownerType: "project" as const,
      ownerId: "project-1",
      columnType: "standalone" as const,
      semanticType: "Number" as const,
      displayMode: "number" as const,
      displayPrecision: 0,
      inputMode: "manual" as const,
      suffix: "H/M",
      rowIndex: 2 as const,
      sortOrder: 920,
    };
    const usdField = {
      id: "test-project-usd-saving",
      code: "projectUsdSaving",
      label: "Giảm USD",
      scope: "project" as const,
      ownerType: "project" as const,
      ownerId: "project-1",
      columnType: "standalone" as const,
      semanticType: "Number" as const,
      displayMode: "number" as const,
      inputMode: "manual" as const,
      suffix: "USD",
      rowIndex: 2 as const,
      sortOrder: 930,
    };
    state.fieldDefinitions.push(rawField, usdField);
    // Mô phỏng giá trị 422 đã từng nhập trước khi field được chuyển sang dùng công thức riêng.
    state.fieldValues.push({ projectId: "project-1", fieldId: rawField.id, value: 422 });
    state.projectFormulaOverrides.push(
      {
        id: "test-project-raw-saving-override",
        projectId: "project-1",
        fieldId: rawField.id,
        formula: formula(
          rawField.id,
          binary("/", binary("*", binary("-", lit(510), lit(400)), lit(13_800)), lit(3_600)),
        ),
      },
      {
        id: "test-project-usd-saving-override",
        projectId: "project-1",
        fieldId: usdField.id,
        formula: formula(usdField.id, binary("*", ref(rawField.id), lit(3))),
      },
    );

    const engine = new FormulaEngine(state);
    const raw = scalarValue(engine.calculate("project-1", rawField.id, DEMO_YEAR, 5, "plan"));
    const usd = scalarValue(engine.calculate("project-1", usdField.id, DEMO_YEAR, 5, "plan"));
    expect(raw).toBeCloseTo(421.6666667);
    expect(usd).toBe(1265);
  });

  it("field tháng ở chế độ cố định trả về đúng kiểu giá trị ở mọi tháng", () => {
    const state = createSeedState();
    const field = state.fieldDefinitions.find((item) => item.code === "productionQty")!;
    field.inputMode = "fixed";
    field.fixedValue = 123.45;
    field.formula = undefined;

    const engine = new FormulaEngine(state);
    expect(scalarValue(engine.calculate("project-1", field.id, DEMO_YEAR, 1, "actual"))).toBe(
      123.45,
    );
    expect(scalarValue(engine.calculate("project-1", field.id, DEMO_YEAR, 12, "actual"))).toBe(
      123.45,
    );
  });

  it("đổi nhãn riêng của Cycle không làm thay đổi kết quả công thức", () => {
    const state = createSeedState();
    const before = scalarValue(
      new FormulaEngine(state).calculate("project-3", "savingUsd", DEMO_YEAR, 3, "actual"),
    );
    const config: ProjectMonthlyFieldConfig = {
      projectId: "project-3",
      fieldId: "actualCycle",
    };
    state.projectMonthlyFieldConfigs.push(config);
    config.displayLabel = "Cycle sau cải tiến";
    const field = state.fieldDefinitions.find((item) => item.code === "actualCycle")!;
    expect(effectiveMonthlyField(state, "project-3", field).label).toBe("Cycle sau cải tiến");
    const engine = new FormulaEngine(state);
    expect(engine.formulaExpression("project-3", "savingHours", DEMO_YEAR, 3, "actual")).toContain(
      "Cycle sau cải tiến",
    );
    expect(scalarValue(engine.calculate("project-3", "savingUsd", DEMO_YEAR, 3, "actual"))).toBe(
      before,
    );
  });

  it("đổi dòng hiển thị không làm thay đổi kết quả công thức", () => {
    const state = createSeedState();
    const before = scalarValue(
      new FormulaEngine(state).calculate("project-3", "savingUsd", DEMO_YEAR, 3, "actual"),
    );
    const layout = monthlyLayoutForProject(state, "project-3");
    const placement = layout.placements.find((item) => item.fieldId === "actualCycle")!;
    placement.rowId = layout.rows[0].id;
    state.projectMonthlyLayouts = [
      ...state.projectMonthlyLayouts.filter((item) => item.projectId !== "project-3"),
      layout,
    ];
    expect(
      scalarValue(
        new FormulaEngine(state).calculate("project-3", "savingUsd", DEMO_YEAR, 3, "actual"),
      ),
    ).toBe(before);
  });

  it("field chỉ hỗ trợ Actual trả NULL ở Plan dù dữ liệu cũ còn được bảo toàn", () => {
    const state = createSeedState();
    state.monthlyValues.push({
      projectId: "project-1",
      fieldId: "productionQty",
      year: DEMO_YEAR,
      month: 3,
      columnId: "plan",
      value: 26_000,
    });
    expect(monthlyFieldAllowsColumn(state, "project-1", "productionQty", "plan")).toBe(false);
    expect(
      state.monthlyValues.some(
        (item) =>
          item.projectId === "project-1" &&
          item.fieldId === "productionQty" &&
          item.columnId === "plan" &&
          item.value != null,
      ),
    ).toBe(true);
    expect(
      scalarValue(
        new FormulaEngine(state).calculate("project-1", "productionQty", DEMO_YEAR, 3, "plan"),
      ),
    ).toBeNull();
    expect(
      scalarValue(
        new FormulaEngine(state).calculate("project-1", "productionQty", DEMO_YEAR, 3, "actual"),
      ),
    ).toBe(40_930);
  });

  it("COVER FRONT đổi Actual Qty T3 từ 9.840 lên 10.000 cập nhật hiệu quả và tổng năm", () => {
    const state = createSeedState();
    const projectId = "project-3";
    const setProjectValue = (fieldId: string, value: number) => {
      const entry = state.fieldValues.find(
        (item) => item.projectId === projectId && item.fieldId === fieldId,
      )!;
      entry.value = { numericValue: value };
    };
    setProjectValue("baselineCycle", 510);
    setProjectValue("targetCycle", 400);
    setProjectValue("plannedVolume", 13_800);
    setProjectValue("laborCost", 3);
    const quantities = [
      8_440,
      5_168,
      9_840,
      9_832,
      10_336,
      11_096,
      10_240,
      null,
      null,
      null,
      null,
      null,
    ];
    const cycles = [440, 440, 420, 420, 420, 420, 420, null, null, null, null, null];
    const setMonthlySeries = (fieldId: string, values: Array<number | null>) => {
      values.forEach((value, index) => {
        const month = index + 1;
        const existing = state.monthlyValues.find(
          (item) =>
            item.projectId === projectId &&
            item.fieldId === fieldId &&
            item.month === month &&
            item.columnId === "actual",
        );
        if (existing) existing.value = value;
        else
          state.monthlyValues.push({
            projectId,
            fieldId,
            year: DEMO_YEAR,
            month,
            columnId: "actual",
            value,
          });
      });
    };
    setMonthlySeries("productionQty", quantities);
    setMonthlySeries("actualCycle", cycles);
    const actualSaving = binary(
      "*",
      binary(
        "/",
        binary(
          "*",
          binary("-", ref("baselineCycle"), ref("actualCycle", "actual", { kind: "current" })),
          ref("productionQty", "actual", { kind: "current" }),
        ),
        lit(3600),
      ),
      ref("laborCost"),
    );
    state.formulaOverrides = state.formulaOverrides.filter(
      (item) =>
        !(
          item.projectId === projectId &&
          item.fieldId === "savingUsd" &&
          item.columnId === "actual"
        ),
    );
    state.formulaOverrides.push({
      id: "cover-actual-saving",
      projectId,
      fieldId: "savingUsd",
      columnId: "actual",
      year: DEMO_YEAR,
      months: state.periods.map((period) => period.month),
      formula: formula("savingUsd", actualSaving),
    });
    const annual = () => annualSummaryValue(state, projectId, "savingUsd", "actual");
    expect(
      scalarValue(
        new FormulaEngine(state).calculate(projectId, "savingUsd", DEMO_YEAR, 3, "actual"),
      ),
    ).toBe(738);
    expect(annual()).toBeCloseTo(4_644.6);
    state.monthlyValues.find(
      (item) =>
        item.projectId === projectId &&
        item.fieldId === "productionQty" &&
        item.columnId === "actual" &&
        item.month === 3,
    )!.value = 10_000;
    expect(
      scalarValue(
        new FormulaEngine(state).calculate(projectId, "savingUsd", DEMO_YEAR, 3, "actual"),
      ),
    ).toBe(750);
    expect(annual()).toBeCloseTo(4_656.6);
  });

  it("nhãn riêng của một project không ảnh hưởng project khác", () => {
    const state = createSeedState();
    const field = state.fieldDefinitions.find((item) => item.code === "actualCycle")!;
    const first = state.projectMonthlyFieldConfigs.find(
      (item) => item.projectId === "project-1" && item.fieldId === field.id,
    )!;
    first.displayLabel = "Tỷ lệ lỗi sau cải tiến";
    expect(effectiveMonthlyField(state, "project-1", field).label).toBe("Tỷ lệ lỗi sau cải tiến");
    expect(effectiveMonthlyField(state, "project-3", field).label).toBe("Cycle thực tế");
  });

  it("một công thức có thể tham chiếu đồng thời cột Kế hoạch và Thực tế", () => {
    const state = createSeedState();
    const engine = new FormulaEngine(state);
    const month = 3;
    const plan = scalarValue(
      engine.calculate("project-3", "savingUsd", DEMO_YEAR, month, "plan"),
    ) as number;
    const actual = scalarValue(
      engine.calculate("project-3", "savingUsd", DEMO_YEAR, month, "actual"),
    ) as number;
    const difference = engine.evaluate(
      "project-3",
      binary(
        "-",
        ref("savingUsd", "plan", { kind: "current" }),
        ref("savingUsd", "actual", { kind: "current" }),
      ),
      DEMO_YEAR,
      month,
      "actual",
    );

    expect(scalarValue(difference)).toBeCloseTo(plan - actual);
  });

  it("dữ liệu schema cũ được reset về seed của schema hiện tại", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 10;
    const {
      projectMonthlyFieldConfigs: _removedConfig,
      projectFieldTemplates: _removedTemplates,
      ...legacyWithoutProjectConfig
    } = legacy;
    const migrated = migrateState(legacyWithoutProjectConfig);
    expect(migrated.schemaVersion).toBe(createSeedState().schemaVersion);
    expect(migrated.projectFieldTemplates.length).toBeGreaterThan(0);
    expect(
      scalarValue(
        new FormulaEngine(migrated).calculate("project-1", "savingUsd", DEMO_YEAR, 3, "actual"),
      ),
    ).toBeCloseTo(40_930 * 0.7166 * (0.0057 - 0.0023));
  });

  it("không cố giữ dữ liệu của schema cũ", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 10;
    const oldDemoCodes = ["KKV-001", "KKV-002", "KKV-003", "KKV-004", "KKV-005", "KKV-006"];
    legacy.projects = legacy.projects.slice(0, oldDemoCodes.length).map((project, index) => ({
      ...project,
      code: oldDemoCodes[index],
      name: index === 0 ? "Tên người dùng đã chỉnh" : project.name,
    }));
    const storedValue = legacy.monthlyValues.find(
      (item) =>
        item.projectId === "project-1" &&
        item.fieldId === "productionQty" &&
        item.month === 3 &&
        item.columnId === "actual",
    )!;
    storedValue.value = 12_345;

    const {
      projectMonthlyFieldConfigs: _removedConfig,
      projectFieldTemplates: _removedTemplates,
      ...legacyWithoutProjectConfig
    } = legacy;
    const migrated = migrateState(legacyWithoutProjectConfig);

    expect(migrated.projects.length).toBeGreaterThan(6);
    expect(migrated.projects[0].name).not.toBe("Tên người dùng đã chỉnh");
    expect(
      migrated.monthlyValues.find(
        (item) =>
          item.projectId === "project-1" &&
          item.fieldId === "productionQty" &&
          item.month === 3 &&
          item.columnId === "actual",
      )?.value,
    ).not.toBe(12_345);
  });

  it("công thức dòng tổng hợp có thể gom cùng một field từ tất cả dự án", () => {
    const state = createSeedState();
    const engine = new FormulaEngine(state);
    const definition = state.summaryFormulas.find(
      (item) =>
        item.targetKind === "row" && item.metricId === "savingUsd" && item.columnId === "actual",
    )!;
    const month = 4;
    const expected = projectsForYear(state)
      .map((project) =>
        scalarValue(engine.calculate(project.id, "savingUsd", DEMO_YEAR, month, "actual")),
      )
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);

    expect(
      scalarValue(
        engine.evaluate(state.projects[0].id, definition.formula.ast, DEMO_YEAR, month, "actual"),
      ),
    ).toBeCloseTo(expected);
  });

  it("công thức tổng hợp theo bộ lọc chỉ dùng các project được truyền vào engine", () => {
    const state = createSeedState();
    const filteredProjects = projectsForYear(state).slice(0, 2);
    const month = 4;
    const ast: FormulaAst = {
      kind: "function",
      name: "SUM",
      args: [ref("savingUsd", "actual", { kind: "current" }, "filtered")],
    };
    const unfilteredEngine = new FormulaEngine(state);
    const filteredEngine = new FormulaEngine(state, {
      filteredProjectIds: filteredProjects.map((project) => project.id),
    });
    const expected = filteredProjects
      .map((project) =>
        scalarValue(
          unfilteredEngine.calculate(project.id, "savingUsd", DEMO_YEAR, month, "actual"),
        ),
      )
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);

    expect(
      scalarValue(filteredEngine.evaluate(filteredProjects[0].id, ast, DEMO_YEAR, month, "actual")),
    ).toBeCloseTo(expected);
  });

  it("dòng lũy kế cộng từ T1 đến cột tháng hiện tại của các dự án theo bộ lọc", () => {
    const state = createSeedState();
    const filteredProjects = projectsForYear(state).slice(0, 3);
    const month = 5;
    const definition = state.summaryFormulas.find(
      (item) =>
        item.targetKind === "row" &&
        item.summaryId === "summary-row-cumulative" &&
        item.metricId === "savingUsd" &&
        item.columnId === "actual",
    )!;
    const engine = new FormulaEngine(state, {
      filteredProjectIds: filteredProjects.map((project) => project.id),
    });
    const expected = filteredProjects
      .flatMap((project) =>
        state.periods
          .filter((period) => period.month <= month)
          .map((period) =>
            scalarValue(
              engine.calculate(project.id, "savingUsd", DEMO_YEAR, period.month, "actual"),
            ),
          ),
      )
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);

    expect(
      scalarValue(
        engine.evaluate(filteredProjects[0].id, definition.formula.ast, DEMO_YEAR, month, "actual"),
      ),
    ).toBeCloseTo(expected);
  });

  it("phạm vi tất cả dự án không bị ảnh hưởng bởi bộ lọc của bảng", () => {
    const state = createSeedState();
    const month = 4;
    const engine = new FormulaEngine(state, { filteredProjectIds: [state.projects[0].id] });
    const ast: FormulaAst = {
      kind: "function",
      name: "SUM",
      args: [ref("savingUsd", "actual", { kind: "current" }, "all")],
    };
    const expectedEngine = new FormulaEngine(state);
    const expected = projectsForYear(state)
      .map((project) =>
        scalarValue(expectedEngine.calculate(project.id, "savingUsd", DEMO_YEAR, month, "actual")),
      )
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);

    expect(
      scalarValue(engine.evaluate(state.projects[0].id, ast, DEMO_YEAR, month, "actual")),
    ).toBeCloseTo(expected);
  });

  it("ô giao tổng hợp công thức cột của từng dự án trước khi tổng hợp theo dòng", () => {
    const state = createSeedState();
    const summaryColumn = state.summaryColumns.find((item) => item.code === "annualTotal")!;
    const columnFormula = state.summaryFormulas.find(
      (item) =>
        item.targetKind === "column" &&
        item.summaryId === summaryColumn.id &&
        item.metricId === "savingUsd" &&
        item.columnId === "actual",
    )!;
    columnFormula.formula.ast = {
      kind: "function",
      name: "AVG",
      args: [ref("savingUsd", "actual", { kind: "range", from: 1, to: 12 })],
    };
    const rowFormula = state.summaryFormulas.find(
      (item) =>
        item.targetKind === "row" && item.metricId === "savingUsd" && item.columnId === "actual",
    )!;
    const filteredProjects = projectsForYear(state).slice(0, 3);
    const engine = new FormulaEngine(state, {
      filteredProjectIds: filteredProjects.map((project) => project.id),
    });
    const expected = filteredProjects
      .map((project) =>
        scalarValue(
          engine.calculateSummaryColumn(
            project.id,
            summaryColumn.id,
            "savingUsd",
            DEMO_YEAR,
            "actual",
          ),
        ),
      )
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);

    expect(
      scalarValue(
        engine.evaluateSummaryRowAtSummaryColumn(
          filteredProjects[0].id,
          rowFormula.formula.ast,
          DEMO_YEAR,
          summaryColumn.id,
          "actual",
        ),
      ),
    ).toBeCloseTo(expected);
  });

  it("ô giao chưa có công thức cột trả về NULL để giao diện vẫn hiển thị dấu gạch", () => {
    const state = createSeedState();
    const summaryColumn = state.summaryColumns.find((item) => item.code === "annualTotal")!;
    state.summaryFormulas = state.summaryFormulas.filter(
      (item) =>
        !(
          item.targetKind === "column" &&
          item.summaryId === summaryColumn.id &&
          item.metricId === "savingUsd" &&
          item.columnId === "actual"
        ),
    );
    const rowFormula = state.summaryFormulas.find(
      (item) =>
        item.targetKind === "row" && item.metricId === "savingUsd" && item.columnId === "actual",
    )!;
    const engine = new FormulaEngine(state, {
      filteredProjectIds: projectsForYear(state).map((project) => project.id),
    });
    const result = engine.evaluateSummaryRowAtSummaryColumn(
      state.projects[0].id,
      rowFormula.formula.ast,
      DEMO_YEAR,
      summaryColumn.id,
      "actual",
    );

    expect(result.state).toBe("Null");
    expect(scalarValue(result)).toBeNull();
  });

  it("công thức cột tổng hợp có thể đọc một khoảng tháng do người dùng định nghĩa", () => {
    const state = createSeedState();
    const engine = new FormulaEngine(state);
    const definition = state.summaryFormulas.find(
      (item) =>
        item.targetKind === "column" && item.metricId === "savingUsd" && item.columnId === "actual",
    )!;
    const monthlyValues = state.periods.map((period) =>
      scalarValue(engine.calculate("project-1", "savingUsd", DEMO_YEAR, period.month, "actual")),
    );
    const expected = monthlyValues
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);

    expect(
      scalarValue(engine.evaluate("project-1", definition.formula.ast, DEMO_YEAR, 12, "actual")),
    ).toBeCloseTo(expected);
  });
});
