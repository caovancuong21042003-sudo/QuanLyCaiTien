import { MenuItem, TextField, type SxProps, type Theme } from "@mui/material";
import type { ProjectFieldDefinition } from "../../domain/types";
import { editorValue, parseEditorValue } from "../../domain/field-behavior";
import { BufferedTextField } from "../BufferedTextField";

interface TypedFieldInputProps {
  field: ProjectFieldDefinition;
  value: unknown;
  onCommit: (value: unknown) => void;
  label?: string;
  disabled?: boolean;
  size?: "small" | "medium";
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number | "any";
}

export function TypedFieldInput({
  field,
  value,
  onCommit,
  label,
  disabled,
  size = "small",
  fullWidth,
  sx,
  ariaLabel,
  min,
  max,
  step = "any",
}: TypedFieldInputProps) {
  if (field.semanticType === "Boolean") {
    const selectValue = value === true ? "true" : value === false ? "false" : "";
    return (
      <TextField
        select
        label={label}
        value={selectValue}
        disabled={disabled}
        size={size}
        fullWidth={fullWidth}
        sx={sx}
        slotProps={{ htmlInput: { "aria-label": ariaLabel } }}
        onChange={(event) => onCommit(parseEditorValue(event.target.value, field))}
      >
        <MenuItem value="">Chưa chọn</MenuItem>
        <MenuItem value="true">Có</MenuItem>
        <MenuItem value="false">Không</MenuItem>
      </TextField>
    );
  }

  const numeric = field.semanticType === "Number";
  return (
    <BufferedTextField
      label={label}
      type={numeric ? "number" : field.semanticType === "Date" ? "date" : "text"}
      value={editorValue(value, field)}
      disabled={disabled}
      size={size}
      fullWidth={fullWidth}
      sx={sx}
      slotProps={{
        inputLabel: field.semanticType === "Date" ? { shrink: true } : undefined,
        htmlInput: {
          "aria-label": ariaLabel,
          ...(numeric
            ? {
                step,
                min: min ?? (field.displayMode === "progress" ? 0 : undefined),
                max: max ?? (field.displayMode === "progress" ? 100 : undefined),
              }
            : {}),
        },
      }}
      onCommit={(raw) => onCommit(parseEditorValue(raw, field))}
    />
  );
}
