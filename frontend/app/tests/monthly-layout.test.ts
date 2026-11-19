import { describe, expect, it } from "vitest";
import {
  addMonthlyRow,
  deleteEmptyMonthlyRow,
  moveMonthlyField,
  moveMonthlyRow,
} from "../domain/monthly-layout";
import type { ProjectMonthlyLayout } from "../domain/types";

const layout = (): ProjectMonthlyLayout => ({
  projectId: "project-1",
  rows: [
    { id: "row-a", sortOrder: 10 },
    { id: "row-b", sortOrder: 20 },
  ],
  placements: [
    { fieldId: "field-a", rowId: "row-a", sortOrder: 10 },
    { fieldId: "field-b", rowId: "row-a", sortOrder: 20 },
    { fieldId: "field-c", rowId: "row-b", sortOrder: 10 },
  ],
});

describe("monthly layout", () => {
  it("di chuyển field bằng row ID và giữ thứ tự trong hàng", () => {
    const moved = moveMonthlyField(layout(), "field-c", "row-a", "field-b");
    expect(
      moved.placements
        .filter((item) => item.rowId === "row-a")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.fieldId),
    ).toEqual(["field-a", "field-c", "field-b"]);
  });

  it("đổi thứ tự hàng mà không đổi row ID của placement", () => {
    const moved = moveMonthlyRow(layout(), "row-b", "row-a");
    expect([...moved.rows].sort((a, b) => a.sortOrder - b.sortOrder).map((row) => row.id)).toEqual([
      "row-b",
      "row-a",
    ]);
    expect(moved.placements.find((item) => item.fieldId === "field-c")?.rowId).toBe("row-b");
  });

  it("chỉ xóa hàng trống và luôn giữ ít nhất một hàng", () => {
    const withEmpty = addMonthlyRow(layout(), "row-empty");
    expect(deleteEmptyMonthlyRow(withEmpty, "row-empty").rows).toHaveLength(2);
    expect(deleteEmptyMonthlyRow(layout(), "row-a").rows).toHaveLength(2);
  });
});
