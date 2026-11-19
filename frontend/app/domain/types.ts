import type { FormulaAst } from "../formula/ast";

export type SemanticType = "Number" | "Boolean" | "Text" | "Date";
export type DisplayMode = "number" | "text" | "richText" | "date" | "badge" | "progress";
export type InputMode = "manual" | "fixed" | "formula";
export type FieldScope = "project" | "monthly" | "calendar";
export type FieldOwnerType = "library" | "project" | "system";

export interface ErrorPolicy {
  useDefaultValue: boolean;
  defaultValue?: unknown;
}

export interface FormulaDefinition {
  id: string;
  columnId?: string;
  ast: FormulaAst;
  businessExpression: string;
  internalExpression: string;
  /** Chỉ bật cho công thức đã được người dùng lưu từ editor có bảo toàn cách đặt ngoặc. */
  preserveUserParentheses?: boolean;
}

export interface ProjectFieldDefinition {
  id: string;
  /** Mã kỹ thuật tự sinh để debug/import; không dùng làm khóa liên kết. */
  code: string;
  label: string;
  scope: FieldScope;
  /** Chủ sở hữu rõ ràng: thư viện dùng cho mẫu, dự án sở hữu riêng hoặc trường hệ thống. */
  ownerType: FieldOwnerType;
  /** Chỉ có giá trị khi ownerType là project. */
  ownerId?: string;
  /** Xóa mềm chỉ áp dụng cho trường riêng của dự án; dữ liệu và công thức vẫn được giữ. */
  deletedAt?: string;
  parentId?: string;
  columnType: "standalone" | "child";
  semanticType: SemanticType;
  displayMode: DisplayMode;
  displayPrecision?: number;
  inputMode: InputMode;
  prefix?: string;
  suffix?: string;
  rowIndex: number;
  sortOrder: number;
  fixedValue?: unknown;
  /** Công thức mặc định theo từng cột của trường tháng. */
  columnFormulas?: FormulaDefinition[];
  formula?: FormulaDefinition;
  errorPolicy?: ErrorPolicy;
}

export interface NumericValue {
  numericValue: number | null;
  leftNote?: string;
  rightNote?: string;
}

export interface ProjectFieldValue {
  projectId: string;
  fieldId: string;
  value: unknown | NumericValue;
}

export interface MonthlyLayoutRow {
  id: string;
  label?: string;
  sortOrder: number;
}

export interface MonthlyFieldPlacement {
  fieldId: string;
  rowId: string;
  sortOrder: number;
}

/**
 * Bố cục bảng tháng riêng của dự án. Không có bản ghi nghĩa là dự án tiếp tục kế thừa bố cục mẫu.
 * Row dùng ID ổn định; kéo đổi vị trí chỉ thay sortOrder nên không làm hỏng quan hệ của field.
 */
export interface ProjectMonthlyLayout {
  projectId: string;
  rows: MonthlyLayoutRow[];
  placements: MonthlyFieldPlacement[];
}

export interface TemplateMonthlyLayout {
  rows: MonthlyLayoutRow[];
  placements: MonthlyFieldPlacement[];
}

/**
 * Vị trí hiển thị dùng chung trên bảng tổng hợp. Đây không phải trường dữ liệu và không tham gia
 * nhập liệu hay tính công thức; giá trị luôn được lấy từ chỉ tiêu của từng dự án qua ánh xạ.
 */
export interface SummaryProjectColumnDefinition {
  id: string;
  code: string;
  label: string;
  parentId?: string;
  columnType: "standalone" | "child";
  sortOrder: number;
  width?: number;
  enabled: boolean;
}

/**
 * Cách một chỉ tiêu thuộc dự án được trình bày và gán vào vị trí chung của bảng tổng hợp.
 * fieldId là khóa dữ liệu/công thức; summaryProjectColumnId chỉ là đích hiển thị.
 */
export interface ProjectFieldConfig {
  projectId: string;
  fieldId: string;
  /** Chỉ lưu khi dự án muốn khác mẫu; bỏ trống nghĩa là kế thừa mẫu. */
  visible?: boolean;
  /** Thứ tự riêng trong phạm vi dự án; không làm thay đổi thứ tự cột chung. */
  sortOrder?: number;
  displayLabel?: string;
  displaySuffix?: string;
  /** null nghĩa là dự án chủ động không đưa trường này lên bảng tổng hợp. */
  summaryProjectColumnId?: string | null;
}

/**
 * Ghi đè cách một field dùng chung được trình bày trong từng dự án.
 * Công thức luôn tham chiếu fieldId ổn định, không phụ thuộc mã kỹ thuật, nhãn hay dòng hiển thị.
 */
export interface ProjectMonthlyFieldConfig {
  projectId: string;
  fieldId: string;
  /** Các thuộc tính đều là override; bỏ trống nghĩa là kế thừa mẫu. */
  visible?: boolean;
  displayLabel?: string;
  displaySuffix?: string;
  allowedColumnIds?: string[];
  /** Chỉ tiêu chuẩn mà field riêng của dự án đóng góp vào trên bảng tổng hợp. */
  summaryMetricId?: string | null;
}

export interface ProjectTemplateFieldItem {
  fieldId: string;
  sortOrder?: number;
  displayLabel?: string;
  displaySuffix?: string;
  summaryProjectColumnId?: string | null;
  visible?: boolean;
}

/**
 * Một field tháng được lưu trong mẫu cấu hình. Mục này chỉ giữ cách trình bày và
 * phạm vi cột; công thức dùng chung nằm trong ProjectFieldTemplate.formulas.
 */
export interface ProjectFieldTemplateItem {
  fieldId: string;
  displayLabel?: string;
  displaySuffix?: string;
  allowedColumnIds: string[];
  /** Ánh xạ mặc định được các dự án dùng mẫu kế thừa. */
  summaryMetricId?: string | null;
}

/**
 * Trục dữ liệu chuẩn của bảng tổng hợp. Dự án có thể dùng field khác tên/công thức nhưng phải
 * ánh xạ về cùng metricId để được cộng, so sánh và vẽ biểu đồ cùng nhau.
 */
export interface MonthlySummaryMetricDefinition {
  id: string;
  code: string;
  label: string;
  semanticType: SemanticType;
  displayMode: DisplayMode;
  displayPrecision?: number;
  prefix?: string;
  suffix?: string;
  sortOrder: number;
  enabled: boolean;
}

/** Công thức được các dự án đang gắn với mẫu kế thừa trực tiếp. */
export interface ProjectTemplateFormula {
  fieldId: string;
  columnId?: string;
  formula: FormulaDefinition;
}

export interface ProjectFieldTemplate {
  id: string;
  label: string;
  description: string;
  projectFields?: ProjectTemplateFieldItem[];
  fields: ProjectFieldTemplateItem[];
  monthlyLayout: TemplateMonthlyLayout;
  formulas?: ProjectTemplateFormula[];
  /** Chặn fallback công thức nền khi mẫu chủ động để trống một trường/cột. */
  disabledFormulaKeys?: string[];
}

export interface Project {
  id: string;
  year: number;
  code: string;
  name: string;
  category: string;
  department: string;
  owner: string;
  deadline: string;
  product: string;
  description: Record<string, unknown>;
  notes: Record<string, unknown>;
  targetReason: Record<string, unknown>;
  startMonth: number;
  /** Mẫu đang được kế thừa; bố cục có thể chỉnh riêng nhưng công thức mẫu vẫn dùng chung. */
  templateId?: string;
}

export interface ColumnGroupDefinition {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
}

export interface MonthlyColumnDefinition {
  id: string;
  /** Vai trò nghiệp vụ ổn định; code và label có thể được người dùng đổi. */
  role?: "plan" | "actual";
  code: string;
  label: string;
  sortOrder: number;
}

/** Một nhóm cột được tính từ nhiều tháng, ví dụ Tổng năm hoặc 6 tháng đầu năm. */
export interface SummaryColumnDefinition {
  id: string;
  /** Vai trò nghiệp vụ ổn định; chỉ một cột được dùng làm kết quả năm trên trang dự án. */
  role?: "annual";
  code: string;
  label: string;
  months: number[];
  columnIds: string[];
  sortOrder: number;
  enabled: boolean;
}

/** Một dòng tổng hợp nhiều dự án; mỗi field có thể dùng một phép tổng hợp khác nhau. */
export interface SummaryRowDefinition {
  id: string;
  code: string;
  label: string;
  showInMonthlyColumns: boolean;
  summaryColumnIds: string[];
  sortOrder: number;
  enabled: boolean;
}

/** Công thức của một field tại cột hoặc dòng tổng hợp do người dùng tạo. */
export interface SummaryFormulaDefinition {
  id: string;
  targetKind: "column" | "row";
  summaryId: string;
  metricId: string;
  columnId: string;
  formula: FormulaDefinition;
}

export interface MonthlyValue {
  projectId: string;
  fieldId: string;
  year: number;
  month: number;
  columnId: string;
  value: unknown;
}

export interface Period {
  month: number;
  label: string;
}

export interface CalendarValue {
  fieldId: string;
  year: number;
  month: number;
  value: unknown;
}

export interface FormulaOverride {
  // Không có projectId nghĩa là quy tắc áp dụng cho mọi project trong các tháng đã chọn.
  id: string;
  projectId?: string;
  fieldId: string;
  columnId: string;
  year: number;
  months: number[];
  formula: FormulaDefinition;
}

export interface ProjectFormulaOverride {
  // Project field không có chiều tháng nên khóa override chỉ gồm project + field.
  id: string;
  projectId: string;
  fieldId: string;
  formula: FormulaDefinition;
}

export type ChartCategoryAxis = "month" | "project";
export type ChartSeriesRenderer = "column" | "line" | "area" | "scatter";
export type ChartValueAxis = "left" | "right";
export type ChartFilterScope = "followPageFilters" | "allProjects";

/**
 * Biểu đồ chỉ đọc kết quả đã được engine tính. Nó không lưu một bản sao công thức riêng,
 * nhờ vậy bảng tổng hợp và biểu đồ luôn dùng cùng một nguồn sự thật.
 */
export interface ChartSeriesDefinition {
  id: string;
  label: string;
  sourceKind: "summaryRow" | "summaryColumn" | "summaryMetric" | "monthlyField";
  summaryRowId?: string;
  summaryColumnId?: string;
  /** Chỉ dùng cho biểu đồ chi tiết một dự án. */
  fieldId?: string;
  /** Chỉ dùng cho nguồn tổng hợp nhiều dự án. */
  metricId?: string;
  columnId: string;
  /** Chỉ dùng khi trục ngang là dự án. */
  month?: number;
  renderer: ChartSeriesRenderer;
  valueAxis: ChartValueAxis;
  color: string;
  showValue: boolean;
}

export interface ChartDefinition {
  id: string;
  name: string;
  description?: string;
  dashboardScope?: "summary" | "project";
  categoryAxis: ChartCategoryAxis;
  presentation?: "cartesian" | "pie" | "donut";
  filterScope: ChartFilterScope;
  size: "half" | "full";
  height: "small" | "medium" | "large";
  orientation?: "vertical" | "horizontal" | "auto";
  categorySort?: "source" | "valueDesc" | "valueAsc";
  projectLabel?: "code" | "name" | "codeAndName";
  topN?: number;
  groupRemainder?: boolean;
  /** Chỉ ảnh hưởng các chuỗi được vẽ dạng cột. Dữ liệu cũ mặc định là cột cạnh nhau. */
  columnMode?: "grouped" | "stacked";
  series: ChartSeriesDefinition[];
  sortOrder: number;
}

export interface KkvState {
  // schemaVersion thuộc dữ liệu đã lưu và phải tăng mỗi khi có migration cấu trúc lưu trữ.
  schemaVersion: number;
  selectedYear: number;
  availableYears: number[];
  projects: Project[];
  fieldDefinitions: ProjectFieldDefinition[];
  fieldValues: ProjectFieldValue[];
  projectMonthlyLayouts: ProjectMonthlyLayout[];
  projectFieldConfigs: ProjectFieldConfig[];
  projectMonthlyFieldConfigs: ProjectMonthlyFieldConfig[];
  projectFieldTemplates: ProjectFieldTemplate[];
  monthlySummaryMetrics: MonthlySummaryMetricDefinition[];
  summaryProjectColumns: SummaryProjectColumnDefinition[];
  columnGroups: ColumnGroupDefinition[];
  monthlyColumns: MonthlyColumnDefinition[];
  summaryColumns: SummaryColumnDefinition[];
  summaryRows: SummaryRowDefinition[];
  summaryFormulas: SummaryFormulaDefinition[];
  monthlyValues: MonthlyValue[];
  calendarValues: CalendarValue[];
  periods: Period[];
  formulaOverrides: FormulaOverride[];
  projectFormulaOverrides: ProjectFormulaOverride[];
  chartDefinitions: ChartDefinition[];
}
