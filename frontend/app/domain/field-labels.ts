import type {
  DisplayMode,
  FieldScope,
  InputMode,
  ProjectFieldDefinition,
  SemanticType,
} from "./types";
import type { FormulaErrorCode } from "./calculation-result";

const scopeLabels: Record<FieldScope, string> = {
  project: "Thông tin dự án",
  monthly: "Dữ liệu theo tháng",
  calendar: "Dữ liệu lịch",
};

const semanticTypeLabels: Record<SemanticType, string> = {
  Number: "Số",
  Boolean: "Đúng / Sai",
  Text: "Văn bản",
  Date: "Ngày",
};

const displayModeLabels: Record<DisplayMode, string> = {
  number: "Số",
  text: "Văn bản",
  richText: "Văn bản định dạng",
  date: "Ngày",
  badge: "Nhãn trạng thái",
  progress: "Tiến độ",
};

const inputModeLabels: Record<InputMode, string> = {
  manual: "Nhập tay",
  fixed: "Giá trị cố định",
  formula: "Tự tính bằng công thức",
};

export const fieldScopeLabel = (scope: FieldScope) => scopeLabels[scope];
export const semanticTypeLabel = (type: SemanticType) => semanticTypeLabels[type];
export const displayModeLabel = (mode: DisplayMode) => displayModeLabels[mode];
export const inputModeLabel = (mode: InputMode) => inputModeLabels[mode];
export const columnTypeLabel = (type: ProjectFieldDefinition["columnType"]) =>
  type === "child" ? "Thuộc nhóm" : "Độc lập";

const formulaErrorLabels: Record<FormulaErrorCode, string> = {
  DivideByZero: "Không thể chia cho 0",
  InvalidFormula: "Công thức không hợp lệ",
  InvalidType: "Kiểu dữ liệu không phù hợp",
  IncompatibleSeriesAxis: "Không thể tính trực tiếp giữa dữ liệu theo tháng và dữ liệu theo dự án",
  MissingField: "Không tìm thấy trường dữ liệu",
  CircularDependency: "Công thức tham chiếu vòng",
  OutOfPeriodRange: "Tháng tham chiếu nằm ngoài phạm vi",
};

export const formulaErrorLabel = (code?: FormulaErrorCode) =>
  code ? formulaErrorLabels[code] : "Không thể tính công thức";
