import { describe, expect, it } from "vitest";
import { createSeedState } from "../data/seed";
import { migrateState } from "../repositories/local-storage-repository";

describe("state validation", () => {
  it("loại snapshot cùng phiên bản nhưng chứa columnId không tồn tại", () => {
    const invalid = createSeedState();
    invalid.monthlyValues[0].columnId = "missing-column";

    const migrated = migrateState(invalid);

    expect(migrated.monthlyValues.some((item) => item.columnId === "missing-column")).toBe(false);
    expect(migrated).not.toBe(invalid);
  });

  it("loại snapshot có nhiều cột cùng mang vai trò Thực tế", () => {
    const invalid = createSeedState();
    invalid.monthlyColumns.push({
      id: "duplicate-actual",
      code: "duplicateActual",
      label: "Thực tế trùng",
      role: "actual",
      sortOrder: 30,
    });

    const migrated = migrateState(invalid);

    expect(migrated.monthlyColumns.filter((column) => column.role === "actual")).toHaveLength(1);
  });
});
