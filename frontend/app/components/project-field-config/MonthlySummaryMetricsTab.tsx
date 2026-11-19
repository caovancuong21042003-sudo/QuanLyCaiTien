import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import type { KkvState, MonthlySummaryMetricDefinition } from "../../domain/types";
import { createClientId } from "../../utils/id";
import { createTechnicalCode } from "../../utils/technical-code";
import { displayModesForField, semanticTypes } from "../../domain/field-behavior";
import { displayModeLabel, semanticTypeLabel } from "../../domain/field-labels";
import { monthlyFieldForSummaryMetric } from "../../domain/metadata";

type UpdateState = (updater: (state: KkvState) => KkvState) => void;

export function MonthlySummaryMetricsTab({
  state,
  updateState,
}: {
  state: KkvState;
  updateState: UpdateState;
}) {
  const [draft, setDraft] = useState<MonthlySummaryMetricDefinition | null>(null);
  const [error, setError] = useState("");

  const openNew = () =>
    setDraft({
      id: "",
      code: "",
      label: "",
      semanticType: "Number",
      displayMode: "number",
      sortOrder: Math.max(0, ...state.monthlySummaryMetrics.map((item) => item.sortOrder)) + 10,
      enabled: true,
    });

  const save = () => {
    if (!draft?.label.trim()) {
      setError("Tên chỉ tiêu không được để trống.");
      return;
    }
    const saved = {
      ...draft,
      id: draft.id || createClientId("summary-metric"),
      code:
        draft.code ||
        createTechnicalCode(
          draft.label,
          state.monthlySummaryMetrics
            .filter((item) => item.id !== draft.id)
            .map((item) => item.code),
        ),
      label: draft.label.trim(),
      prefix: draft.prefix?.trim() || undefined,
      suffix: draft.suffix?.trim() || undefined,
    };
    updateState((current) => ({
      ...current,
      monthlySummaryMetrics: current.monthlySummaryMetrics.some((item) => item.id === saved.id)
        ? current.monthlySummaryMetrics.map((item) => (item.id === saved.id ? saved : item))
        : [...current.monthlySummaryMetrics, saved],
    }));
    setDraft(null);
    setError("");
  };

  const remove = (metric: MonthlySummaryMetricDefinition) => {
    const mapped = state.projectMonthlyFieldConfigs.some(
      (config) => config.summaryMetricId === metric.id,
    );
    const inherited = state.projectFieldTemplates.some((template) =>
      template.fields.some((field) => field.summaryMetricId === metric.id),
    );
    const hasFormula = state.summaryFormulas.some((formula) => formula.metricId === metric.id);
    if (mapped || inherited || hasFormula) {
      setError(
        `Không thể xóa “${metric.label}” vì đang được ánh xạ hoặc có công thức tổng hợp. Hãy gỡ liên kết trước.`,
      );
      return;
    }
    updateState((current) => ({
      ...current,
      monthlySummaryMetrics: current.monthlySummaryMetrics.filter((item) => item.id !== metric.id),
    }));
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ justifyContent: "space-between", gap: 1 }}
      >
        <Typography variant="h5">Chỉ tiêu bảng tổng hợp</Typography>
        <Button variant="contained" startIcon={<AddRounded />} onClick={openNew}>
          Thêm chỉ tiêu
        </Button>
      </Stack>
      {error && (
        <Alert severity="warning" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      <Stack spacing={1}>
        {[...state.monthlySummaryMetrics]
          .sort((first, second) => first.sortOrder - second.sortOrder)
          .map((metric) => {
            const projectCount = new Set(
              state.projects.flatMap((project) =>
                monthlyFieldForSummaryMetric(state, project.id, metric.id) ? [project.id] : [],
              ),
            ).size;
            return (
              <Card key={metric.id} variant="outlined">
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
                    <Stack sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 750 }}>{metric.label}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {projectCount} dự án đang ánh xạ · {semanticTypeLabel(metric.semanticType)}{" "}
                        · {displayModeLabel(metric.displayMode)}
                      </Typography>
                    </Stack>
                    <Switch
                      checked={metric.enabled}
                      onChange={(event) =>
                        updateState((current) => ({
                          ...current,
                          monthlySummaryMetrics: current.monthlySummaryMetrics.map((item) =>
                            item.id === metric.id
                              ? { ...item, enabled: event.target.checked }
                              : item,
                          ),
                        }))
                      }
                    />
                    <IconButton
                      aria-label="Sửa chỉ tiêu"
                      onClick={() => setDraft(structuredClone(metric))}
                    >
                      <EditOutlined />
                    </IconButton>
                    <IconButton
                      aria-label="Xóa chỉ tiêu"
                      color="error"
                      onClick={() => remove(metric)}
                    >
                      <DeleteOutlineRounded />
                    </IconButton>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
      </Stack>

      <Dialog open={Boolean(draft)} onClose={() => setDraft(null)} fullWidth maxWidth="sm">
        <DialogTitle>{draft?.id ? "Sửa chỉ tiêu tổng hợp" : "Thêm chỉ tiêu tổng hợp"}</DialogTitle>
        {draft && (
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField
                autoFocus
                label="Tên hiển thị"
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
              <TextField
                select
                label="Kiểu dữ liệu"
                value={draft.semanticType}
                onChange={(event) => {
                  const semanticType = event.target
                    .value as MonthlySummaryMetricDefinition["semanticType"];
                  setDraft({
                    ...draft,
                    semanticType,
                    displayMode: displayModesForField(semanticType, "monthly")[0],
                  });
                }}
              >
                {semanticTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {semanticTypeLabel(type)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Cách hiển thị"
                value={draft.displayMode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    displayMode: event.target
                      .value as MonthlySummaryMetricDefinition["displayMode"],
                  })
                }
              >
                {displayModesForField(draft.semanticType, "monthly").map((mode) => (
                  <MenuItem key={mode} value={mode}>
                    {displayModeLabel(mode)}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  fullWidth
                  label="Tiền tố"
                  value={draft.prefix ?? ""}
                  onChange={(event) => setDraft({ ...draft, prefix: event.target.value })}
                />
                <TextField
                  fullWidth
                  label="Hậu tố"
                  value={draft.suffix ?? ""}
                  onChange={(event) => setDraft({ ...draft, suffix: event.target.value })}
                />
              </Stack>
              <TextField
                type="number"
                label="Số chữ số thập phân"
                value={draft.displayPrecision ?? 0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    displayPrecision: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Hủy</Button>
          <Button variant="contained" onClick={save}>
            Lưu
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
