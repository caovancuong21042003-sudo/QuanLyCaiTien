import { describe, expect, it } from "vitest";
import {
  displayModesForField,
  normalizeFieldBehavior,
  parseEditorValue,
} from "../domain/field-behavior";
import { formatFieldValue } from "../domain/metadata";
import type { ProjectFieldDefinition, SemanticType } from "../domain/types";

const field = (semanticType: SemanticType): ProjectFieldDefinition => ({
  id: `field-${semanticType}`,
  code: semanticType.toLowerCase(),
  label: semanticType,
  scope: "monthly",
  ownerType: "library",
  columnType: "standalone",
  semanticType,
  displayMode: displayModesForField(semanticType, "monthly")[0],
  inputMode: "manual",
  rowIndex: 1,
  sortOrder: 10,
});

describe("hành vi field theo kiểu dữ liệu", () => {
  it("chuyển đổi dữ liệu nhập theo đúng semantic type", () => {
    expect(parseEditorValue("12.5", field("Number"))).toBe(12.5);
    expect(parseEditorValue("true", field("Boolean"))).toBe(true);
    expect(parseEditorValue("false", field("Boolean"))).toBe(false);
    expect(parseEditorValue("2026-09-21", field("Date"))).toBe("2026-09-21");
    expect(parseEditorValue("Nội dung", field("Text"))).toBe("Nội dung");
  });

  it("không cho tổ hợp hiển thị không hợp lệ", () => {
    expect(displayModesForField("Boolean", "monthly")).toEqual(["badge", "text"]);
    expect(displayModesForField("Date", "project")).toEqual(["date"]);
    const normalized = normalizeFieldBehavior({
      ...field("Text"),
      displayMode: "number",
      suffix: "USD",
    });
    expect(normalized).toMatchObject({
      displayMode: "text",
      suffix: undefined,
    });
  });

  it("phần trăm và tiền tệ là số kèm hậu tố, không đổi giá trị ngầm", () => {
    const percentField = { ...field("Number"), suffix: "%" };
    const usdField = { ...field("Number"), suffix: "USD", displayPrecision: 2 };

    expect(parseEditorValue("5.2", percentField)).toBe(5.2);
    expect(formatFieldValue(5.2, percentField)).toBe("5,2%");
    expect(formatFieldValue(1265, usdField)).toBe("1.265 USD");
  });

  it("hiển thị được Boolean, Date và Text", () => {
    expect(formatFieldValue(true, field("Boolean"))).toBe("Có");
    expect(formatFieldValue(false, field("Boolean"))).toBe("Không");
    expect(formatFieldValue("2026-09-21", field("Date"))).toBe("21/09/2026");
    expect(formatFieldValue("Nội dung", field("Text"))).toBe("Nội dung");
  });
});
