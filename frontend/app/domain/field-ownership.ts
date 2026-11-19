import type { ProjectFieldDefinition } from "./types";

export const isLibraryField = (field: ProjectFieldDefinition) => field.ownerType === "library";

export const isSystemField = (field: ProjectFieldDefinition) => field.ownerType === "system";

export const isProjectOwnedField = (field: ProjectFieldDefinition, projectId?: string) =>
  field.ownerType === "project" && (!projectId || field.ownerId === projectId);
