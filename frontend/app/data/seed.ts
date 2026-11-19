import type { FormulaAst } from "../formula/ast";
import type {
  KkvState,
  NumericValue,
  Project,
  ProjectFieldConfig,
  ProjectFieldDefinition,
  ProjectMonthlyFieldConfig,
} from "../domain/types";
import { binary, lit, metricRef, ref, summaryRef } from "../formula/ast";
import {
  buildTemplateFormulas,
  DEFAULT_PROJECT_FIELD_TEMPLATES,
} from "../domain/project-field-templates";
import { PROJECT_FIELD_BLUEPRINTS } from "../domain/project-field-blueprints";
import { EXCEL_2026_PROJECTS } from "./excel-2026-seed";
import { EXCEL_2026_FORMULA_DATA } from "./excel-2026-formula-data";
import { isLibraryField } from "../domain/field-ownership";

export const CURRENT_SCHEMA_VERSION = 57;
export const DEMO_YEAR = 2026;
const PLAN_COLUMN_ID = "plan";
const ACTUAL_COLUMN_ID = "actual";

const allMonths = Array.from({ length: 12 }, (_, index) => index + 1);
const workingDays = [24, 17, 24, 21, 22, 24, 27, 23, 20, 24, 22, 25];

const formula = (id: string, ast: FormulaAst, businessExpression: string) => ({
  id,
  ast,
  businessExpression,
  internalExpression: businessExpression,
});
const numeric = (
  numericValue: number | null,
  leftNote?: string,
  rightNote?: string,
): NumericValue => ({ numericValue, leftNote, rightNote });
const richText = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const current = (fieldId: string): FormulaAst => ref(fieldId, undefined, { kind: "current" });
const fn = (name: string, args: FormulaAst[]): FormulaAst => ({ kind: "function", name, args });
const zeroWhenBlankOrError = (value: FormulaAst): FormulaAst =>
  fn("IFERROR", [fn("IF", [fn("ISBLANK", [value]), lit(0), value]), lit(0)]);

const fields: ProjectFieldDefinition[] = [
  ...PROJECT_FIELD_BLUEPRINTS,
  {
    id: "productionQty",
    code: "productionQty",
    label: "Sản lượng / đại lượng",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    inputMode: "manual",
    rowIndex: 1,
    sortOrder: 100,
  },
  {
    id: "actualCycle",
    code: "actualCycle",
    label: "Giá trị thực tế",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    inputMode: "manual",
    rowIndex: 1,
    sortOrder: 110,
  },
  {
    id: "defectRate",
    code: "defectRate",
    label: "Tỷ lệ NG",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    displayPrecision: 2,
    inputMode: "manual",
    suffix: "%",
    rowIndex: 2,
    sortOrder: 120,
  },
  {
    id: "workingDays",
    code: "workingDays",
    label: "Ngày làm việc",
    scope: "calendar",
    ownerType: "system",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    inputMode: "manual",
    suffix: "ngày",
    rowIndex: 3,
    sortOrder: 130,
  },
  {
    id: "reductionPeople",
    code: "reductionPeople",
    label: "Nhân lực/đại lượng giảm",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    inputMode: "manual",
    rowIndex: 3,
    sortOrder: 140,
  },
  {
    id: "cumulativeReductionPeople",
    code: "cumulativeReductionPeople",
    label: "Lũy kế nhân lực giảm",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    inputMode: "manual",
    suffix: "người",
    rowIndex: 3,
    sortOrder: 145,
  },
  {
    id: "savingHours",
    code: "savingHours",
    label: "Mức cải thiện",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    inputMode: "formula",
    rowIndex: 2,
    sortOrder: 150,
    formula: formula(
      "formula-hours",
      binary(
        "/",
        binary(
          "*",
          ref("productionQty", "actual", { kind: "current" }),
          binary("-", ref("baselineCycle"), ref("actualCycle", "actual", { kind: "current" })),
        ),
        lit(3600),
      ),
      "[Sản lượng · Thực tế · Tháng hiện tại] × ([Hiện trạng] − [Giá trị thực tế · Thực tế · Tháng hiện tại]) ÷ 3600",
    ),
  },
  {
    id: "savingUsd",
    code: "savingUsd",
    label: "Hiệu quả",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    displayPrecision: 2,
    inputMode: "formula",
    suffix: "USD",
    rowIndex: 2,
    sortOrder: 160,
    formula: formula(
      "formula-saving",
      binary("*", current("savingHours"), ref("laborCost")),
      "[Mức cải thiện · Tháng hiện tại] × [Đơn giá / hệ số tiền]",
    ),
  },
  {
    id: "cumulativeSaving",
    code: "cumulativeSaving",
    label: "Lũy kế hiệu quả",
    scope: "monthly",
    ownerType: "library",
    columnType: "standalone",
    semanticType: "Number",
    displayMode: "number",
    displayPrecision: 2,
    inputMode: "formula",
    suffix: "USD",
    rowIndex: 3,
    sortOrder: 170,
    formula: formula(
      "formula-cumulative",
      binary(
        "+",
        zeroWhenBlankOrError(ref("cumulativeSaving", undefined, { kind: "previous" })),
        current("savingUsd"),
      ),
      "IFERROR(IF(ISBLANK([Lũy kế hiệu quả · Tháng trước]), 0, [Lũy kế hiệu quả · Tháng trước]), 0) + [Hiệu quả · Tháng hiện tại]",
    ),
  },
];

// Chín dự án đầu giữ công thức chi tiết để dùng trong Formula Builder.
// Các dòng còn lại được bổ sung bằng kết quả đã tính trong sheet chính.
const configuredExcelRows = [14, 26, 83, 122, 134, 143, 149, 146, 17];
const extraExcelProjects = EXCEL_2026_PROJECTS.filter(
  (item) => !configuredExcelRows.includes(item.sourceRow),
);
export const EXCEL_2026_SOURCE_ROW_ORDER = [
  ...configuredExcelRows,
  ...extraExcelProjects.map((item) => item.sourceRow),
];

type ExcelFormulaSource = (typeof EXCEL_2026_FORMULA_DATA)[number];

const defectRows = new Set([8, 11, 14]);
const shotRows = new Set([17, 20, 23, 26]);
const directImprovementRows = new Set([29, 32, 35, 38, 41, 44, 47, 50]);
const cumulativeLaborRows = new Set([134, 143]);
const cycleDivisorByRow = new Map<number, number>([
  ...[53, 56, 59, 62, 65, 68, 71].map((row) => [row, 1] as const),
  ...[74, 98].map((row) => [row, 4] as const),
  ...[77, 92, 95, 101, 104, 107, 110].map((row) => [row, 2] as const),
  [80, 8],
  [83, 4],
  [86, 2],
  [89, 2],
]);

const multiply = (...items: FormulaAst[]): FormulaAst =>
  items.slice(1).reduce((left, right) => binary("*", left, right), items[0]);
const coalesceZero = (item: FormulaAst): FormulaAst => fn("COALESCE", [item, lit(0)]);
const currentNumber = (fieldId: string): FormulaAst => coalesceZero(current(fieldId));
const percentFactor = (percentagePoints: FormulaAst): FormulaAst =>
  binary("/", percentagePoints, lit(100));
const percentDifference = (left: FormulaAst, right: FormulaAst): FormulaAst =>
  percentFactor(binary("-", left, right));

function excelProjectFormula(sourceRow: number): FormulaAst {
  if (sourceRow === 8)
    return multiply(
      coalesceZero(ref("referenceUnitPrice")),
      ref("plannedVolume"),
      percentDifference(ref("baselineCycle"), ref("targetCycle")),
    );
  if (sourceRow === 11)
    return multiply(
      ref("laborCost"),
      ref("plannedVolume"),
      percentDifference(ref("baselineCycle"), ref("targetCycle")),
    );
  if (sourceRow === 14)
    return multiply(ref("laborCost"), ref("plannedVolume"), percentFactor(lit(0.57)));
  if ([17, 20, 23].includes(sourceRow))
    return multiply(
      binary("/", ref("referenceVolume"), ref("plannedVolume")),
      ref("laborCost"),
      binary("-", ref("baselineCycle"), ref("targetCycle")),
    );
  if (sourceRow === 26)
    return multiply(
      binary("/", ref("referenceVolume"), ref("plannedVolume")),
      ref("laborCost"),
      binary("-", ref("baselineCycle"), ref("targetCycle")),
      lit(2),
    );
  if ([128, 131].includes(sourceRow)) return binary("-", ref("baselineCycle"), ref("targetCycle"));
  if (sourceRow === 137) return multiply(ref("laborCost"), ref("plannedVolume"));
  return multiply(ref("targetMonthlyReduction"), ref("laborCost"));
}

function excelSavingHoursAst(sourceRow: number): FormulaAst | null {
  if (directImprovementRows.has(sourceRow))
    return binary("/", multiply(currentNumber("productionQty"), ref("baselineCycle")), lit(3600));
  const divisor = cycleDivisorByRow.get(sourceRow);
  if (!divisor) return null;
  const seconds = binary(
    "/",
    multiply(
      binary("-", ref("baselineCycle"), currentNumber("actualCycle")),
      currentNumber("productionQty"),
    ),
    lit(3600),
  );
  return divisor === 1 ? seconds : binary("/", seconds, lit(divisor));
}

function excelSavingAst(sourceRow: number, columnId: string): FormulaAst {
  if (defectRows.has(sourceRow))
    return multiply(
      columnId === "plan" ? ref("plannedVolume") : currentNumber("productionQty"),
      ref("laborCost"),
      percentDifference(ref("baselineCycle"), currentNumber("defectRate")),
    );
  if (shotRows.has(sourceRow) && columnId === "actual") {
    const result = multiply(
      fn("ROUNDUP", [binary("/", currentNumber("productionQty"), ref("plannedVolume")), lit(0)]),
      currentNumber("actualCycle"),
      ref("laborCost"),
    );
    return sourceRow === 26 ? multiply(result, lit(2)) : result;
  }
  if (directImprovementRows.has(sourceRow) || cycleDivisorByRow.has(sourceRow))
    return columnId === "plan"
      ? ref("targetMonthlySaving")
      : multiply(currentNumber("savingHours"), ref("laborCost"));
  if ([119, 122].includes(sourceRow))
    return multiply(ref("targetMonthlySaving"), currentNumber("workingDays"), ref("plannedVolume"));
  if (sourceRow === 125)
    return multiply(ref("targetMonthlySaving"), currentNumber("workingDays"), ref("laborCost"));
  if (cumulativeLaborRows.has(sourceRow))
    return multiply(
      currentNumber("cumulativeReductionPeople"),
      ref("targetMonthlySaving"),
      currentNumber("workingDays"),
    );
  if ([146, 149].includes(sourceRow) && columnId === "actual")
    return multiply(ref("laborCost"), currentNumber("actualCycle"));
  return ref("targetMonthlySaving");
}

function inputFieldForLowerRow(sourceRow: number): string {
  if (defectRows.has(sourceRow)) return "defectRate";
  if (directImprovementRows.has(sourceRow)) return "savingHours";
  if (cumulativeLaborRows.has(sourceRow)) return "cumulativeReductionPeople";
  return "actualCycle";
}

/**
 * Tạo cấu hình ban đầu từ đúng ý nghĩa các dòng trong sheet KKV.
 * Dự án chưa nhận diện vẫn giữ cách hiển thị cũ để không làm mất khả năng đọc dữ liệu người dùng.
 */
function inputFieldForUpperRow(sourceRow: number): string {
  return cumulativeLaborRows.has(sourceRow) ? "reductionPeople" : "productionQty";
}

function upperDisplayLabel(sourceRow: number, fallback: string): string {
  if (cumulativeLaborRows.has(sourceRow)) return "Nhân lực giảm trong tháng";
  return fallback === "Giá trị theo tháng" ? "Sản lượng thực tế" : fallback;
}

function lowerDisplayLabel(sourceRow: number, fallback: string): string {
  if (defectRows.has(sourceRow)) return "Tỷ lệ NG";
  if (shotRows.has(sourceRow)) return "Shot giảm";
  if (directImprovementRows.has(sourceRow) || [146, 149].includes(sourceRow))
    return "Giờ cải thiện";
  if (cycleDivisorByRow.has(sourceRow)) return "Cycle thực tế";
  if (cumulativeLaborRows.has(sourceRow)) return "Nhân lực giảm lũy kế";
  return fallback;
}

function activeColumns(planValues: Array<number | null>, actualValues: Array<number | null>) {
  const result: string[] = [];
  if (planValues.some((value) => value !== null)) result.push(PLAN_COLUMN_ID);
  if (actualValues.some((value) => value !== null)) result.push(ACTUAL_COLUMN_ID);
  return result;
}

function buildExcelMonthlyFieldConfigs(
  projects: Project[],
  sources: ExcelFormulaSource[],
  fieldDefinitions: ProjectFieldDefinition[],
  columnIds: string[],
): Array<{
  config: ProjectMonthlyFieldConfig;
  rowIndex: number;
}> {
  return projects.flatMap((project, index) => {
    const source = sources[index];
    const upperField = inputFieldForUpperRow(source.sourceRow);
    const lowerField = inputFieldForLowerRow(source.sourceRow);
    const visibility = new Map<
      string,
      { label: string; rowIndex: number; allowedColumnIds: string[]; suffix?: string }
    >();
    const upperColumns = activeColumns(source.upperPlan, source.upperActual);
    if (upperColumns.length)
      visibility.set(upperField, {
        label: upperDisplayLabel(source.sourceRow, source.upperLabel),
        rowIndex: 1,
        allowedColumnIds: upperColumns,
      });
    const lowerColumns = activeColumns(source.lowerPlan, source.lowerActual);
    if (lowerColumns.length || directImprovementRows.has(source.sourceRow))
      visibility.set(lowerField, {
        label: lowerDisplayLabel(source.sourceRow, source.lowerLabel),
        rowIndex: 3,
        allowedColumnIds: lowerColumns.length ? lowerColumns : [ACTUAL_COLUMN_ID],
        suffix: defectRows.has(source.sourceRow) ? "%" : undefined,
      });
    if (cumulativeLaborRows.has(source.sourceRow)) {
      visibility.set("reductionPeople", {
        label: "Nhân lực giảm trong tháng",
        rowIndex: 1,
        allowedColumnIds: [PLAN_COLUMN_ID],
        suffix: "người",
      });
      visibility.set("cumulativeReductionPeople", {
        label: "Nhân lực giảm lũy kế",
        rowIndex: 2,
        allowedColumnIds: [PLAN_COLUMN_ID],
        suffix: "người",
      });
    }
    visibility.set("savingUsd", {
      label: "Hiệu quả",
      rowIndex: 2,
      allowedColumnIds: columnIds,
      suffix: "USD",
    });

    return fieldDefinitions
      .filter((field) => field.scope === "monthly")
      .map((field) => {
        const presentation = visibility.get(field.id);
        return {
          rowIndex: presentation?.rowIndex ?? field.rowIndex,
          config: {
            projectId: project.id,
            fieldId: field.id,
            visible: Boolean(presentation),
            allowedColumnIds: presentation?.allowedColumnIds ?? columnIds,
            displayLabel: presentation?.label,
            displaySuffix: presentation?.suffix,
          },
        };
      });
  });
}

function buildExcelProjectFieldConfigs(
  projects: Project[],
  items: (typeof EXCEL_2026_PROJECTS)[number][],
  sources: ExcelFormulaSource[],
  fieldDefinitions: ProjectFieldDefinition[],
): ProjectFieldConfig[] {
  const defaults = projects.flatMap((project) =>
    fieldDefinitions
      .filter((field) => field.scope === "project" && isLibraryField(field))
      .map((field) => ({
        projectId: project.id,
        fieldId: field.id,
        visible: true,
        sortOrder: field.sortOrder,
      })),
  );
  return defaults.map((config) => {
    const projectIndex = projects.findIndex((project) => project.id === config.projectId);
    const item = items[projectIndex];
    const sourceRow = sources[projectIndex]?.sourceRow;
    if (!sourceRow || !item) return config;

    const commonPresentation: Record<string, { label: string; suffix?: string }> = {
      budget: { label: "Vốn đầu tư cần thiết", suffix: "USD" },
      targetMonthlySaving: { label: "Hiệu quả dự kiến", suffix: "USD/tháng" },
      referenceVolume: { label: "Sản lượng tham chiếu", suffix: "pcs/tháng" },
      referenceUnitPrice: { label: "Đơn giá tham chiếu", suffix: "USD/pcs" },
    };
    let presentation: Record<string, { label: string; suffix?: string }>;

    if (defectRows.has(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Tỷ lệ NG hiện tại", suffix: "%" },
        targetCycle: { label: "Tỷ lệ NG mục tiêu", suffix: "%" },
        plannedVolume: { label: "Sản lượng tháng", suffix: "pcs/tháng" },
        laborCost: { label: "Đơn giá sản phẩm", suffix: "USD/pcs" },
        targetMonthlyReduction: { label: "Tỷ lệ NG dự kiến giảm", suffix: "%" },
        ...commonPresentation,
      };
    } else if (shotRows.has(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Số shot hiện tại", suffix: "shot/lần chạy" },
        targetCycle: { label: "Số shot mục tiêu", suffix: "shot/lần chạy" },
        plannedVolume: { label: "Sản lượng tháng", suffix: "pcs/tháng" },
        laborCost: { label: "Đơn giá vật liệu", suffix: "USD/shot" },
        targetMonthlyReduction: { label: "Số shot dự kiến giảm", suffix: "shot/lần chạy" },
        ...commonPresentation,
      };
    } else if (directImprovementRows.has(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Thời gian thao tác hiện tại", suffix: "giây/sp" },
        targetCycle: { label: "Thời gian thao tác mục tiêu", suffix: "giây/sp" },
        plannedVolume: { label: "Sản lượng tháng", suffix: "pcs/tháng" },
        laborCost: { label: "Chi phí lao động", suffix: "USD/giờ" },
        targetMonthlyReduction: { label: "Giờ cải thiện dự kiến", suffix: "giờ/tháng" },
        ...commonPresentation,
      };
    } else if (cycleDivisorByRow.has(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Cycle hiện tại", suffix: "giây/sp" },
        targetCycle: { label: "Cycle mục tiêu", suffix: "giây/sp" },
        plannedVolume: { label: "Sản lượng tháng", suffix: "pcs/tháng" },
        laborCost: { label: "Chi phí lao động", suffix: "USD/giờ" },
        targetMonthlyReduction: { label: "Giờ tiết kiệm dự kiến", suffix: "giờ/tháng" },
        ...commonPresentation,
      };
    } else if ([113, 116].includes(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Thời gian xử lý hiện tại", suffix: "giây/pcs" },
        targetCycle: { label: "Thời gian xử lý mục tiêu", suffix: "giây/pcs" },
        plannedVolume: { label: "Sản lượng tháng", suffix: "pcs/tháng" },
        laborCost: { label: "Chi phí lao động", suffix: "USD/giờ" },
        targetMonthlyReduction: { label: "Giờ công giảm dự kiến", suffix: "giờ/tháng" },
        ...commonPresentation,
      };
    } else if ([119, 122, 125].includes(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Số máy/người hiện tại", suffix: "máy/người" },
        targetCycle: { label: "Số máy/người mục tiêu", suffix: "máy/người" },
        plannedVolume: { label: "Nhân lực giảm dự kiến", suffix: "người" },
        laborCost: { label: "Chi phí lao động", suffix: "USD/giờ" },
        targetMonthlyReduction: { label: "Giờ làm việc mỗi ngày", suffix: "giờ/người/ngày" },
        targetMonthlySaving: { label: "Hiệu quả mỗi người/ngày", suffix: "USD/người/ngày" },
        budget: commonPresentation.budget,
      };
    } else if ([128, 131].includes(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Chi phí vật liệu hiện tại", suffix: "USD/tháng" },
        targetCycle: { label: "Chi phí vật liệu sau cải thiện", suffix: "USD/tháng" },
        targetMonthlySaving: { label: "Chi phí vật liệu giảm", suffix: "USD/tháng" },
        budget: commonPresentation.budget,
      };
    } else if (cumulativeLaborRows.has(sourceRow)) {
      presentation = {
        baselineCycle: { label: "Nhân lực hiện tại", suffix: "người" },
        targetCycle: { label: "Nhân lực mục tiêu", suffix: "người" },
        laborCost: { label: "Chi phí lao động", suffix: "USD/giờ" },
        targetMonthlyReduction: { label: "Giờ làm việc mỗi ngày", suffix: "giờ/người/ngày" },
        targetMonthlySaving: { label: "Hiệu quả mỗi người/ngày", suffix: "USD/người/ngày" },
        budget: commonPresentation.budget,
      };
    } else if (sourceRow === 137) {
      presentation = {
        plannedVolume: { label: "Diện tích giải phóng", suffix: "m²" },
        laborCost: { label: "Giá trị quy đổi diện tích", suffix: "USD/m²/tháng" },
        targetMonthlySaving: { label: "Hiệu quả sử dụng diện tích", suffix: "USD/tháng" },
        budget: commonPresentation.budget,
      };
    } else if (sourceRow === 140) {
      presentation = {
        targetMonthlyReduction: { label: "Hiệu quả mục tiêu năm", suffix: "USD/năm" },
        targetMonthlySaving: { label: "Hiệu quả mục tiêu tháng", suffix: "USD/tháng" },
        budget: { label: "Chi phí đầu tư thiết bị", suffix: "USD" },
      };
    } else if ([146, 149].includes(sourceRow)) {
      presentation = {
        laborCost: { label: "Chi phí lao động", suffix: "USD/giờ" },
        targetMonthlyReduction: { label: "Giờ công giảm dự kiến", suffix: "giờ/tháng" },
        targetMonthlySaving: { label: "Hiệu quả dự kiến", suffix: "USD/tháng" },
      };
    } else {
      presentation = commonPresentation;
    }

    if (item.budget == null) delete presentation.budget;
    if (sources[projectIndex]?.referenceVolume == null) delete presentation.referenceVolume;
    if (sources[projectIndex]?.referenceUnitPrice == null) delete presentation.referenceUnitPrice;
    const visibleFieldIds = new Set([
      ...Object.keys(presentation),
      "goalNote",
      "difficulty",
      "responsiblePerson",
    ]);
    const fieldPresentation = presentation[config.fieldId];
    return {
      ...config,
      visible: visibleFieldIds.has(config.fieldId),
      summaryProjectColumnId: visibleFieldIds.has(config.fieldId)
        ? `summary-project-column-${config.fieldId}`
        : undefined,
      displayLabel: fieldPresentation?.label,
      displaySuffix: fieldPresentation?.suffix,
    };
  });
}

export function createSeedState(): KkvState {
  const baseFieldDefinitions = structuredClone(fields).map((field) =>
    field.scope === "monthly" && field.formula
      ? {
          ...field,
          formula: undefined,
          columnFormulas: ["plan", "actual"].map((columnId) => ({
            ...field.formula!,
            id: `${field.formula!.id}-${columnId}`,
            columnId,
          })),
        }
      : field,
  );
  const projectByRow = new Map(EXCEL_2026_PROJECTS.map((item) => [item.sourceRow, item]));
  const formulaByRow = new Map(EXCEL_2026_FORMULA_DATA.map((item) => [item.sourceRow, item]));
  const orderedItems = EXCEL_2026_SOURCE_ROW_ORDER.map((row) => projectByRow.get(row)!);
  const orderedFormulaSources = EXCEL_2026_SOURCE_ROW_ORDER.map((row) => formulaByRow.get(row)!);
  const projects: Project[] = orderedItems.map((item, index) => ({
    id: `project-${index + 1}`,
    year: DEMO_YEAR,
    code: item.code,
    name: item.name,
    category: item.category,
    department: item.department,
    owner: item.owner,
    product: item.product,
    startMonth: item.startMonth,
    deadline: `2026-${String(Math.min(12, item.startMonth + 5)).padStart(2, "0")}-28`,
    description: richText(item.description || item.name),
    notes: richText(`Kế hoạch cải tiến năm 2026 · Bắt đầu từ tháng ${item.startMonth}.`),
    targetReason: richText(item.goalNote || item.description || item.name),
    templateId: defectRows.has(item.sourceRow)
      ? "quality"
      : cumulativeLaborRows.has(item.sourceRow)
        ? "amr"
        : directImprovementRows.has(item.sourceRow) || [146, 149].includes(item.sourceRow)
          ? "office"
          : "cycle",
  }));
  const fieldDefinitions = [...baseFieldDefinitions];
  const monthlySummaryMetrics = fieldDefinitions
    .filter(
      (field) =>
        field.scope === "monthly" && isLibraryField(field) && field.semanticType === "Number",
    )
    .map((field) => ({
      id: field.id,
      code: field.code,
      label: field.label,
      semanticType: field.semanticType,
      displayMode: field.displayMode,
      displayPrecision: field.displayPrecision,
      prefix: field.prefix,
      suffix: field.suffix,
      sortOrder: field.sortOrder,
      enabled: true,
    }));

  const fieldValues = projects.flatMap((project, index) => {
    const item = orderedItems[index];
    const source = orderedFormulaSources[index];
    const percentageScale = defectRows.has(source.sourceRow) ? 100 : 1;
    return [
      {
        projectId: project.id,
        fieldId: "baselineCycle",
        value: numeric(item.baseline == null ? null : item.baseline * percentageScale),
      },
      {
        projectId: project.id,
        fieldId: "targetCycle",
        value: numeric(item.target == null ? null : item.target * percentageScale),
      },
      {
        projectId: project.id,
        fieldId: "goalNote",
        value: richText(item.goalNote || item.description),
      },
      {
        projectId: project.id,
        fieldId: "plannedVolume",
        value: numeric(item.plannedVolume),
      },
      {
        projectId: project.id,
        fieldId: "referenceVolume",
        value: numeric(source.referenceVolume),
      },
      { projectId: project.id, fieldId: "laborCost", value: numeric(item.laborCost) },
      {
        projectId: project.id,
        fieldId: "referenceUnitPrice",
        value: numeric(source.referenceUnitPrice),
      },
      {
        projectId: project.id,
        fieldId: "budget",
        value: numeric(item.budget),
      },
      {
        projectId: project.id,
        fieldId: "targetMonthlyReduction",
        value: numeric(
          item.targetReduction == null ? null : item.targetReduction * percentageScale,
        ),
      },
      {
        projectId: project.id,
        fieldId: "targetMonthlySaving",
        value: numeric(item.targetSaving),
      },
      { projectId: project.id, fieldId: "difficulty", value: item.difficulty },
      { projectId: project.id, fieldId: "responsiblePerson", value: item.owner },
    ];
  });

  const monthlyValues: KkvState["monthlyValues"] = [];
  const formulaOverrides: KkvState["formulaOverrides"] = [];
  projects.forEach((project, projectIndex) => {
    const item = orderedItems[projectIndex];
    const source = orderedFormulaSources[projectIndex];
    const upperField = inputFieldForUpperRow(source.sourceRow);
    const lowerField = inputFieldForLowerRow(source.sourceRow);

    (["plan", "actual"] as const).forEach((columnId) => {
      const upperValues = columnId === "plan" ? source.upperPlan : source.upperActual;
      const lowerValues = columnId === "plan" ? source.lowerPlan : source.lowerActual;
      const lowerFormulas =
        columnId === "plan" ? source.lowerPlanFormulas : source.lowerActualFormulas;
      const resultValues = columnId === "plan" ? item.planSaving : item.actualSaving;
      const resultFormulas =
        columnId === "plan" ? source.resultPlanFormulas : source.resultActualFormulas;

      upperValues.forEach((value, monthIndex) => {
        if (value === null) return;
        monthlyValues.push({
          projectId: project.id,
          fieldId: upperField,
          year: DEMO_YEAR,
          month: monthIndex + 1,
          columnId,
          value,
        });
      });
      lowerValues.forEach((value, monthIndex) => {
        if (
          value === null ||
          lowerFormulas[monthIndex] ||
          lowerField === "cumulativeReductionPeople"
        )
          return;
        monthlyValues.push({
          projectId: project.id,
          fieldId: lowerField,
          year: DEMO_YEAR,
          month: monthIndex + 1,
          columnId,
          value: defectRows.has(source.sourceRow) ? value * 100 : value,
        });
      });

      const formulaMonths = resultFormulas.flatMap((value, monthIndex) =>
        value ? [monthIndex + 1] : [],
      );
      if (formulaMonths.length) {
        formulaOverrides.push({
          id: `override-excel-${source.sourceRow}-saving-${columnId}`,
          projectId: project.id,
          fieldId: "savingUsd",
          columnId,
          year: DEMO_YEAR,
          months: formulaMonths,
          formula: formula(
            `formula-excel-${source.sourceRow}-saving-${columnId}`,
            excelSavingAst(source.sourceRow, columnId),
            `Tính hiệu quả theo dữ liệu ${columnId === "plan" ? "kế hoạch" : "thực tế"}`,
          ),
        });
      }
      resultValues.forEach((value, monthIndex) => {
        if (value === null || resultFormulas[monthIndex]) return;
        formulaOverrides.push({
          id: `override-excel-${source.sourceRow}-${columnId}-${monthIndex + 1}`,
          projectId: project.id,
          fieldId: "savingUsd",
          columnId,
          year: DEMO_YEAR,
          months: [monthIndex + 1],
          formula: formula(
            `formula-excel-${source.sourceRow}-${columnId}-${monthIndex + 1}`,
            lit(value),
            String(value),
          ),
        });
      });
    });

    const savingHoursAst = excelSavingHoursAst(source.sourceRow);
    if (savingHoursAst) {
      const formulaMonths = directImprovementRows.has(source.sourceRow)
        ? source.lowerActualFormulas.flatMap((value, monthIndex) => (value ? [monthIndex + 1] : []))
        : source.resultActualFormulas.flatMap((value, monthIndex) =>
            value ? [monthIndex + 1] : [],
          );
      if (formulaMonths.length)
        formulaOverrides.push({
          id: `override-excel-${source.sourceRow}-saving-hours-actual`,
          projectId: project.id,
          fieldId: "savingHours",
          columnId: "actual",
          year: DEMO_YEAR,
          months: formulaMonths,
          formula: formula(
            `formula-excel-${source.sourceRow}-saving-hours-actual`,
            savingHoursAst,
            "Tính giờ cải thiện theo dữ liệu thực tế",
          ),
        });
    }

    if (cumulativeLaborRows.has(source.sourceRow)) {
      const formulaMonths = source.lowerPlan.flatMap((value, monthIndex) =>
        value !== null ? [monthIndex + 1] : [],
      );
      if (formulaMonths.length)
        formulaOverrides.push({
          id: `override-excel-${source.sourceRow}-cumulative-reduction-plan`,
          projectId: project.id,
          fieldId: "cumulativeReductionPeople",
          columnId: "plan",
          year: DEMO_YEAR,
          months: formulaMonths,
          formula: formula(
            `formula-excel-${source.sourceRow}-cumulative-reduction-plan`,
            binary(
              "+",
              zeroWhenBlankOrError(ref("cumulativeReductionPeople", "plan", { kind: "previous" })),
              current("reductionPeople"),
            ),
            "IFERROR(IF(ISBLANK([Nhân lực giảm lũy kế · Kế hoạch · Tháng trước]), 0, [Nhân lực giảm lũy kế · Kế hoạch · Tháng trước]), 0) + [Nhân lực giảm trong tháng · Kế hoạch · Tháng hiện tại]",
          ),
        });
    }
  });

  const monthlyColumns = [
    { id: PLAN_COLUMN_ID, role: "plan" as const, code: "plan", label: "Kế hoạch", sortOrder: 10 },
    {
      id: ACTUAL_COLUMN_ID,
      role: "actual" as const,
      code: "actual",
      label: "Thực tế",
      sortOrder: 20,
    },
  ];
  const summaryColumns = [
    {
      id: "summary-column-year",
      role: "annual" as const,
      code: "annualTotal",
      label: "Tổng năm",
      months: [...allMonths],
      columnIds: monthlyColumns.map((column) => column.id),
      sortOrder: 10,
      enabled: true,
    },
  ];
  const summaryRows = [
    {
      id: "summary-row-total",
      code: "grandTotal",
      label: "Tổng cộng",
      showInMonthlyColumns: true,
      summaryColumnIds: ["summary-column-year"],
      sortOrder: 10,
      enabled: true,
    },
    {
      id: "summary-row-cumulative",
      code: "cumulativeTotal",
      label: "Lũy kế",
      showInMonthlyColumns: true,
      summaryColumnIds: ["summary-column-year"],
      sortOrder: 20,
      enabled: true,
    },
    {
      id: "summary-row-cumulative-variance",
      code: "cumulativeVariance",
      label: "Chênh lệch lũy kế",
      showInMonthlyColumns: true,
      summaryColumnIds: ["summary-column-year"],
      sortOrder: 30,
      enabled: true,
    },
  ];
  const summaryFormulas = [
    ...fieldDefinitions.flatMap((field) => {
      if (field.scope !== "monthly") return [];
      const functionName =
        field.id === "defectRate"
          ? "AVG"
          : field.id === "cumulativeReductionPeople" || field.id === "cumulativeSaving"
            ? "LAST"
            : "SUM";
      return monthlyColumns.map((column) => {
        const ast: FormulaAst = {
          kind: "function",
          name: functionName,
          args: [metricRef(field.id, column.id, { kind: "range", from: 1, to: 12 })],
        };
        return {
          id: `summary-formula-annual-${field.id}-${column.id}`,
          targetKind: "column" as const,
          summaryId: "summary-column-year",
          metricId: field.id,
          columnId: column.id,
          formula: formula(
            `formula-summary-annual-${field.id}-${column.id}`,
            ast,
            `${functionName}([${field.label} · ${column.label} · T1:T12])`,
          ),
        };
      });
    }),
    ...monthlyColumns.map((column) => {
      const ast: FormulaAst = {
        kind: "function",
        name: "SUM",
        args: [metricRef("savingUsd", column.id, { kind: "current" }, "filtered")],
      };
      return {
        id: `summary-formula-total-saving-${column.id}`,
        targetKind: "row" as const,
        summaryId: "summary-row-total",
        metricId: "savingUsd",
        columnId: column.id,
        formula: formula(
          `formula-summary-total-saving-${column.id}`,
          ast,
          `SUM([Hiệu quả · ${column.label} · Tháng hiện tại · Các dự án theo bộ lọc])`,
        ),
      };
    }),
    ...monthlyColumns.map((column) => {
      const ast: FormulaAst = {
        kind: "function",
        name: "SUM",
        args: [metricRef("savingUsd", column.id, { kind: "ytd" }, "filtered")],
      };
      return {
        id: `summary-formula-cumulative-saving-${column.id}`,
        targetKind: "row" as const,
        summaryId: "summary-row-cumulative",
        metricId: "savingUsd",
        columnId: column.id,
        formula: formula(
          `formula-summary-cumulative-saving-${column.id}`,
          ast,
          `SUM([Hiệu quả · ${column.label} · Từ đầu năm đến cột hiện tại · Các dự án theo bộ lọc])`,
        ),
      };
    }),
    {
      id: "summary-formula-cumulative-variance-saving-actual",
      targetKind: "row" as const,
      summaryId: "summary-row-cumulative-variance",
      metricId: "savingUsd",
      columnId: "actual",
      formula: formula(
        "formula-summary-cumulative-variance-saving-actual",
        binary(
          "-",
          summaryRef("row", "summary-row-cumulative", "savingUsd", "actual"),
          summaryRef("row", "summary-row-cumulative", "savingUsd", "plan"),
        ),
        "[Lũy kế · Hiệu quả · Thực tế · Cột hiện tại] − [Lũy kế · Hiệu quả · Kế hoạch · Cột hiện tại]",
      ),
    },
  ];
  const chartDefinitions = [
    {
      id: "chart-excel-saving-combo",
      name: "Lũy kế giá trị cải tiến",
      description: "So sánh hiệu quả theo tháng và xu hướng lũy kế trong năm.",
      dashboardScope: "summary" as const,
      categoryAxis: "month" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "full" as const,
      height: "large" as const,
      orientation: "vertical" as const,
      categorySort: "source" as const,
      columnMode: "grouped" as const,
      sortOrder: 5,
      series: [
        {
          id: "series-excel-monthly-plan",
          label: "Kế hoạch tháng",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-total",
          metricId: "savingUsd",
          columnId: "plan",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#5B9BD5",
          showValue: false,
        },
        {
          id: "series-excel-monthly-actual",
          label: "Thực tế tháng",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-total",
          metricId: "savingUsd",
          columnId: "actual",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#ED7D31",
          showValue: false,
        },
        {
          id: "series-excel-cumulative-plan",
          label: "Kế hoạch lũy kế",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-cumulative",
          metricId: "savingUsd",
          columnId: "plan",
          renderer: "line" as const,
          valueAxis: "right" as const,
          color: "#4472C4",
          showValue: false,
        },
        {
          id: "series-excel-cumulative-actual",
          label: "Thực tế lũy kế",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-cumulative",
          metricId: "savingUsd",
          columnId: "actual",
          renderer: "line" as const,
          valueAxis: "right" as const,
          color: "#C55A11",
          showValue: false,
        },
      ],
    },
    {
      id: "chart-monthly-saving",
      name: "Kế hoạch và thực tế theo tháng",
      description: "So sánh hiệu quả kế hoạch và thực tế của các dự án theo từng tháng.",
      dashboardScope: "summary" as const,
      categoryAxis: "month" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "full" as const,
      height: "medium" as const,
      orientation: "vertical" as const,
      categorySort: "source" as const,
      columnMode: "grouped" as const,
      sortOrder: 10,
      series: [
        {
          id: "series-monthly-saving-plan",
          label: "Kế hoạch",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-total",
          metricId: "savingUsd",
          columnId: "plan",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#135D66",
          showValue: false,
        },
        {
          id: "series-monthly-saving-actual",
          label: "Thực tế",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-total",
          metricId: "savingUsd",
          columnId: "actual",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#E97836",
          showValue: false,
        },
      ],
    },
    {
      id: "chart-cumulative-saving",
      name: "Kế hoạch và thực tế lũy kế",
      description: "Theo dõi khoảng cách giữa kế hoạch lũy kế và kết quả thực tế lũy kế.",
      dashboardScope: "summary" as const,
      categoryAxis: "month" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "half" as const,
      height: "medium" as const,
      orientation: "vertical" as const,
      categorySort: "source" as const,
      columnMode: "grouped" as const,
      sortOrder: 20,
      series: [
        {
          id: "series-cumulative-saving-plan",
          label: "Kế hoạch lũy kế",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-cumulative",
          metricId: "savingUsd",
          columnId: "plan",
          renderer: "line" as const,
          valueAxis: "left" as const,
          color: "#135D66",
          showValue: false,
        },
        {
          id: "series-cumulative-saving-actual",
          label: "Thực tế lũy kế",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-cumulative",
          metricId: "savingUsd",
          columnId: "actual",
          renderer: "line" as const,
          valueAxis: "left" as const,
          color: "#E97836",
          showValue: false,
        },
      ],
    },
    {
      id: "chart-cumulative-variance",
      name: "Chênh lệch lũy kế",
      description: "Phần thực tế lũy kế cao hơn hoặc thấp hơn kế hoạch lũy kế.",
      dashboardScope: "summary" as const,
      categoryAxis: "month" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "half" as const,
      height: "medium" as const,
      orientation: "vertical" as const,
      categorySort: "source" as const,
      columnMode: "grouped" as const,
      sortOrder: 30,
      series: [
        {
          id: "series-cumulative-variance",
          label: "Thực tế − Kế hoạch",
          sourceKind: "summaryRow" as const,
          summaryRowId: "summary-row-cumulative-variance",
          metricId: "savingUsd",
          columnId: "actual",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#2E7D32",
          showValue: false,
        },
      ],
    },
    {
      id: "chart-project-saving-comparison",
      name: "So sánh hiệu quả theo dự án",
      description: "Xếp hạng tổng hiệu quả thực tế của từng dự án trong năm.",
      dashboardScope: "summary" as const,
      categoryAxis: "project" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "full" as const,
      height: "large" as const,
      orientation: "horizontal" as const,
      categorySort: "valueDesc" as const,
      projectLabel: "name" as const,
      columnMode: "grouped" as const,
      sortOrder: 40,
      series: [
        {
          id: "series-project-saving-actual",
          label: "Hiệu quả thực tế",
          sourceKind: "summaryColumn" as const,
          summaryColumnId: "summary-column-year",
          metricId: "savingUsd",
          columnId: "actual",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#135D66",
          showValue: true,
        },
      ],
    },
    {
      id: "chart-project-saving-share",
      name: "Tỷ trọng hiệu quả theo dự án",
      description: "Tỷ lệ đóng góp vào tổng hiệu quả thực tế của các dự án trong năm.",
      dashboardScope: "summary" as const,
      categoryAxis: "project" as const,
      presentation: "donut" as const,
      filterScope: "followPageFilters" as const,
      size: "half" as const,
      height: "medium" as const,
      orientation: "vertical" as const,
      categorySort: "valueDesc" as const,
      projectLabel: "name" as const,
      topN: 8,
      groupRemainder: true,
      columnMode: "grouped" as const,
      sortOrder: 50,
      series: [
        {
          id: "series-project-saving-share",
          label: "Hiệu quả thực tế",
          sourceKind: "summaryColumn" as const,
          summaryColumnId: "summary-column-year",
          metricId: "savingUsd",
          columnId: "actual",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#135D66",
          showValue: false,
        },
      ],
    },
    {
      id: "chart-project-detail-monthly-saving",
      name: "Hiệu quả theo tháng",
      description: "So sánh kế hoạch và thực tế của dự án đang chọn theo từng tháng.",
      dashboardScope: "project" as const,
      categoryAxis: "month" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "full" as const,
      height: "medium" as const,
      orientation: "vertical" as const,
      categorySort: "source" as const,
      projectLabel: "name" as const,
      columnMode: "grouped" as const,
      sortOrder: 10,
      series: [
        {
          id: "series-project-detail-saving-plan",
          label: "Kế hoạch",
          sourceKind: "monthlyField" as const,
          fieldId: "savingUsd",
          columnId: "plan",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#135D66",
          showValue: false,
        },
        {
          id: "series-project-detail-saving-actual",
          label: "Thực tế",
          sourceKind: "monthlyField" as const,
          fieldId: "savingUsd",
          columnId: "actual",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#E97836",
          showValue: false,
        },
      ],
    },
    {
      id: "chart-project-detail-cumulative-saving",
      name: "Hiệu quả lũy kế",
      description: "Theo dõi hiệu quả lũy kế kế hoạch và thực tế của dự án đang chọn.",
      dashboardScope: "project" as const,
      categoryAxis: "month" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "half" as const,
      height: "medium" as const,
      orientation: "vertical" as const,
      categorySort: "source" as const,
      projectLabel: "name" as const,
      columnMode: "grouped" as const,
      sortOrder: 20,
      series: [
        {
          id: "series-project-detail-cumulative-plan",
          label: "Kế hoạch lũy kế",
          sourceKind: "monthlyField" as const,
          fieldId: "cumulativeSaving",
          columnId: "plan",
          renderer: "line" as const,
          valueAxis: "left" as const,
          color: "#135D66",
          showValue: false,
        },
        {
          id: "series-project-detail-cumulative-actual",
          label: "Thực tế lũy kế",
          sourceKind: "monthlyField" as const,
          fieldId: "cumulativeSaving",
          columnId: "actual",
          renderer: "line" as const,
          valueAxis: "left" as const,
          color: "#E97836",
          showValue: false,
        },
      ],
    },
    {
      id: "chart-project-detail-production",
      name: "Sản lượng theo tháng",
      description: "So sánh sản lượng kế hoạch và thực tế của dự án đang chọn.",
      dashboardScope: "project" as const,
      categoryAxis: "month" as const,
      presentation: "cartesian" as const,
      filterScope: "followPageFilters" as const,
      size: "half" as const,
      height: "medium" as const,
      orientation: "vertical" as const,
      categorySort: "source" as const,
      projectLabel: "name" as const,
      columnMode: "grouped" as const,
      sortOrder: 30,
      series: [
        {
          id: "series-project-detail-production-plan",
          label: "Kế hoạch",
          sourceKind: "monthlyField" as const,
          fieldId: "productionQty",
          columnId: "plan",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#0277BD",
          showValue: false,
        },
        {
          id: "series-project-detail-production-actual",
          label: "Thực tế",
          sourceKind: "monthlyField" as const,
          fieldId: "productionQty",
          columnId: "actual",
          renderer: "column" as const,
          valueAxis: "left" as const,
          color: "#2E7D32",
          showValue: false,
        },
      ],
    },
  ];
  const summaryProjectColumns = PROJECT_FIELD_BLUEPRINTS.map((field) => ({
    id: `summary-project-column-${field.id}`,
    code: field.id,
    label: field.label,
    parentId: field.parentId,
    columnType: field.columnType,
    sortOrder: field.sortOrder,
    enabled: true,
  }));
  const projectFieldTemplates = DEFAULT_PROJECT_FIELD_TEMPLATES.map((template) => ({
    ...structuredClone(template),
    fields: template.fields.map((item) => ({
      ...structuredClone(item),
      summaryMetricId: monthlySummaryMetrics.some((metric) => metric.id === item.fieldId)
        ? item.fieldId
        : undefined,
    })),
    formulas: buildTemplateFormulas(template, fieldDefinitions),
  }));
  const seededProjectFormulaOverrides: KkvState["projectFormulaOverrides"] = projects.map(
    (project, index) => {
      const item = orderedItems[index];
      const source = orderedFormulaSources[index];
      return source.targetFormula
        ? {
            id: `project-formula-${project.id}`,
            projectId: project.id,
            fieldId: "targetMonthlySaving",
            formula: formula(
              `project-formula-excel-${source.sourceRow}`,
              excelProjectFormula(source.sourceRow),
              "Tính hiệu quả dự kiến theo thông tin dự án",
            ),
          }
        : {
            id: `project-formula-${project.id}`,
            projectId: project.id,
            fieldId: "targetMonthlySaving",
            formula: formula(
              `project-formula-excel-${source.sourceRow}`,
              lit(item.targetSaving),
              String(item.targetSaving),
            ),
          };
    },
  );
  const projectFormulaOverrides = seededProjectFormulaOverrides.filter((override) => {
    const templateId = projects.find((project) => project.id === override.projectId)?.templateId;
    const templateFormula = projectFieldTemplates
      .find((template) => template.id === templateId)
      ?.formulas?.find(
        (item) => item.fieldId === override.fieldId && item.columnId === undefined,
      )?.formula;
    return JSON.stringify(override.formula.ast) !== JSON.stringify(templateFormula?.ast);
  });
  const projectFieldConfigs = buildExcelProjectFieldConfigs(
    projects,
    orderedItems,
    orderedFormulaSources,
    fieldDefinitions,
  ).flatMap((config) => {
    const template = projectFieldTemplates.find(
      (candidate) =>
        candidate.id === projects.find((project) => project.id === config.projectId)?.templateId,
    );
    const inherited = template?.projectFields?.find((item) => item.fieldId === config.fieldId);
    const definition = fieldDefinitions.find(
      (field) => field.scope === "project" && field.id === config.fieldId && isLibraryField(field),
    );
    const inheritedVisible = inherited?.visible ?? Boolean(inherited);
    const override: ProjectFieldConfig = {
      projectId: config.projectId,
      fieldId: config.fieldId,
    };
    if (config.visible !== inheritedVisible) override.visible = config.visible;
    if (
      config.displayLabel &&
      config.displayLabel !== (inherited?.displayLabel ?? definition?.label)
    )
      override.displayLabel = config.displayLabel;
    if (
      config.displaySuffix &&
      config.displaySuffix !== (inherited?.displaySuffix ?? definition?.suffix)
    )
      override.displaySuffix = config.displaySuffix;
    if ((config.summaryProjectColumnId ?? null) !== (inherited?.summaryProjectColumnId ?? null))
      override.summaryProjectColumnId = config.summaryProjectColumnId ?? null;
    if (config.sortOrder !== (inherited?.sortOrder ?? definition?.sortOrder))
      override.sortOrder = config.sortOrder;
    return Object.keys(override).length > 2 ? [override] : [];
  });
  const seededMonthlyFieldConfigs = buildExcelMonthlyFieldConfigs(
    projects,
    orderedFormulaSources,
    fieldDefinitions,
    monthlyColumns.map((column) => column.id),
  );
  const projectMonthlyLayouts = projects.map((project) => {
    const visible = seededMonthlyFieldConfigs.filter(
      (item) => item.config.projectId === project.id && item.config.visible,
    );
    const rowIndexes = [...new Set(visible.map((config) => config.rowIndex))].sort(
      (first, second) => first - second,
    );
    const rows = rowIndexes.map((rowIndex, index) => ({
      id: `layout-row-${project.id}-${rowIndex}`,
      sortOrder: (index + 1) * 10,
    }));
    const rowIdByIndex = new Map(rowIndexes.map((rowIndex, index) => [rowIndex, rows[index].id]));
    return {
      projectId: project.id,
      rows,
      placements: visible.map((config, index) => ({
        fieldId: config.config.fieldId,
        rowId: rowIdByIndex.get(config.rowIndex) ?? rows[0]?.id ?? `layout-row-${project.id}-1`,
        sortOrder: (index + 1) * 10,
      })),
    };
  });
  const projectMonthlyFieldConfigs = seededMonthlyFieldConfigs.flatMap(({ config }) => {
    const template = projectFieldTemplates.find(
      (candidate) =>
        candidate.id === projects.find((project) => project.id === config.projectId)?.templateId,
    );
    const inherited = template?.fields.find((item) => item.fieldId === config.fieldId);
    const definition = fieldDefinitions.find(
      (field) => field.scope === "monthly" && field.id === config.fieldId && isLibraryField(field),
    );
    const inheritedVisible = Boolean(inherited);
    const override: ProjectMonthlyFieldConfig = {
      projectId: config.projectId,
      fieldId: config.fieldId,
    };
    if (config.visible !== inheritedVisible) override.visible = config.visible;
    if (
      config.displayLabel &&
      config.displayLabel !== (inherited?.displayLabel ?? definition?.label)
    )
      override.displayLabel = config.displayLabel;
    if (
      config.displaySuffix &&
      config.displaySuffix !== (inherited?.displaySuffix ?? definition?.suffix)
    )
      override.displaySuffix = config.displaySuffix;
    if (
      JSON.stringify(config.allowedColumnIds ?? []) !==
      JSON.stringify(inherited?.allowedColumnIds ?? [])
    )
      override.allowedColumnIds = config.allowedColumnIds;
    return Object.keys(override).length > 2 ? [override] : [];
  });
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    selectedYear: DEMO_YEAR,
    availableYears: [DEMO_YEAR],
    projects,
    fieldDefinitions,
    fieldValues,
    projectMonthlyLayouts,
    projectFieldConfigs,
    projectMonthlyFieldConfigs,
    projectFieldTemplates,
    monthlySummaryMetrics,
    summaryProjectColumns,
    columnGroups: [
      {
        id: "g-target-effect",
        code: "mucTieuHieuQuaThang",
        label: "Mục tiêu hiệu quả tháng",
        sortOrder: 70,
      },
    ],
    monthlyColumns,
    summaryColumns,
    summaryRows,
    summaryFormulas,
    monthlyValues,
    calendarValues: allMonths.map((month) => ({
      fieldId: "workingDays",
      year: DEMO_YEAR,
      month,
      value: workingDays[month - 1],
    })),
    periods: allMonths.map((month) => ({ month, label: `Tháng ${month}` })),
    formulaOverrides,
    projectFormulaOverrides,
    chartDefinitions,
  };
}
