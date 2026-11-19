import { createClientId } from "./id";

const MAX_READABLE_LENGTH = 56;
const RANDOM_SUFFIX_LENGTH = 6;

function randomSuffix(): string {
  const value = createClientId("field")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  return value.slice(-RANDOM_SUFFIX_LENGTH).padStart(RANDOM_SUFFIX_LENGTH, "0");
}

export function technicalCodeBase(label: string): string {
  const words = label
    .replace(/[đĐ]/g, (character) => (character === "đ" ? "d" : "D"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

  if (!words.length) return "";
  const [first, ...rest] = words;
  let code = first + rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  if (/^[0-9]/.test(code)) code = `field${code.charAt(0).toUpperCase()}${code.slice(1)}`;
  return code.slice(0, MAX_READABLE_LENGTH);
}

export function createTechnicalCode(
  label: string,
  existingCodes: Iterable<string>,
  currentCode = "",
): string {
  if (!label.trim()) return "";
  const existing = new Set(Array.from(existingCodes, (code) => code.toLowerCase()));
  const base = technicalCodeBase(label);

  if (base && !existing.has(base.toLowerCase())) return base;

  // Giữ mã fallback/suffix đã sinh trong lúc người dùng tiếp tục nhập cùng một label.
  const expectedPrefix = base ? `${base}_` : "field_";
  if (
    currentCode.toLowerCase().startsWith(expectedPrefix.toLowerCase()) &&
    !existing.has(currentCode.toLowerCase())
  )
    return currentCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base || "field"}_${randomSuffix()}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }

  // Xác suất trùng mã random rất thấp; vòng số bảo đảm vẫn luôn tạo được mã duy nhất.
  let sequence = 2;
  while (existing.has(`${base || "field"}_${sequence}`.toLowerCase())) sequence += 1;
  return `${base || "field"}_${sequence}`;
}
