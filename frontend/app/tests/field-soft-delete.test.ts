import { describe, expect, it } from "vitest";
import { createSeedState } from "../data/seed";
import { dependentFormulaLabels } from "../domain/field-deletion";
import {
  fieldDefinitionForProject,
  monthlyFieldDefinitionsForProject,
  projectFieldDefinitionsForProject,
} from "../domain/metadata";
import type { ProjectFieldDefinition } from "../domain/types";
import { ref } from "../formula/ast";

const privateField = (
  projectId: string,
  id: string,
  scope: ProjectFieldDefinition["scope"],
): ProjectFieldDefinition => ({
  id,
  code: id,
  label: id,
  scope,
  ownerType: "project",
  ownerId: projectId,
  columnType: "standalone",
  semanticType: "Number",
  displayMode: "number",
  inputMode: "manual",
  rowIndex: 1,
  sortOrder: 999,
});

describe("xóa mềm trường riêng của dự án", () => {
  it("ẩn trường đã xóa khỏi các danh sách nghiệp vụ nhưng vẫn giữ định nghĩa", () => {
    const state = createSeedState();
    const projectId = state.projects[0].id;
    const projectField = {
      ...privateField(projectId, "private-project", "project"),
      deletedAt: "now",
    };
    const monthlyField = {
      ...privateField(projectId, "private-monthly", "monthly"),
      deletedAt: "now",
    };
    state.fieldDefinitions.push(projectField, monthlyField);

    expect(projectFieldDefinitionsForProject(state, projectId)).not.toContainEqual(projectField);
    expect(monthlyFieldDefinitionsForProject(state, projectId)).not.toContainEqual(monthlyField);
    expect(fieldDefinitionForProject(state, projectId, projectField.id)).toBeUndefined();
    expect(state.fieldDefinitions).toContainEqual(projectField);
    expect(state.fieldDefinitions).toContainEqual(monthlyField);
  });

  it("phát hiện công thức khác còn tham chiếu trước khi cho xóa", () => {
    const state = createSeedState();
    const projectId = state.projects[0].id;
    const source = privateField(projectId, "private-source", "project");
    const target = {
      ...privateField(projectId, "private-target", "project"),
      inputMode: "formula" as const,
      formula: {
        id: "formula-target",
        ast: ref(source.id),
        businessExpression: "[Nguồn]",
        internalExpression: "[private-source]",
      },
    };
    state.fieldDefinitions.push(source, target);

    expect(dependentFormulaLabels(state, source.id, projectId)).toContain(target.label);
    expect(dependentFormulaLabels(state, target.id, projectId)).not.toContain(target.label);
  });
});
