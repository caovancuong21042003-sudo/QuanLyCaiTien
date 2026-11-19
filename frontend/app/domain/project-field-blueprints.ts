import { binary, ref } from "../formula/ast";
import type { ProjectFieldDefinition } from "./types";

/**
 * Danh mục kỹ thuật nội bộ dùng để tạo trường thật cho từng dự án.
 * Các phần tử này không được lưu trực tiếp như trường dùng chung trong KkvState.
 */
export const PROJECT_FIELD_BLUEPRINTS: ProjectFieldDefinition[] = [
  projectField("baselineCycle", "Hiện trạng", "Number", "number", "manual", 10),
  projectField("targetCycle", "Mục tiêu đạt được", "Number", "number", "manual", 20),
  projectField("goalNote", "Ghi chú / Lý do đặt mục tiêu", "Text", "richText", "manual", 30),
  projectField("plannedVolume", "Sản lượng tháng", "Number", "number", "manual", 40),
  projectField("referenceVolume", "Sản lượng tham chiếu", "Number", "number", "manual", 45),
  projectField("laborCost", "Đơn giá USD", "Number", "number", "manual", 50),
  projectField("referenceUnitPrice", "Đơn giá tham chiếu", "Number", "number", "manual", 55),
  {
    ...projectField("budget", "Vốn đầu tư cần thiết USD", "Number", "number", "manual", 60),
    suffix: "USD",
    displayPrecision: 2,
  },
  {
    ...projectField("targetMonthlyReduction", "Dự kiến giảm", "Number", "number", "manual", 70),
    parentId: "g-target-effect",
    columnType: "child",
  },
  {
    ...projectField("targetMonthlySaving", "Giảm USD", "Number", "number", "formula", 80),
    suffix: "USD",
    displayPrecision: 2,
    parentId: "g-target-effect",
    columnType: "child",
    rowIndex: 3,
    formula: {
      id: "formula-target-saving",
      ast: binary("*", ref("targetMonthlyReduction"), ref("laborCost")),
      businessExpression: "[Dự kiến giảm] × [Đơn giá USD]",
      internalExpression: "[Dự kiến giảm] × [Đơn giá USD]",
    },
  },
  projectField("difficulty", "Độ khó", "Text", "badge", "manual", 90),
  projectField("responsiblePerson", "Phụ trách", "Text", "text", "manual", 100),
];

function projectField(
  code: string,
  label: string,
  semanticType: ProjectFieldDefinition["semanticType"],
  displayMode: ProjectFieldDefinition["displayMode"],
  inputMode: ProjectFieldDefinition["inputMode"],
  sortOrder: number,
): ProjectFieldDefinition {
  return {
    // `id` là khóa liên kết; `code` chỉ là mã kỹ thuật ẩn phục vụ import/debug.
    id: code,
    code,
    label,
    scope: "project",
    ownerType: "library",
    columnType: "standalone",
    semanticType,
    displayMode,
    inputMode,
    rowIndex: 2,
    sortOrder,
  };
}
