import type { KkvState, ProjectFieldDefinition } from "../domain/types";
import { monthlyFieldsForProject, projectFieldsForProject } from "../domain/metadata";

export function formulaTargetFieldsForProject(
  state: KkvState,
  projectId: string,
): ProjectFieldDefinition[] {
  return [
    ...projectFieldsForProject(state, projectId),
    ...monthlyFieldsForProject(state, projectId),
  ];
}

export function resolveProjectFormulaTargetId(
  state: KkvState,
  projectId: string,
  preferredFieldId?: string,
): string {
  const fields = formulaTargetFieldsForProject(state, projectId);
  if (preferredFieldId && fields.some((field) => field.id === preferredFieldId)) {
    return preferredFieldId;
  }
  return fields.find((field) => field.inputMode === "formula")?.id ?? fields[0]?.id ?? "";
}
