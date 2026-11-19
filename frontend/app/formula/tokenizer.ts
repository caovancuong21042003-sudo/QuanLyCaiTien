export type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "reference"
  | "operator"
  | "leftParen"
  | "rightParen"
  | "comma"
  | "eof";
export interface Token {
  type: TokenType;
  value: string;
}

const twoCharOperators = [">=", "<=", "!=", "<>"];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "[") {
      const end = source.indexOf("]", index);
      if (end < 0) throw new Error("InvalidFormula");
      tokens.push({ type: "reference", value: source.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (/\d|\./.test(character)) {
      const match = source.slice(index).match(/^\d*\.?\d+/);
      if (!match) throw new Error("InvalidFormula");
      tokens.push({ type: "number", value: match[0] });
      index += match[0].length;
      continue;
    }
    if (character === '"') {
      const end = source.indexOf('"', index + 1);
      if (end < 0) throw new Error("InvalidFormula");
      tokens.push({ type: "string", value: source.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const match = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      const value = match[0];
      const nextCharacter = source.slice(index + value.length).trimStart()[0];
      tokens.push({
        type:
          ["AND", "OR"].includes(value.toUpperCase()) && nextCharacter !== "("
            ? "operator"
            : "identifier",
        value: value.toUpperCase(),
      });
      index += value.length;
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (twoCharOperators.includes(pair)) {
      tokens.push({ type: "operator", value: pair === "<>" ? "!=" : pair });
      index += 2;
      continue;
    }
    if ("+-*/^><=".includes(character)) {
      tokens.push({ type: "operator", value: character });
      index += 1;
      continue;
    }
    if (character === "(") tokens.push({ type: "leftParen", value: character });
    else if (character === ")") tokens.push({ type: "rightParen", value: character });
    else if (character === "," || character === ";")
      tokens.push({ type: "comma", value: character });
    else throw new Error("InvalidFormula");
    index += 1;
  }
  return [...tokens, { type: "eof", value: "" }];
}
