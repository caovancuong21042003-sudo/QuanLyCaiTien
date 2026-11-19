import { useMemo, useState } from "react";
import {
  Box,
  Chip,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import type { KkvState, ProjectFieldDefinition } from "../../domain/types";
import {
  effectiveMonthlyField,
  monthlyFieldHasFormula,
  monthlyFieldColumns,
  projectMonthlyFieldConfig,
} from "../../domain/metadata";
import { sourceLabel } from "./project-field-presets";

interface ProjectFieldListProps {
  state: KkvState;
  projectId: string;
  fields: ProjectFieldDefinition[];
  selectedFieldId: string;
  onSelect: (fieldId: string) => void;
  onVisibilityChange: (field: ProjectFieldDefinition, visible: boolean) => void;
}

export function ProjectFieldList({
  state,
  projectId,
  fields,
  selectedFieldId,
  onSelect,
  onVisibilityChange,
}: ProjectFieldListProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const filteredFields = useMemo(
    () =>
      fields.filter((field) => {
        if (!normalizedQuery) return true;
        const effectiveField = effectiveMonthlyField(state, projectId, field);
        return `${effectiveField.label} ${field.label} ${field.id}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [fields, normalizedQuery, projectId, state],
  );

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="h6">Các trường theo tháng</Typography>
        <Typography variant="body2" color="text.secondary">
          Bật những trường dự án thực sự sử dụng, sau đó chọn để cấu hình.
        </Typography>
      </Box>

      <TextField
        size="small"
        value={query}
        placeholder="Tìm theo tên trường"
        onChange={(event) => setQuery(event.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      <List
        disablePadding
        sx={{
          maxHeight: 620,
          overflowY: "auto",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        {filteredFields.map((field) => {
          const config = projectMonthlyFieldConfig(state, projectId, field.id);
          const effectiveField = effectiveMonthlyField(state, projectId, field);
          const visible = config?.visible ?? true;
          const columns = monthlyFieldColumns(state, projectId, field.id);
          const hasConfiguredFormula = monthlyFieldHasFormula(state, projectId, field.id);

          return (
            <ListItemButton
              key={field.id}
              selected={selectedFieldId === field.id}
              onClick={() => onSelect(field.id)}
              sx={{
                alignItems: "flex-start",
                gap: 1,
                borderBottom: 1,
                borderColor: "divider",
                opacity: visible ? 1 : 0.62,
                "&:last-child": { borderBottom: 0 },
              }}
            >
              <Switch
                size="small"
                checked={visible}
                inputProps={{ "aria-label": `Hiển thị ${effectiveField.label}` }}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onVisibilityChange(field, event.target.checked)}
              />

              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ fontWeight: 750 }}>
                    {effectiveField.label}
                  </Typography>
                }
                secondary={
                  <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap", mt: 0.75 }}>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={hasConfiguredFormula ? "Tính bằng công thức" : sourceLabel(field)}
                      color={hasConfiguredFormula ? "secondary" : "default"}
                    />
                    {columns.map((column) => (
                      <Chip key={column.id} size="small" label={column.label} />
                    ))}
                    {visible && columns.length === 0 && (
                      <Chip size="small" color="warning" label="Chưa chọn cột" />
                    )}
                  </Stack>
                }
              />
            </ListItemButton>
          );
        })}

        {!filteredFields.length && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">Không tìm thấy trường phù hợp.</Typography>
          </Box>
        )}
      </List>
    </Stack>
  );
}
