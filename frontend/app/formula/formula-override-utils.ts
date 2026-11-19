import type { FormulaOverride } from "../domain/types";

function sameCoverage(first: FormulaOverride, second: FormulaOverride) {
  return (
    first.fieldId === second.fieldId &&
    first.columnId === second.columnId &&
    first.year === second.year &&
    first.projectId === second.projectId
  );
}

/**
 * Thay thế đúng phần tháng bị ghi đè và giữ nguyên các tháng còn lại của công thức cũ.
 * Khi sửa trực tiếp một override, override đó được thay toàn bộ thay vì tự tách chính nó.
 */
export function replaceFormulaOverrideCoverage(
  existing: FormulaOverride[],
  replacements: FormulaOverride[],
  editingOverrideId?: string | null,
): FormulaOverride[] {
  const preserved = existing.flatMap((current) => {
    if (editingOverrideId && current.id === editingOverrideId) return [];

    const replacedMonths = new Set(
      replacements
        .filter((replacement) => sameCoverage(current, replacement))
        .flatMap((replacement) => replacement.months),
    );
    if (!replacedMonths.size) return [current];

    const remainingMonths = current.months
      .filter((month) => !replacedMonths.has(month))
      .sort((first, second) => first - second);
    return remainingMonths.length ? [{ ...current, months: remainingMonths }] : [];
  });

  return [...preserved, ...replacements];
}
