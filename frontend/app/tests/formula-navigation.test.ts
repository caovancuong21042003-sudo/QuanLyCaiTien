import { describe, expect, it } from "vitest";
import type { ProjectFieldDefinition } from "../domain/types";
import { createSeedState } from "../data/seed";
import {
  formulaTargetFieldsForProject,
  resolveProjectFormulaTargetId,
} from "../formula/formula-navigation";

describe("formula navigation", () => {
  it("keeps the field id from the URL even when its code is different", () => {
    const state = createSeedState();
    const project = state.projects[0];
    const privateField: ProjectFieldDefinition = {
      id: "private-field-id",
      code: "privateFieldCode",
      ownerType: "project",
      ownerId: project.id,
      label: "Chỉ tiêu riêng",
      scope: "project",
      columnType: "standalone",
      inputMode: "formula",
      semanticType: "Number",
      displayMode: "number",
      rowIndex: 1,
      sortOrder: 999,
    };
    state.fieldDefinitions.push(privateField);

    expect(resolveProjectFormulaTargetId(state, project.id, privateField.id)).toBe(privateField.id);
    expect(resolveProjectFormulaTargetId(state, project.id, privateField.code)).not.toBe(
      privateField.id,
    );
  });

  it("does not retain a private field when switching to another project", () => {
    const state = createSeedState();
    const [firstProject, secondProject] = state.projects;
    const privateField: ProjectFieldDefinition = {
      id: "first-project-only-field",
      code: "firstProjectOnlyField",
      ownerType: "project",
      ownerId: firstProject.id,
      label: "Trường riêng dự án đầu",
      scope: "monthly",
      columnType: "standalone",
      inputMode: "formula",
      semanticType: "Number",
      displayMode: "number",
      rowIndex: 1,
      sortOrder: 999,
    };
    state.fieldDefinitions.push(privateField);

    const resolved = resolveProjectFormulaTargetId(state, secondProject.id, privateField.id);
    const secondProjectFieldIds = formulaTargetFieldsForProject(state, secondProject.id).map(
      (field) => field.id,
    );

    expect(resolved).not.toBe(privateField.id);
    expect(resolved).not.toBe("");
    expect(secondProjectFieldIds).toContain(resolved);
  });
});
