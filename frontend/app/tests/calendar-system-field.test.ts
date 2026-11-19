import { describe, expect, it } from "vitest";
import { createSeedState } from "../data/seed";
import { migrateState } from "../repositories/local-storage-repository";

describe("trường hệ thống Ngày làm việc", () => {
  it("khôi phục định nghĩa nếu dữ liệu cũ đã xóa trường", () => {
    const oldState = createSeedState();
    oldState.schemaVersion = 13;
    oldState.fieldDefinitions = oldState.fieldDefinitions.filter(
      (field) => field.id !== "workingDays",
    );

    const migrated = migrateState(oldState);
    const workingDays = migrated.fieldDefinitions.find((field) => field.id === "workingDays");

    expect(workingDays).toMatchObject({
      label: "Ngày làm việc",
      scope: "calendar",
      semanticType: "Number",
      displayMode: "number",
      inputMode: "manual",
      suffix: "ngày",
    });
  });

  it("reset định nghĩa đã bị sửa khi schema cũ không còn được hỗ trợ", () => {
    const oldState = createSeedState();
    oldState.schemaVersion = 13;
    oldState.fieldDefinitions = oldState.fieldDefinitions.map((field) =>
      field.id === "workingDays"
        ? {
            ...field,
            id: "working-days-from-user-data",
            label: "Tên đã sửa",
            scope: "project",
            suffix: "giờ",
          }
        : field,
    );

    const migrated = migrateState(oldState);
    const workingDays = migrated.fieldDefinitions.find((field) => field.id === "workingDays");

    expect(workingDays?.id).toBe("workingDays");
    expect(workingDays).toMatchObject({
      label: "Ngày làm việc",
      scope: "calendar",
      suffix: "ngày",
    });
  });
});
