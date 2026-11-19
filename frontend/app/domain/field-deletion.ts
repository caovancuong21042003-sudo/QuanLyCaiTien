import { referencesInAst } from "../formula/ast-utils";
import type { KkvState } from "./types";

/**
 * Liệt kê các công thức khác còn phụ thuộc vào một field trước khi xóa mềm.
 * Công thức của chính field bị xóa không được tính là phụ thuộc vì nó sẽ được
 * giữ nguyên và hoạt động lại khi field được khôi phục.
 */
export function dependentFormulaLabels(
  state: KkvState,
  fieldId: string,
  projectId: string,
): string[] {
  const labels: string[] = [];
  const fieldLabel = (targetFieldId: string) =>
    state.fieldDefinitions.find((field) => field.id === targetFieldId)?.label ?? targetFieldId;
  const usesField = (ast: Parameters<typeof referencesInAst>[0]) =>
    referencesInAst(ast).includes(fieldId);

  state.fieldDefinitions.forEach((candidate) => {
    if (candidate.id === fieldId || candidate.deletedAt) return;
    const formulas = [candidate.formula, ...(candidate.columnFormulas ?? [])].filter(Boolean);
    if (formulas.some((formula) => usesField(formula!.ast))) {
      labels.push(candidate.label);
    }
  });

  state.projectFormulaOverrides
    .filter(
      (override) =>
        override.projectId === projectId &&
        override.fieldId !== fieldId &&
        usesField(override.formula.ast),
    )
    .forEach((override) => labels.push(fieldLabel(override.fieldId)));

  state.formulaOverrides
    .filter(
      (override) =>
        (!override.projectId || override.projectId === projectId) &&
        override.fieldId !== fieldId &&
        usesField(override.formula.ast),
    )
    .forEach((override) => labels.push(fieldLabel(override.fieldId)));

  const projectTemplateId = state.projects.find((project) => project.id === projectId)?.templateId;
  state.projectFieldTemplates
    .filter((template) => template.id === projectTemplateId)
    .flatMap((template) => template.formulas ?? [])
    .filter((item) => item.fieldId !== fieldId && usesField(item.formula.ast))
    .forEach((item) => labels.push(`${fieldLabel(item.fieldId)} (công thức mẫu)`));

  state.summaryFormulas
    .filter((item) => usesField(item.formula.ast))
    .forEach((item) => labels.push(`Công thức tổng hợp ${item.summaryId}`));

  return [...new Set(labels)];
}
