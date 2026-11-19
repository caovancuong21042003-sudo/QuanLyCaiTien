import { describe, expect, it } from "vitest";
import { createSeedState, EXCEL_2026_SOURCE_ROW_ORDER } from "../data/seed";
import { effectiveProjectSummaryColumn, projectFieldsForProject } from "../domain/metadata";
import { PROJECT_FIELD_BLUEPRINTS } from "../domain/project-field-blueprints";

describe("dữ liệu mẫu theo schema kế thừa", () => {
  it("giữ đúng số dự án lấy từ sheet Excel", () => {
    const state = createSeedState();
    expect(state.projects).toHaveLength(EXCEL_2026_SOURCE_ROW_ORDER.length);
  });

  it("chỉ lưu một bộ định nghĩa thông tin dự án dùng chung", () => {
    const state = createSeedState();
    const projectFields = state.fieldDefinitions.filter((field) => field.scope === "project");

    expect(projectFields.map((field) => field.id)).toEqual(
      PROJECT_FIELD_BLUEPRINTS.map((field) => field.id),
    );
    expect(projectFields.every((field) => field.ownerType === "library")).toBe(true);
  });

  it("cấu hình dự án chỉ chứa phần khác với mẫu", () => {
    const state = createSeedState();

    expect(state.projectFieldConfigs.every((config) => Object.keys(config).length > 2)).toBe(true);
    expect(state.projectMonthlyFieldConfigs.every((config) => Object.keys(config).length > 2)).toBe(
      true,
    );
  });

  it("nhãn nghiệp vụ riêng vẫn được phân giải qua override", () => {
    const state = createSeedState();
    const project = state.projects.find((item) => item.code === "AMR-MATERIAL")!;
    const fields = projectFieldsForProject(state, project.id);

    expect(fields.some((field) => field.label.includes("Nhân lực"))).toBe(true);
  });

  it("cột tổng hợp là vị trí hiển thị riêng, không phải bản sao field", () => {
    const state = createSeedState();
    const project = state.projects[0];
    const mapped = projectFieldsForProject(state, project.id)
      .map((field) => effectiveProjectSummaryColumn(state, project.id, field.id))
      .filter(Boolean);

    expect(state.summaryProjectColumns.length).toBe(PROJECT_FIELD_BLUEPRINTS.length);
    expect(mapped.length).toBeGreaterThan(0);
  });

  it("seed không lưu mô tả kỹ thuật kiểu Excel dòng", () => {
    const state = createSeedState();
    expect(JSON.stringify(state)).not.toContain("Excel dòng");
  });
});
