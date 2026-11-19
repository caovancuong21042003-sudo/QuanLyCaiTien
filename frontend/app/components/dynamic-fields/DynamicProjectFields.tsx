import { Box, Grid, Stack, TextField, Typography } from "@mui/material";
import type { NumericValue, ProjectFieldDefinition } from "../../domain/types";
import { useFormulaHoverCard } from "../formula-hover/useFormulaHoverCard";
import { RichTextEditor } from "../rich-text/RichTextEditor";
import { BufferedTextField } from "../BufferedTextField";
import { FieldValueDisplay } from "./FieldValueDisplay";
import { TypedFieldInput } from "./TypedFieldInput";
import { formatFieldValue } from "../../domain/metadata";

const emptyRichTextDocument: Record<string, unknown> = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const isRichTextDocument = (value: unknown): value is Record<string, unknown> =>
  Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === "doc",
  );

export function DynamicProjectFields({
  fields,
  values,
  valueNotes,
  formulaExpressions,
  onChange,
  onNotesChange,
}: {
  fields: ProjectFieldDefinition[];
  values: Record<string, unknown>;
  valueNotes?: Record<string, Pick<NumericValue, "leftNote" | "rightNote">>;
  formulaExpressions?: Record<string, string | undefined>;
  onChange: (code: string, value: unknown) => void;
  onNotesChange?: (
    code: string,
    patch: Pick<NumericValue, "leftNote"> | Pick<NumericValue, "rightNote">,
  ) => void;
}) {
  const { formulaHoverProps, formulaHoverCard } = useFormulaHoverCard();
  return (
    <Grid container spacing={2}>
      {fields.map((field) => {
        const value = values[field.id] ?? field.fixedValue ?? null;
        const expression = formulaExpressions?.[field.id];
        const readOnly = field.inputMode !== "manual" || Boolean(expression);
        const numeric = field.semanticType === "Number";
        const notes = valueNotes?.[field.id];
        if (field.displayMode === "richText")
          return (
            <Grid key={field.id} size={{ xs: 12 }}>
              <Box
                {...formulaHoverProps(expression)}
                sx={expression ? { cursor: "help" } : undefined}
              >
                <Typography variant="subtitle2" gutterBottom>
                  {field.label}
                </Typography>
                <RichTextEditor
                  value={isRichTextDocument(value) ? value : emptyRichTextDocument}
                  readOnly={readOnly}
                  onChange={(nextValue) => onChange(field.id, nextValue)}
                />
                {readOnly && (
                  <Typography variant="caption" color="text.secondary">
                    {expression ? "Tự tính theo công thức" : "Chỉ đọc"}
                  </Typography>
                )}
              </Box>
            </Grid>
          );
        if (readOnly && numeric)
          return (
            <Grid key={field.id} size={{ xs: 12, md: 6 }}>
              <Box
                {...formulaHoverProps(expression)}
                sx={expression ? { cursor: "help" } : undefined}
              >
                <Typography variant="subtitle2" gutterBottom>
                  {field.label}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <BufferedTextField
                    size="small"
                    label="Tiền tố / chú thích trái"
                    value={notes?.leftNote ?? field.prefix ?? ""}
                    onCommit={(raw) => onNotesChange?.(field.id, { leftNote: raw })}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label={
                      expression || field.inputMode === "formula"
                        ? "Giá trị tự tính"
                        : "Giá trị cố định"
                    }
                    value={formatFieldValue(value, field, { leftNote: "", rightNote: "" })}
                    slotProps={{ input: { readOnly: true } }}
                    sx={{ flex: 1 }}
                  />
                  <BufferedTextField
                    size="small"
                    label="Hậu tố"
                    value={notes?.rightNote ?? field.suffix ?? ""}
                    onCommit={(raw) => onNotesChange?.(field.id, { rightNote: raw })}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {expression || field.inputMode === "formula"
                    ? "Giá trị do công thức tính; tiền tố và hậu tố vẫn sửa riêng theo dự án"
                    : "Giá trị cố định; cách hiển thị vẫn sửa riêng theo dự án"}
                </Typography>
              </Box>
            </Grid>
          );
        if (readOnly)
          return (
            <Grid key={field.id} size={{ xs: 12, md: 6 }}>
              <Box
                {...formulaHoverProps(expression)}
                sx={expression ? { cursor: "help" } : undefined}
              >
                <Typography variant="subtitle2" gutterBottom>
                  {field.label}
                </Typography>
                <FieldValueDisplay field={field} value={value} strong />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {expression || field.inputMode === "formula"
                    ? "Tự tính theo công thức"
                    : "Giá trị cố định"}
                </Typography>
              </Box>
            </Grid>
          );
        if (numeric)
          return (
            <Grid key={field.id} size={{ xs: 12, md: 6 }}>
              <Box
                {...formulaHoverProps(expression)}
                sx={expression ? { cursor: "help" } : undefined}
              >
                <Typography variant="subtitle2" gutterBottom>
                  {field.label}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <BufferedTextField
                    size="small"
                    label="Tiền tố / chú thích trái"
                    value={notes?.leftNote ?? field.prefix ?? ""}
                    onCommit={(raw) => onNotesChange?.(field.id, { leftNote: raw })}
                    sx={{ flex: 1 }}
                  />
                  <TypedFieldInput
                    field={field}
                    label="Giá trị"
                    value={value}
                    onCommit={(nextValue) => onChange(field.id, nextValue)}
                    sx={{ flex: 1 }}
                  />
                  <BufferedTextField
                    size="small"
                    label="Hậu tố"
                    value={notes?.rightNote ?? field.suffix ?? ""}
                    onCommit={(raw) => onNotesChange?.(field.id, { rightNote: raw })}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {expression || field.inputMode === "formula"
                    ? "Giá trị tự tính; tiền tố và hậu tố vẫn sửa riêng theo dự án"
                    : field.inputMode === "fixed"
                      ? "Giá trị cố định; cách hiển thị có thể sửa theo dự án"
                      : "Tiền tố và hậu tố chỉ áp dụng cho dự án này"}
                </Typography>
              </Box>
            </Grid>
          );
        return (
          <Grid key={field.id} size={{ xs: 12, md: 6 }}>
            <Box
              {...formulaHoverProps(expression)}
              sx={expression ? { cursor: "help" } : undefined}
            >
              <TypedFieldInput
                field={field}
                fullWidth
                label={field.label}
                value={value}
                onCommit={(nextValue) => onChange(field.id, nextValue)}
              />
            </Box>
          </Grid>
        );
      })}
      {formulaHoverCard}
    </Grid>
  );
}
