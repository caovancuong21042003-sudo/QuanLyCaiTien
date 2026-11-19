export interface ParenthesisAnalysis {
  missingClosingCount: number;
  unexpectedClosingIndexes: number[];
  unmatchedOpeningIndexes: number[];
  balanced: boolean;
}

/**
 * Kiểm tra ngoặc trên biểu thức nội bộ. Nội dung nằm trong chuỗi và reference
 * không tham gia cân bằng ngoặc vì đó là dữ liệu, không phải cú pháp công thức.
 */
export function analyzeParentheses(source: string): ParenthesisAnalysis {
  const openings: number[] = [];
  const unexpectedClosingIndexes: number[] = [];
  let insideString = false;
  let insideReference = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && !insideReference) {
      insideString = !insideString;
      continue;
    }
    if (insideString) continue;
    if (character === "[") {
      insideReference = true;
      continue;
    }
    if (character === "]" && insideReference) {
      insideReference = false;
      continue;
    }
    if (insideReference) continue;

    if (character === "(") openings.push(index);
    else if (character === ")") {
      if (openings.length) openings.pop();
      else unexpectedClosingIndexes.push(index);
    }
  }

  return {
    missingClosingCount: openings.length,
    unexpectedClosingIndexes,
    unmatchedOpeningIndexes: openings,
    balanced: openings.length === 0 && unexpectedClosingIndexes.length === 0,
  };
}

export function completeMissingClosingParentheses(source: string): {
  source: string;
  addedCount: number;
} {
  const analysis = analyzeParentheses(source);
  if (analysis.unexpectedClosingIndexes.length || !analysis.missingClosingCount)
    return { source, addedCount: 0 };
  return {
    source: `${source}${")".repeat(analysis.missingClosingCount)}`,
    addedCount: analysis.missingClosingCount,
  };
}
