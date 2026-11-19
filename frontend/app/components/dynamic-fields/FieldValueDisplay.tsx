import { Chip, LinearProgress, Stack, Typography } from "@mui/material";
import type { NumericValue, ProjectFieldDefinition } from "../../domain/types";
import { formatFieldValue } from "../../domain/metadata";
import { progressPercent } from "../../domain/field-behavior";
import { RichTextDisplay } from "../rich-text/RichTextDisplay";

export function FieldValueDisplay({
  field,
  value,
  notes,
  strong = false,
  compactRichText = false,
}: {
  field: ProjectFieldDefinition;
  value: unknown;
  notes?: Pick<NumericValue, "leftNote" | "rightNote">;
  strong?: boolean;
  compactRichText?: boolean;
}) {
  if (field.displayMode === "richText") {
    return <RichTextDisplay value={value} compact={compactRichText} />;
  }

  const label = formatFieldValue(value, field, notes);

  if (field.displayMode === "badge" && value != null) {
    return (
      <Chip
        size="small"
        label={label}
        color={field.semanticType === "Boolean" && value === true ? "success" : "default"}
        variant={field.semanticType === "Boolean" && value === false ? "outlined" : "filled"}
      />
    );
  }

  if (field.displayMode === "progress" && typeof value === "number") {
    const progress = progressPercent(value, field);
    return (
      <Stack spacing={0.35} sx={{ minWidth: 96 }}>
        <Typography variant="body2" sx={{ fontWeight: strong ? 750 : 600 }}>
          {label}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progress}
          aria-label={`${field.label}: ${label}`}
          sx={{ height: 6, borderRadius: 4 }}
        />
      </Stack>
    );
  }

  return (
    <Typography component="span" variant="body2" sx={{ fontWeight: strong ? 750 : undefined }}>
      {label}
    </Typography>
  );
}
