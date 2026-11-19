import type {
  ColumnGroupDefinition,
  KkvState,
  NumericValue,
  ProjectFieldDefinition,
  ProjectMonthlyLayout,
  ProjectMonthlyFieldConfig,
} from "./types";
import { progressPercent } from "./field-behavior";
import { isLibraryField, isProjectOwnedField, isSystemField } from "./field-ownership";

type ProjectColumnItem = Pick<
  ProjectFieldDefinition,
  "id" | "code" | "label" | "parentId" | "columnType" | "sortOrder"
> & { scope?: ProjectFieldDefinition["scope"] };

export type ProjectFieldColumnNode<TField extends ProjectColumnItem = ProjectFieldDefinition> =
  | {
      kind: "field";
      sortOrder: number;
      field: TField;
    }
  | {
      kind: "group";
      sortOrder: number;
      group: ColumnGroupDefinition;
      children: TField[];
    };

/**
 * Dựng cấu trúc cột thông tin dự án theo hai cấp: mục gốc và field con trong nhóm.
 * Đây là nguồn thứ tự dùng chung cho màn cấu hình và bảng tổng hợp.
 */
export function buildProjectFieldColumns<TField extends ProjectColumnItem>(
  fields: TField[],
  groups: ColumnGroupDefinition[],
  options?: { includeEmptyGroups?: boolean },
): ProjectFieldColumnNode<TField>[] {
  const projectFields = fields.filter((field) => !field.scope || field.scope === "project");
  const groupIds = new Set(groups.map((group) => group.id));
  const rootFields = projectFields.filter(
    (field) =>
      field.columnType === "standalone" || !field.parentId || !groupIds.has(field.parentId),
  );
  const groupNodes: ProjectFieldColumnNode<TField>[] = groups
    .map((group) => ({
      kind: "group" as const,
      sortOrder: group.sortOrder,
      group,
      children: projectFields
        .filter((field) => field.columnType === "child" && field.parentId === group.id)
        .sort((first, second) => first.sortOrder - second.sortOrder),
    }))
    .filter((node) => options?.includeEmptyGroups || node.children.length > 0);

  return [
    ...rootFields.map((field) => ({
      kind: "field" as const,
      sortOrder: field.sortOrder,
      field,
    })),
    ...groupNodes,
  ].sort(
    (first, second) =>
      first.sortOrder - second.sortOrder ||
      (first.kind === "field" ? first.field.label : first.group.label).localeCompare(
        second.kind === "field" ? second.field.label : second.group.label,
        "vi",
      ),
  );
}

export const projectFieldDefinitionsForProject = (state: KkvState, projectId: string) =>
  state.fieldDefinitions
    .filter((field) => {
      if (field.deletedAt) return false;
      if (field.scope !== "project") return false;
      if (isProjectOwnedField(field, projectId)) return true;
      if (!isLibraryField(field)) return false;
      const template = projectTemplateForProject(state, projectId);
      return Boolean(
        template?.projectFields?.some((item) => item.fieldId === field.id) ||
        projectFieldConfig(state, projectId, field.id)?.visible,
      );
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

/** Phân giải field theo ngữ cảnh dự án; field tháng/lịch vẫn là định nghĩa dùng chung. */
export function fieldDefinitionForProject(state: KkvState, projectId: string, fieldId: string) {
  return (
    state.fieldDefinitions.find(
      (field) => field.id === fieldId && !field.deletedAt && isProjectOwnedField(field, projectId),
    ) ??
    state.fieldDefinitions.find(
      (field) =>
        field.id === fieldId && !field.deletedAt && (isLibraryField(field) || isSystemField(field)),
    )
  );
}

export const projectFieldConfig = (state: KkvState, projectId: string, fieldId: string) =>
  state.projectFieldConfigs.find(
    (config) => config.projectId === projectId && config.fieldId === fieldId,
  );

export function effectiveProjectField(
  state: KkvState,
  projectId: string,
  field: ProjectFieldDefinition,
): ProjectFieldDefinition {
  if (field.scope !== "project") return field;
  const templateItem = projectTemplateForProject(state, projectId)?.projectFields?.find(
    (item) => item.fieldId === field.id,
  );
  const config = projectFieldConfig(state, projectId, field.id);
  return {
    ...field,
    label: config?.displayLabel?.trim() || templateItem?.displayLabel?.trim() || field.label,
    suffix: config?.displaySuffix?.trim() || templateItem?.displaySuffix?.trim() || field.suffix,
    sortOrder: config?.sortOrder ?? templateItem?.sortOrder ?? field.sortOrder,
  };
}

export function effectiveProjectSummaryColumn(state: KkvState, projectId: string, fieldId: string) {
  const config = projectFieldConfig(state, projectId, fieldId);
  if (config && Object.prototype.hasOwnProperty.call(config, "summaryProjectColumnId")) {
    return config.summaryProjectColumnId || undefined;
  }
  return (
    projectTemplateForProject(state, projectId)?.projectFields?.find(
      (item) => item.fieldId === fieldId,
    )?.summaryProjectColumnId || undefined
  );
}

export function projectFieldsForProject(state: KkvState, projectId: string) {
  return projectFieldDefinitionsForProject(state, projectId)
    .filter((field) => {
      const config = projectFieldConfig(state, projectId, field.id);
      const templateItem = projectTemplateForProject(state, projectId)?.projectFields?.find(
        (item) => item.fieldId === field.id,
      );
      const inheritedVisible = isProjectOwnedField(field, projectId)
        ? true
        : templateItem?.visible !== false;
      return config?.visible ?? inheritedVisible;
    })
    .map((field) => effectiveProjectField(state, projectId, field))
    .sort((first, second) => {
      const firstOrder = projectFieldConfig(state, projectId, first.id)?.sortOrder;
      const secondOrder = projectFieldConfig(state, projectId, second.id)?.sortOrder;
      return (firstOrder ?? first.sortOrder) - (secondOrder ?? second.sortOrder);
    });
}

export function projectFieldForSummaryColumn(
  state: KkvState,
  projectId: string,
  summaryProjectColumnId: string,
) {
  const field = projectFieldsForProject(state, projectId).find(
    (candidate) =>
      effectiveProjectSummaryColumn(state, projectId, candidate.id) === summaryProjectColumnId,
  );
  return field;
}

export const monthlyFields = (state: KkvState) =>
  state.fieldDefinitions
    .filter((field) => field.scope === "monthly" && !field.deletedAt && isLibraryField(field))
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const monthlyFieldDefinitionsForProject = (state: KkvState, projectId: string) =>
  state.fieldDefinitions
    .filter((field) => {
      if (field.deletedAt) return false;
      if (field.scope !== "monthly") return false;
      if (isProjectOwnedField(field, projectId)) return true;
      if (!isLibraryField(field)) return false;
      const inherited = projectTemplateForProject(state, projectId)?.fields.some(
        (item) => item.fieldId === field.id,
      );
      const explicitlyEnabled = projectMonthlyFieldConfig(state, projectId, field.id)?.visible;
      return Boolean(inherited || explicitlyEnabled);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

/** Lấy công thức theo cột; formula không gắn cột được dùng như quy tắc chung của field. */
export function fieldFormulaForColumn(field: ProjectFieldDefinition | undefined, columnId: string) {
  if (!field) return undefined;
  if (field.scope !== "monthly") return field.formula;
  if (field.formula) {
    if (field.formula.columnId && field.formula.columnId !== columnId) return undefined;
    return field.formula;
  }
  return field.columnFormulas?.find((formula) => formula.columnId === columnId);
}

export function projectTemplateForProject(state: KkvState, projectId: string) {
  const templateId = state.projects.find((project) => project.id === projectId)?.templateId;
  return templateId
    ? state.projectFieldTemplates.find((template) => template.id === templateId)
    : undefined;
}

export function templateFormulaForProject(
  state: KkvState,
  projectId: string,
  fieldId: string,
  columnId: string,
) {
  const template = projectTemplateForProject(state, projectId);
  return template?.formulas?.find(
    (item) =>
      item.fieldId === fieldId &&
      (item.columnId ?? item.formula.columnId) ===
        (state.fieldDefinitions.find(
          (field) =>
            field.id === fieldId &&
            (field.scope !== "project" ||
              isLibraryField(field) ||
              isProjectOwnedField(field, projectId)),
        )?.scope === "monthly"
          ? columnId
          : undefined),
  )?.formula;
}

export const templateFormulaKey = (fieldId: string, columnId?: string) =>
  `${fieldId}|${columnId ?? ""}`;

/** Công thức nền của dự án: ưu tiên mẫu đang gắn, sau đó dùng công thức trên định nghĩa field. */
export function baseFormulaForProject(
  state: KkvState,
  projectId: string,
  field: ProjectFieldDefinition | undefined,
  columnId: string,
) {
  if (!field) return undefined;
  const template = projectTemplateForProject(state, projectId);
  if (
    template?.disabledFormulaKeys?.includes(
      templateFormulaKey(field.id, field.scope === "monthly" ? columnId : undefined),
    )
  )
    return undefined;
  return (
    templateFormulaForProject(state, projectId, field.id, columnId) ??
    fieldFormulaForColumn(field, columnId)
  );
}

export const calendarFields = (state: KkvState) =>
  state.fieldDefinitions
    .filter((field) => field.scope === "calendar")
    .sort((a, b) => a.sortOrder - b.sortOrder);
export const projectsForYear = (state: KkvState) =>
  state.projects.filter((project) => project.year === state.selectedYear);

export const monthlyColumnIdByRole = (
  state: KkvState,
  role: NonNullable<KkvState["monthlyColumns"][number]["role"]>,
) => state.monthlyColumns.find((column) => column.role === role)?.id;

export const defaultMonthlyColumnId = (state: KkvState) =>
  monthlyColumnIdByRole(state, "actual") ?? state.monthlyColumns[0]?.id ?? "";

export const annualSummaryColumn = (state: KkvState) =>
  state.summaryColumns.find((column) => column.enabled && column.role === "annual");
export const calendarValue = (
  state: KkvState,
  fieldId: string,
  month: number,
  year = state.selectedYear,
) =>
  state.calendarValues.find(
    (item) => item.fieldId === fieldId && item.year === year && item.month === month,
  )?.value ?? null;
export function projectMonthlyFieldConfig(
  state: KkvState,
  projectId: string,
  fieldId: string,
): ProjectMonthlyFieldConfig | undefined {
  return state.projectMonthlyFieldConfigs.find(
    (item) => item.projectId === projectId && item.fieldId === fieldId,
  );
}

export function effectiveMonthlySummaryMetricId(
  state: KkvState,
  projectId: string,
  fieldId: string,
): string | undefined {
  const config = projectMonthlyFieldConfig(state, projectId, fieldId);
  if (config && Object.prototype.hasOwnProperty.call(config, "summaryMetricId")) {
    return config.summaryMetricId || undefined;
  }
  return (
    projectTemplateForProject(state, projectId)?.fields.find((item) => item.fieldId === fieldId)
      ?.summaryMetricId || undefined
  );
}

/** Field thật của một dự án được dùng để cung cấp giá trị cho chỉ tiêu tổng hợp. */
export function monthlyFieldForSummaryMetric(state: KkvState, projectId: string, metricId: string) {
  return monthlyFieldsForProject(state, projectId).find(
    (field) => effectiveMonthlySummaryMetricId(state, projectId, field.id) === metricId,
  );
}

/** Adapter chỉ dành cho trình soạn công thức; metric không được lưu lẫn vào fieldDefinitions. */
export function summaryMetricAsField(
  metric: KkvState["monthlySummaryMetrics"][number],
): ProjectFieldDefinition {
  return {
    id: metric.id,
    code: metric.code,
    label: metric.label,
    scope: "monthly",
    ownerType: "system",
    columnType: "standalone",
    semanticType: metric.semanticType,
    displayMode: metric.displayMode,
    displayPrecision: metric.displayPrecision,
    inputMode: "formula",
    prefix: metric.prefix,
    suffix: metric.suffix,
    rowIndex: 1,
    sortOrder: metric.sortOrder,
  };
}

/**
 * Trả về metadata hiệu lực cho riêng một dự án mà không thay đổi field gốc.
 * Việc clone label/suffix chỉ phục vụ hiển thị; code và ID dùng trong công thức được giữ nguyên.
 */
export function effectiveMonthlyField(
  state: KkvState,
  projectId: string,
  field: ProjectFieldDefinition,
): ProjectFieldDefinition {
  const templateItem = projectTemplateForProject(state, projectId)?.fields.find(
    (item) => item.fieldId === field.id,
  );
  const config = projectMonthlyFieldConfig(state, projectId, field.id);
  return {
    ...field,
    label: config?.displayLabel?.trim() || templateItem?.displayLabel?.trim() || field.label,
    suffix: config?.displaySuffix?.trim() || templateItem?.displaySuffix?.trim() || field.suffix,
  };
}

function monthlyFieldsBeforeLayout(state: KkvState, projectId: string): ProjectFieldDefinition[] {
  return monthlyFieldDefinitionsForProject(state, projectId)
    .filter((field) => {
      const config = projectMonthlyFieldConfig(state, projectId, field.id);
      return (
        config?.visible !== false && monthlyFieldColumns(state, projectId, field.id).length > 0
      );
    })
    .map((field) => effectiveMonthlyField(state, projectId, field))
    .sort((a, b) => a.rowIndex - b.rowIndex || a.sortOrder - b.sortOrder);
}

/**
 * Trả bố cục hiệu lực. Dự án chưa tùy chỉnh được dựng trực tiếp từ mẫu/metadata hiện tại,
 * vì vậy các thay đổi của mẫu vẫn truyền xuống cho tới lần kéo thả đầu tiên.
 */
export function monthlyLayoutForProject(state: KkvState, projectId: string): ProjectMonthlyLayout {
  const fields = monthlyFieldsBeforeLayout(state, projectId);
  const visibleIds = new Set(fields.map((field) => field.id));
  const saved = state.projectMonthlyLayouts.find((layout) => layout.projectId === projectId);
  if (saved) {
    const placements = saved.placements.filter((item) => visibleIds.has(item.fieldId));
    const placedIds = new Set(placements.map((item) => item.fieldId));
    const rows = [...saved.rows].sort((a, b) => a.sortOrder - b.sortOrder);
    const fallbackRow = rows[0];

    fields.forEach((field) => {
      if (placedIds.has(field.id)) return;
      const row = fallbackRow ?? {
        id: `layout-row-${projectId}-1`,
        sortOrder: 10,
      };
      if (!rows.some((item) => item.id === row.id)) rows.push(row);
      placements.push({
        fieldId: field.id,
        rowId: row.id,
        sortOrder: Math.max(0, ...placements.map((item) => item.sortOrder)) + 10,
      });
    });

    return { projectId, rows, placements };
  }

  const templateLayout = projectTemplateForProject(state, projectId)?.monthlyLayout;
  const rows = templateLayout
    ? structuredClone(templateLayout.rows).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const placements = templateLayout
    ? structuredClone(templateLayout.placements).filter((item) => visibleIds.has(item.fieldId))
    : [];
  const placedIds = new Set(placements.map((item) => item.fieldId));

  if (fields.length > 0 && rows.length === 0) {
    rows.push({ id: `layout-row-${projectId}-1`, sortOrder: 10 });
  }

  const fallbackRow = rows[0];
  fields.forEach((field) => {
    if (!fallbackRow || placedIds.has(field.id)) return;
    placements.push({
      fieldId: field.id,
      rowId: fallbackRow.id,
      sortOrder: Math.max(0, ...placements.map((item) => item.sortOrder)) + 10,
    });
  });

  return {
    projectId,
    rows,
    placements,
  };
}

export function monthlyFieldColumns(state: KkvState, projectId: string, fieldId: string) {
  const config = projectMonthlyFieldConfig(state, projectId, fieldId);
  const templateItem = projectTemplateForProject(state, projectId)?.fields.find(
    (item) => item.fieldId === fieldId,
  );
  const allowed = config?.allowedColumnIds ?? templateItem?.allowedColumnIds;
  return [...state.monthlyColumns]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((column) => !allowed || allowed.includes(column.id));
}

export function monthlyFieldsForProject(
  state: KkvState,
  projectId: string,
): ProjectFieldDefinition[] {
  const fields = monthlyFieldsBeforeLayout(state, projectId);
  const layout = monthlyLayoutForProject(state, projectId);
  const rowOrder = new Map(
    [...layout.rows]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row, index) => [row.id, index + 1]),
  );
  const placementByField = new Map(layout.placements.map((item) => [item.fieldId, item]));

  return fields
    .map((field) => {
      const placement = placementByField.get(field.id);
      return {
        ...field,
        rowIndex: placement ? (rowOrder.get(placement.rowId) ?? field.rowIndex) : field.rowIndex,
        sortOrder: placement?.sortOrder ?? field.sortOrder,
      };
    })
    .sort((a, b) => a.rowIndex - b.rowIndex || a.sortOrder - b.sortOrder);
}

export function monthlyFieldAllowsColumn(
  state: KkvState,
  projectId: string,
  fieldId: string,
  columnId: string,
) {
  return monthlyFieldColumns(state, projectId, fieldId).some((column) => column.id === columnId);
}

export function monthlyFieldHasFormula(state: KkvState, projectId: string, fieldId: string) {
  const field = fieldDefinitionForProject(state, projectId, fieldId);
  return Boolean(
    field?.inputMode === "formula" ||
    field?.formula ||
    field?.columnFormulas?.length ||
    state.formulaOverrides.some(
      (override) =>
        override.fieldId === fieldId && (!override.projectId || override.projectId === projectId),
    ) ||
    state.projectFormulaOverrides.some(
      (override) => override.projectId === projectId && override.fieldId === fieldId,
    ),
  );
}

export function richTextToPlainText(value: unknown): string {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  const node = value as { type?: string; text?: string; content?: unknown[] };
  if (node.type === "text") return node.text ?? "";
  const separator = ["doc", "bulletList", "orderedList", "listItem", "blockquote"].includes(
    node.type ?? "",
  )
    ? " "
    : "";
  return (node.content ?? []).map(richTextToPlainText).join(separator).replace(/\s+/g, " ").trim();
}

export function isNumericValue(value: unknown): value is NumericValue {
  return Boolean(value && typeof value === "object" && "numericValue" in value);
}

export function numericValueNotes(value: unknown): Pick<NumericValue, "leftNote" | "rightNote"> {
  return isNumericValue(value) ? { leftNote: value.leftNote, rightNote: value.rightNote } : {};
}

export function formatFieldValue(
  value: unknown,
  field: Pick<
    ProjectFieldDefinition,
    "semanticType" | "displayMode" | "displayPrecision" | "suffix" | "prefix"
  >,
  notes?: Pick<NumericValue, "leftNote" | "rightNote">,
): string {
  if (value == null) return "—";
  if (field.displayMode === "richText") {
    const text = richTextToPlainText(value);
    return text ? (text.length > 80 ? `${text.slice(0, 77)}…` : text) : "—";
  }
  if (field.semanticType === "Boolean")
    return value === true ? "Có" : value === false ? "Không" : "—";
  if (field.semanticType === "Date") {
    const text = String(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
  }
  const numeric = typeof value === "number";
  const hasProjectDecoration = notes?.leftNote !== undefined || notes?.rightNote !== undefined;
  const defaultPrecision = field.displayMode === "progress" ? 2 : 4;
  const precision = Math.max(0, Math.min(10, field.displayPrecision ?? defaultPrecision));
  let formatted: string;
  if (field.displayMode === "progress" && numeric)
    formatted = `${new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: precision,
    }).format(progressPercent(value, field))}%`;
  else if (numeric)
    formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: precision }).format(value);
  else return String(value);

  const left = notes?.leftNote ?? field.prefix;
  const right =
    notes?.rightNote ??
    (hasProjectDecoration || field.displayMode === "number" ? field.suffix : undefined);
  const valueWithSuffix =
    right === "%"
      ? `${formatted}%`
      : [formatted, right].filter((part) => part !== undefined && part !== "").join(" ");
  return [left, valueWithSuffix].filter((part) => part !== undefined && part !== "").join(" ");
}
