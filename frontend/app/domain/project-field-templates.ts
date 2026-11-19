import type { ProjectFieldDefinition, ProjectFieldTemplate, ProjectTemplateFormula } from "./types";
import { fieldFormulaForColumn } from "./metadata";

export const DEFAULT_PROJECT_FIELD_TEMPLATES: ProjectFieldTemplate[] = [
  {
    id: "quality",
    label: "Giảm lỗi / NG",
    description: "Sản lượng thực tế, tỷ lệ NG và hiệu quả.",
    projectFields: [
      projectTemplateField("baselineCycle", "Tỷ lệ NG hiện tại", "%"),
      projectTemplateField("targetCycle", "Tỷ lệ NG mục tiêu", "%"),
      projectTemplateField("plannedVolume", "Sản lượng tháng", "pcs"),
      projectTemplateField("laborCost", "Đơn giá sản phẩm", "USD/pcs"),
      projectTemplateField("budget", "Chi phí đầu tư", "USD"),
      projectTemplateField("targetMonthlyReduction", "Mức giảm dự kiến", "%"),
      projectTemplateField("targetMonthlySaving", "Hiệu quả dự kiến", "USD"),
    ],
    fields: [
      templateField("productionQty", "Sản lượng thực tế", "pcs", 1, ["actual"]),
      templateField("savingUsd", "Hiệu quả", "USD", 2, ["plan", "actual"]),
      templateField("defectRate", "Tỷ lệ NG", "%", 3, ["plan", "actual"]),
    ],
    monthlyLayout: templateLayout("quality", [
      ["productionQty", 1],
      ["savingUsd", 2],
      ["defectRate", 3],
    ]),
  },
  {
    id: "cycle",
    label: "Giảm Cycle",
    description: "Sản lượng, hiệu quả và Cycle thực tế.",
    projectFields: [
      projectTemplateField("baselineCycle", "Cycle hiện tại", "giây/sp"),
      projectTemplateField("targetCycle", "Cycle mục tiêu", "giây/sp"),
      projectTemplateField("plannedVolume", "Sản lượng tháng", "pcs"),
      projectTemplateField("laborCost", "Chi phí quy đổi", "USD/giờ"),
      projectTemplateField("budget", "Chi phí đầu tư", "USD"),
      projectTemplateField("targetMonthlyReduction", "Thời gian giảm dự kiến", "giây/sp"),
      projectTemplateField("targetMonthlySaving", "Hiệu quả dự kiến", "USD"),
    ],
    fields: [
      templateField("productionQty", "Sản lượng thực tế", "pcs", 1, ["actual"]),
      templateField("savingUsd", "Hiệu quả", "USD", 2, ["plan", "actual"]),
      templateField("actualCycle", "Cycle thực tế", "giây/sp", 3, ["actual"]),
    ],
    monthlyLayout: templateLayout("cycle", [
      ["productionQty", 1],
      ["savingUsd", 2],
      ["actualCycle", 3],
    ]),
  },
  {
    id: "amr",
    label: "AMR / nhân lực",
    description: "Nhân lực giảm thêm, hiệu quả và nhân lực lũy kế.",
    projectFields: [
      projectTemplateField("baselineCycle", "Nhân lực hiện tại", "người"),
      projectTemplateField("targetCycle", "Nhân lực mục tiêu", "người"),
      projectTemplateField("laborCost", "Chi phí lao động", "USD/giờ"),
      projectTemplateField("budget", "Chi phí đầu tư", "USD"),
      projectTemplateField("targetMonthlyReduction", "Nhân lực giảm dự kiến", "người"),
      projectTemplateField("targetMonthlySaving", "Hiệu quả dự kiến", "USD"),
    ],
    fields: [
      templateField("reductionPeople", "Nhân lực giảm thêm", "người", 1, ["plan"]),
      templateField("savingUsd", "Hiệu quả", "USD", 2, ["plan"]),
      templateField("cumulativeReductionPeople", "Nhân lực giảm lũy kế", "người", 3, ["plan"]),
    ],
    monthlyLayout: templateLayout("amr", [
      ["reductionPeople", 1],
      ["savingUsd", 2],
      ["cumulativeReductionPeople", 3],
    ]),
  },
  {
    id: "office",
    label: "Giảm giờ công",
    description: "Giờ cải thiện thực tế và hiệu quả quy đổi.",
    projectFields: [
      projectTemplateField("baselineCycle", "Thời gian hiện tại", "giờ"),
      projectTemplateField("targetCycle", "Thời gian mục tiêu", "giờ"),
      projectTemplateField("laborCost", "Chi phí lao động", "USD/giờ"),
      projectTemplateField("budget", "Chi phí đầu tư", "USD"),
      projectTemplateField("targetMonthlyReduction", "Giờ giảm dự kiến", "giờ"),
      projectTemplateField("targetMonthlySaving", "Hiệu quả dự kiến", "USD"),
    ],
    fields: [
      templateField("actualCycle", "Giờ cải thiện", "giờ", 1, ["actual"]),
      templateField("savingUsd", "Hiệu quả", "USD", 2, ["plan", "actual"]),
    ],
    monthlyLayout: templateLayout("office", [
      ["actualCycle", 1],
      ["savingUsd", 2],
    ]),
  },
  {
    id: "custom",
    label: "Tự cấu hình",
    description: "Bắt đầu với bảng trống và tự bật từng trường cần dùng.",
    projectFields: [],
    fields: [],
    monthlyLayout: { rows: [], placements: [] },
  },
];

function projectTemplateField(fieldId: string, displayLabel: string, displaySuffix?: string) {
  return {
    fieldId,
    displayLabel,
    displaySuffix,
    summaryProjectColumnId: `summary-project-column-${fieldId}`,
    visible: true,
  };
}

function templateField(
  fieldId: string,
  displayLabel: string,
  displaySuffix: string,
  rowIndex: number,
  allowedColumnIds: string[],
) {
  return {
    fieldId,
    displayLabel,
    displaySuffix,
    allowedColumnIds,
  };
}

function templateLayout(templateId: string, items: Array<[fieldId: string, rowIndex: number]>) {
  const rowIndexes = [...new Set(items.map(([, rowIndex]) => rowIndex))].sort((a, b) => a - b);
  const rows = rowIndexes.map((rowIndex, index) => ({
    id: `template-row-${templateId}-${rowIndex}`,
    sortOrder: (index + 1) * 10,
  }));
  const rowIdByIndex = new Map(rowIndexes.map((rowIndex, index) => [rowIndex, rows[index].id]));

  return {
    rows,
    placements: items.map(([fieldId, rowIndex], index) => ({
      fieldId,
      rowId: rowIdByIndex.get(rowIndex) ?? rows[0]?.id ?? `template-row-${templateId}-1`,
      sortOrder: (index + 1) * 10,
    })),
  };
}

/** Tạo bộ công thức kế thừa ban đầu từ các công thức nền hiện có. */
export function buildTemplateFormulas(
  template: ProjectFieldTemplate,
  fieldDefinitions: ProjectFieldDefinition[],
): ProjectTemplateFormula[] {
  const monthly = template.fields.flatMap((item) => {
    const field = fieldDefinitions.find(
      (candidate) => candidate.scope === "monthly" && candidate.id === item.fieldId,
    );
    return item.allowedColumnIds.flatMap((columnId) => {
      const formula = fieldFormulaForColumn(field, columnId);
      return formula
        ? [
            {
              fieldId: item.fieldId,
              columnId,
              formula: structuredClone(formula),
            },
          ]
        : [];
    });
  });
  const project = (template.projectFields ?? []).flatMap((item) => {
    const formula = fieldDefinitions.find(
      (candidate) => candidate.scope === "project" && candidate.id === item.fieldId,
    )?.formula;
    return formula ? [{ fieldId: item.fieldId, formula: structuredClone(formula) }] : [];
  });
  return [...monthly, ...project];
}
