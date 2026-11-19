import { afterEach, describe, expect, it, vi } from "vitest";
import { createTechnicalCode, technicalCodeBase } from "../utils/technical-code";

describe("technical code", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tạo camelCase ASCII từ label tiếng Việt", () => {
    expect(technicalCodeBase("Hiệu quả mục tiêu/tháng")).toBe("hieuQuaMucTieuThang");
    expect(technicalCodeBase("Đơn giá / hệ số tiền")).toBe("donGiaHeSoTien");
    expect(technicalCodeBase("Tỷ lệ NG (%)")).toBe("tyLeNg");
  });

  it("thêm tiền tố field nếu label bắt đầu bằng số", () => {
    expect(technicalCodeBase("3 tháng gần nhất")).toBe("field3ThangGanNhat");
  });

  it("dùng mã random khi label không thể chuyển sang ASCII", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-0000-0000-0000a8f31c" });
    expect(createTechnicalCode("改善効果", [])).toBe("field_a8f31c");
  });

  it("thêm mã ngắn khi code sinh từ label đã tồn tại", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-0000-0000-0000a8f31c" });
    expect(createTechnicalCode("Hiệu quả", ["hieuQua"])).toBe("hieuQua_a8f31c");
  });

  it("giữ code hiện tại nếu label chưa đổi và code vẫn duy nhất", () => {
    expect(createTechnicalCode("改善効果", [], "field_a8f31c")).toBe("field_a8f31c");
  });
});
