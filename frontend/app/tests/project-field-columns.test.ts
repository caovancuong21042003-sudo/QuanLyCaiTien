import { describe, expect, it } from "vitest";
import { buildProjectFieldColumns } from "../domain/metadata";
import type { ColumnGroupDefinition, ProjectFieldDefinition } from "../domain/types";

const field = (id: string, sortOrder: number, parentId?: string): ProjectFieldDefinition => ({
  id,
  code: id,
  label: id,
  scope: "project",
  ownerType: "library",
  parentId,
  columnType: parentId ? "child" : "standalone",
  semanticType: "Number",
  displayMode: "number",
  inputMode: "manual",
  rowIndex: 1,
  sortOrder,
});

const groups: ColumnGroupDefinition[] = [
  { id: "group-main", code: "main", label: "Nhóm chính", sortOrder: 20 },
  { id: "group-empty", code: "empty", label: "Nhóm trống", sortOrder: 40 },
];

describe("buildProjectFieldColumns", () => {
  it("sắp xếp ở cấp cha và giữ field con liền nhau trong nhóm", () => {
    const columns = buildProjectFieldColumns(
      [
        field("root-last", 30),
        field("child-second", 20, "group-main"),
        field("root-first", 10),
        field("child-first", 10, "group-main"),
        field("orphan", 25, "missing-group"),
      ],
      groups,
    );

    expect(
      columns.map((column) =>
        column.kind === "field" ? column.field.id : `group:${column.group.id}`,
      ),
    ).toEqual(["root-first", "group:group-main", "orphan", "root-last"]);

    const group = columns.find((column) => column.kind === "group");
    expect(group?.kind === "group" ? group.children.map((child) => child.id) : []).toEqual([
      "child-first",
      "child-second",
    ]);
  });

  it("chỉ hiện nhóm trống trong màn cấu hình", () => {
    expect(buildProjectFieldColumns([] as ProjectFieldDefinition[], groups)).toEqual([]);
    expect(
      buildProjectFieldColumns([] as ProjectFieldDefinition[], groups, {
        includeEmptyGroups: true,
      }).map((column) => (column.kind === "group" ? column.group.id : column.field.id)),
    ).toEqual(["group-main", "group-empty"]);
  });
});
