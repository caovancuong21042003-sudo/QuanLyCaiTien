import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import type {
  KkvState,
  ProjectFieldDefinition,
  ProjectMonthlyFieldConfig,
} from "../../domain/types";
import {
  effectiveMonthlyField,
  effectiveMonthlySummaryMetricId,
  monthlyFieldHasFormula,
  monthlyFieldColumns,
  projectMonthlyFieldConfig,
} from "../../domain/metadata";
import { BufferedTextField } from "../BufferedTextField";
import { sourceLabel } from "./project-field-presets";
import { isProjectOwnedField } from "../../domain/field-ownership";

interface ProjectFieldEditorProps {
  state: KkvState;
  projectId: string;
  field?: ProjectFieldDefinition;
  onChange: (field: ProjectFieldDefinition, patch: Partial<ProjectMonthlyFieldConfig>) => void;
  onDefinitionChange: (
    field: ProjectFieldDefinition,
    patch: Partial<ProjectFieldDefinition>,
  ) => void;
  onConfigureFormula?: (field: ProjectFieldDefinition) => void;
  onResetToTemplate?: (field: ProjectFieldDefinition) => void;
  onDelete?: (field: ProjectFieldDefinition) => void;
}

export function ProjectFieldEditor({
  state,
  projectId,
  field,
  onChange,
  onDefinitionChange,
  onConfigureFormula,
  onResetToTemplate,
  onDelete,
}: ProjectFieldEditorProps) {
  if (!field) {
    return <Alert severity="info">Chọn một trường ở danh sách bên trái để cấu hình.</Alert>;
  }

  const config = projectMonthlyFieldConfig(state, projectId, field.id);
  const effectiveField = effectiveMonthlyField(state, projectId, field);
  const visible = config?.visible ?? true;
  const allowedColumns = monthlyFieldColumns(state, projectId, field.id);
  const allowedColumnIds = allowedColumns.map((column) => column.id);
  const hasConfiguredFormula = monthlyFieldHasFormula(state, projectId, field.id);
  const summaryMetricId = effectiveMonthlySummaryMetricId(state, projectId, field.id) ?? "";
  const usedMetricIds = new Set(
    state.fieldDefinitions
      .filter(
        (candidate) =>
          candidate.scope === "monthly" && !candidate.deletedAt && candidate.id !== field.id,
      )
      .flatMap((candidate) => {
        const metricId = effectiveMonthlySummaryMetricId(state, projectId, candidate.id);
        return metricId ? [metricId] : [];
      }),
  );

  const toggleColumn = (columnId: string, enabled: boolean) => {
    const nextIds = enabled
      ? [...new Set([...allowedColumnIds, columnId])]
      : allowedColumnIds.filter((id) => id !== columnId);

    onChange(field, { allowedColumnIds: nextIds });
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ justifyContent: "space-between", gap: 1, alignItems: { sm: "center" } }}
      >
        <Box>
          <Typography variant="overline" color="primary">
            Trường đang cấu hình
          </Typography>
          <Typography variant="h6">{effectiveField.label}</Typography>
          <Chip
            size="small"
            sx={{ mt: 0.75 }}
            color={
              isProjectOwnedField(field, projectId) ? "secondary" : config ? "warning" : "default"
            }
            label={
              isProjectOwnedField(field, projectId)
                ? "Chỉ tiêu riêng"
                : config
                  ? "Đã tùy chỉnh so với mẫu"
                  : "Theo mẫu"
            }
          />
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={visible}
              onChange={(event) => onChange(field, { visible: event.target.checked })}
            />
          }
          label={visible ? "Đang hiển thị" : "Đang ẩn"}
        />
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 2fr) minmax(140px, 1fr)" },
          gap: 1.5,
        }}
      >
        <BufferedTextField
          label="Tên người dùng nhìn thấy"
          value={config?.displayLabel ?? ""}
          placeholder={field.label}
          helperText="Chỉ đổi tên trong dự án này, không làm hỏng công thức."
          disabled={!visible}
          onCommit={(value) => onChange(field, { displayLabel: value.trim() || undefined })}
        />

        <BufferedTextField
          label="Hậu tố hiển thị"
          value={config?.displaySuffix ?? ""}
          placeholder={field.suffix ?? "Không có"}
          disabled={!visible}
          onCommit={(value) => onChange(field, { displaySuffix: value.trim() || undefined })}
        />
      </Box>

      <TextField
        select
        label="Chỉ tiêu trên bảng tổng hợp"
        value={summaryMetricId}
        disabled={!visible}
        helperText="Chọn chỉ tiêu chung mà hàng này đóng góp vào. Không ánh xạ thì hàng chỉ dùng trong dự án."
        onChange={(event) => onChange(field, { summaryMetricId: event.target.value || null })}
      >
        <MenuItem value="">Không đưa lên bảng tổng hợp</MenuItem>
        {[...state.monthlySummaryMetrics]
          .filter((metric) => metric.enabled)
          .sort((first, second) => first.sortOrder - second.sortOrder)
          .map((metric) => (
            <MenuItem key={metric.id} value={metric.id} disabled={usedMetricIds.has(metric.id)}>
              {metric.label}
              {usedMetricIds.has(metric.id) ? " · Đã được một hàng khác sử dụng" : ""}
            </MenuItem>
          ))}
      </TextField>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Dùng ở cột nào?
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1 }}>
          {state.monthlyColumns.map((column) => {
            const checked = allowedColumnIds.includes(column.id);

            return (
              <Paper
                key={column.id}
                variant="outlined"
                sx={{
                  px: 1.5,
                  py: 0.75,
                  flex: 1,
                  bgcolor: checked ? "primary.50" : "background.paper",
                }}
              >
                <FormControlLabel
                  sx={{ width: "100%", m: 0 }}
                  control={
                    <Switch
                      checked={checked}
                      disabled={!visible}
                      onChange={(event) => toggleColumn(column.id, event.target.checked)}
                    />
                  }
                  label={column.label}
                />
              </Paper>
            );
          })}
        </Stack>
        {visible && allowedColumns.length === 0 && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Trường đang hiển thị nhưng chưa được bật cho Kế hoạch hoặc Thực tế.
          </Alert>
        )}
      </Box>

      <TextField
        label="Cách tạo dữ liệu"
        value={hasConfiguredFormula ? "Tính bằng công thức" : sourceLabel(field)}
        helperText={
          hasConfiguredFormula
            ? "Công thức được quản lý trong Trình tạo công thức."
            : "Người dùng nhập trực tiếp trong chi tiết dự án."
        }
        slotProps={{ input: { readOnly: true } }}
      />

      {onConfigureFormula ? (
        <Button
          variant="outlined"
          startIcon={<OpenInNewRounded />}
          onClick={() => onConfigureFormula(field)}
          sx={{ alignSelf: "flex-start" }}
        >
          Cấu hình công thức cho hàng này
        </Button>
      ) : field.inputMode === "formula" ? (
        <Button
          href="/formulas"
          variant="outlined"
          startIcon={<OpenInNewRounded />}
          sx={{ alignSelf: "flex-start" }}
        >
          Mở Trình tạo công thức
        </Button>
      ) : null}

      {!isProjectOwnedField(field, projectId) && config && onResetToTemplate && (
        <Button
          color="inherit"
          variant="outlined"
          onClick={() => onResetToTemplate(field)}
          sx={{ alignSelf: "flex-start" }}
        >
          Khôi phục theo mẫu
        </Button>
      )}

      {isProjectOwnedField(field, projectId) && onDelete && (
        <Button
          color="error"
          variant="outlined"
          startIcon={<DeleteOutlineRounded />}
          onClick={() => onDelete(field)}
          sx={{ alignSelf: "flex-start" }}
        >
          Xóa hàng riêng
        </Button>
      )}
    </Stack>
  );
}
