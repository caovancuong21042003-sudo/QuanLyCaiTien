import type { DisplayMode, FieldScope, ProjectFieldDefinition, SemanticType } from "./types";

export const semanticTypes: SemanticType[] = ["Number", "Boolean", "Text", "Date"];

export const isNumericSemanticType = (type: SemanticType) => type === "Number";

export function displayModesForField(semanticType: SemanticType, scope: FieldScope): DisplayMode[] {
  if (semanticType === "Number") return ["number", "progress"];
  if (semanticType === "Boolean") return ["badge", "text"];
  if (semanticType === "Date") return ["date"];
  return scope === "project" ? ["text", "badge", "richText"] : ["text", "badge"];
}

export function normalizeFieldBehavior(
  field: ProjectFieldDefinition,
  semanticType = field.semanticType,
  scope = field.scope,
): ProjectFieldDefinition {
  const displayModes = displayModesForField(semanticType, scope);
  const displayMode = displayModes.includes(field.displayMode)
    ? field.displayMode
    : displayModes[0];
  return {
    ...field,
    scope,
    columnType: scope === "project" ? field.columnType : "standalone",
    parentId: scope === "project" && field.columnType === "child" ? field.parentId : undefined,
    semanticType,
    displayMode,
    inputMode: displayMode === "richText" ? "manual" : field.inputMode,
    displayPrecision: isNumericSemanticType(semanticType) ? field.displayPrecision : undefined,
    prefix: isNumericSemanticType(semanticType) ? field.prefix : undefined,
    suffix: isNumericSemanticType(semanticType) ? field.suffix : undefined,
  };
}

export function editorValue(value: unknown, field: ProjectFieldDefinition): unknown {
  if (value == null) return "";
  return value;
}

export function parseEditorValue(value: unknown, field: ProjectFieldDefinition): unknown {
  if (value === "" || value == null) return null;
  if (field.semanticType === "Boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  }
  if (field.semanticType === "Number") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric;
  }
  return String(value);
}

export function progressPercent(
  value: unknown,
  field: Pick<ProjectFieldDefinition, "semanticType">,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function fieldInputWidth(field: ProjectFieldDefinition): number {
  if (field.semanticType === "Date") return 142;
  if (field.semanticType === "Text") return 160;
  if (field.semanticType === "Boolean") return 118;
  return 108;
}
