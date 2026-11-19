import type { ProjectFieldDefinition } from "../../domain/types";
import { inputModeLabel } from "../../domain/field-labels";

export function sourceLabel(field: ProjectFieldDefinition): string {
  return inputModeLabel(field.inputMode);
}
