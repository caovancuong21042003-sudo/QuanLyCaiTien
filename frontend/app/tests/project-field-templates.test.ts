import { describe, expect, it } from "vitest";
import { createSeedState, CURRENT_SCHEMA_VERSION } from "../data/seed";
import {
  baseFormulaForProject,
  effectiveProjectSummaryColumn,
  fieldDefinitionForProject,
  monthlyFieldsForProject,
  projectFieldsForProject,
} from "../domain/metadata";
import type { ProjectFieldDefinition } from "../domain/types";
import { migrateState } from "../repositories/local-storage-repository";

describe("kế thừa cấu hình theo mẫu", () => {
  it("chỉ lưu một bộ định nghĩa trường dùng chung thay vì clone theo dự án", () => {
    const state = createSeedState();
    const projectFields = state.fieldDefinitions.filter((field) => field.scope === "project");

    expect(projectFields).toHaveLength(new Set(projectFields.map((field) => field.id)).size);
    expect(projectFields.every((field) => field.ownerType === "library")).toBe(true);
  });

  it("dự án nhận trực tiếp danh sách trường thông tin từ mẫu", () => {
    const state = createSeedState();
    const project = state.projects[0];
    state.projectFieldConfigs = state.projectFieldConfigs.filter(
      (config) => config.projectId !== project.id,
    );
    const template = state.projectFieldTemplates.find((item) => item.id === project.templateId)!;

    expect(projectFieldsForProject(state, project.id).map((field) => field.id)).toEqual(
      template.projectFields?.filter((item) => item.visible !== false).map((item) => item.fieldId),
    );
  });

  it("sửa tên trong mẫu truyền xuống dự án chưa tùy chỉnh", () => {
    const state = createSeedState();
    const project = state.projects[0];
    state.projectFieldConfigs = state.projectFieldConfigs.filter(
      (config) => config.projectId !== project.id,
    );
    const template = state.projectFieldTemplates.find((item) => item.id === project.templateId)!;
    const item = template.projectFields![0];
    item.displayLabel = "Tên mới từ mẫu";

    expect(
      projectFieldsForProject(state, project.id).find((field) => field.id === item.fieldId)?.label,
    ).toBe("Tên mới từ mẫu");
  });

  it("override chỉ ảnh hưởng đúng một dự án và có thể xóa để quay lại mẫu", () => {
    const state = createSeedState();
    const first = state.projects[0];
    const second = state.projects[1];
    second.templateId = first.templateId;
    state.projectFieldConfigs = state.projectFieldConfigs.filter(
      (config) => config.projectId !== first.id && config.projectId !== second.id,
    );
    const template = state.projectFieldTemplates.find((item) => item.id === first.templateId)!;
    const fieldId = template.projectFields![0].fieldId;
    const templateLabel = template.projectFields![0].displayLabel;

    state.projectFieldConfigs.push({
      projectId: first.id,
      fieldId,
      displayLabel: "Tên riêng của dự án",
    });

    expect(
      projectFieldsForProject(state, first.id).find((field) => field.id === fieldId)?.label,
    ).toBe("Tên riêng của dự án");
    expect(
      projectFieldsForProject(state, second.id).find((field) => field.id === fieldId)?.label,
    ).toBe(templateLabel);

    state.projectFieldConfigs = state.projectFieldConfigs.filter(
      (config) => !(config.projectId === first.id && config.fieldId === fieldId),
    );
    expect(
      projectFieldsForProject(state, first.id).find((field) => field.id === fieldId)?.label,
    ).toBe(templateLabel);
  });

  it("ánh xạ cột tổng hợp kế thừa mẫu và cho phép dự án chủ động bỏ ánh xạ", () => {
    const state = createSeedState();
    const project = state.projects[0];
    state.projectFieldConfigs = state.projectFieldConfigs.filter(
      (config) => config.projectId !== project.id,
    );
    const template = state.projectFieldTemplates.find((item) => item.id === project.templateId)!;
    const item = template.projectFields!.find((field) => field.summaryProjectColumnId)!;

    expect(effectiveProjectSummaryColumn(state, project.id, item.fieldId)).toBe(
      item.summaryProjectColumnId,
    );

    state.projectFieldConfigs.push({
      projectId: project.id,
      fieldId: item.fieldId,
      summaryProjectColumnId: null,
    });
    expect(effectiveProjectSummaryColumn(state, project.id, item.fieldId)).toBeUndefined();
  });

  it("danh sách trường tháng kế thừa trực tiếp từ mẫu", () => {
    const state = createSeedState();
    const project = state.projects[0];
    state.projectMonthlyFieldConfigs = state.projectMonthlyFieldConfigs.filter(
      (config) => config.projectId !== project.id,
    );
    const template = state.projectFieldTemplates.find((item) => item.id === project.templateId)!;

    expect(monthlyFieldsForProject(state, project.id).map((field) => field.id)).toEqual(
      [...template.monthlyLayout.rows]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((row) =>
          template.monthlyLayout.placements
            .filter((placement) => placement.rowId === row.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((placement) => placement.fieldId),
        ),
    );
  });

  it("trường riêng chỉ xuất hiện trong dự án sở hữu", () => {
    const state = createSeedState();
    const owner = state.projects[0];
    const other = state.projects[1];
    const privateField: ProjectFieldDefinition = {
      id: "private-field",
      code: "privateField",
      label: "Chỉ tiêu riêng",
      scope: "project",
      ownerType: "project",
      ownerId: owner.id,
      columnType: "standalone",
      semanticType: "Number",
      displayMode: "number",
      inputMode: "manual",
      rowIndex: 1,
      sortOrder: 999,
    };
    state.fieldDefinitions.push(privateField);

    expect(
      projectFieldsForProject(state, owner.id).some((field) => field.id === privateField.id),
    ).toBe(true);
    expect(
      projectFieldsForProject(state, other.id).some((field) => field.id === privateField.id),
    ).toBe(false);
  });

  it("công thức mẫu được phân giải theo dự án", () => {
    const state = createSeedState();
    const project = state.projects.find((item) => {
      const template = state.projectFieldTemplates.find(
        (candidate) => candidate.id === item.templateId,
      );
      return template?.formulas?.some((formula) => formula.fieldId === "savingUsd");
    })!;
    const field = fieldDefinitionForProject(state, project.id, "savingUsd");

    expect(baseFormulaForProject(state, project.id, field, "plan")).toBeDefined();
  });

  it("schema cũ được reset thẳng thay vì chạy migration tương thích", () => {
    const state = createSeedState();
    const migrated = migrateState({
      ...state,
      schemaVersion: CURRENT_SCHEMA_VERSION - 1,
      projects: [],
    });

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.projects.length).toBeGreaterThan(0);
  });
});
