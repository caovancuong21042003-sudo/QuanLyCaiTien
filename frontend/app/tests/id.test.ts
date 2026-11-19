import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientId } from "../utils/id";

describe("createClientId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("vẫn sinh được ID khi randomUUID không có trên HTTP LAN", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(7);
        return bytes;
      },
    });

    expect(createClientId("field")).toMatch(/^field-[a-z0-9]+-07070707070707070707070707070707$/);
  });

  it("có fallback cuối khi Web Crypto không tồn tại", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createClientId("field")).toMatch(/^field-/);
  });
});
