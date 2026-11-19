import type { ProjectMonthlyLayout } from "./types";

const orderedRows = (layout: ProjectMonthlyLayout) =>
  [...layout.rows].sort((first, second) => first.sortOrder - second.sortOrder);

const orderedPlacements = (layout: ProjectMonthlyLayout, rowId: string) =>
  layout.placements
    .filter((placement) => placement.rowId === rowId)
    .sort((first, second) => first.sortOrder - second.sortOrder);

export function moveMonthlyField(
  layout: ProjectMonthlyLayout,
  fieldId: string,
  rowId: string,
  beforeFieldId?: string,
): ProjectMonthlyLayout {
  const moving = layout.placements.find((placement) => placement.fieldId === fieldId);
  if (!moving || !layout.rows.some((row) => row.id === rowId)) return layout;

  const remaining = layout.placements.filter((placement) => placement.fieldId !== fieldId);
  const targetItems = remaining
    .filter((placement) => placement.rowId === rowId)
    .sort((first, second) => first.sortOrder - second.sortOrder);
  const beforeIndex = beforeFieldId
    ? targetItems.findIndex((placement) => placement.fieldId === beforeFieldId)
    : -1;
  targetItems.splice(beforeIndex < 0 ? targetItems.length : beforeIndex, 0, {
    ...moving,
    rowId,
  });

  const targetIds = new Set(targetItems.map((placement) => placement.fieldId));
  return {
    ...layout,
    placements: [
      ...remaining.filter((placement) => !targetIds.has(placement.fieldId)),
      ...targetItems.map((placement, index) => ({
        ...placement,
        sortOrder: (index + 1) * 10,
      })),
    ],
  };
}

export function moveMonthlyRow(
  layout: ProjectMonthlyLayout,
  rowId: string,
  beforeRowId: string,
): ProjectMonthlyLayout {
  const moving = layout.rows.find((row) => row.id === rowId);
  if (!moving || rowId === beforeRowId) return layout;

  const remaining = orderedRows(layout).filter((row) => row.id !== rowId);
  const beforeIndex = remaining.findIndex((row) => row.id === beforeRowId);
  remaining.splice(beforeIndex < 0 ? remaining.length : beforeIndex, 0, moving);
  return {
    ...layout,
    rows: remaining.map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 })),
  };
}

export function addMonthlyRow(layout: ProjectMonthlyLayout, rowId: string): ProjectMonthlyLayout {
  if (layout.rows.some((row) => row.id === rowId)) return layout;
  return {
    ...layout,
    rows: [
      ...layout.rows,
      {
        id: rowId,
        sortOrder: Math.max(0, ...layout.rows.map((row) => row.sortOrder)) + 10,
      },
    ],
  };
}

export function deleteEmptyMonthlyRow(
  layout: ProjectMonthlyLayout,
  rowId: string,
): ProjectMonthlyLayout {
  if (layout.rows.length <= 1 || layout.placements.some((placement) => placement.rowId === rowId))
    return layout;
  return { ...layout, rows: layout.rows.filter((row) => row.id !== rowId) };
}

export function fieldsInMonthlyRow(layout: ProjectMonthlyLayout, rowId: string) {
  return orderedPlacements(layout, rowId).map((placement) => placement.fieldId);
}
