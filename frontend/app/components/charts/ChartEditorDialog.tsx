import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import { buildChartData } from "../../domain/chart-data";
import type { ChartDefinition, ChartSeriesDefinition, KkvState, Project } from "../../domain/types";
import { createClientId } from "../../utils/id";
import { FlexibleChart } from "./FlexibleChart";
import { monthlyFieldsForProject, summaryMetricAsField } from "../../domain/metadata";

interface ChartEditorDialogProps {
  open: boolean;
  state: KkvState;
  draft: ChartDefinition;
  filteredProjects: Project[];
  selectedProject?: Project;
  onChange: (draft: ChartDefinition) => void;
  onClose: () => void;
  onSave: () => void;
}

const palette = ["#135D66", "#E97836", "#2E7D32", "#7B1FA2", "#0277BD", "#C62828"];

function createSeries(state: KkvState, draft: ChartDefinition): ChartSeriesDefinition {
  const field =
    draft.dashboardScope === "project"
      ? state.fieldDefinitions.find(
          (item) => item.scope === "monthly" && item.semanticType === "Number",
        )
      : state.monthlySummaryMetrics.find((item) => item.enabled && item.semanticType === "Number");
  const column = state.monthlyColumns[0];
  return {
    id: createClientId("chart-series"),
    label: `Chuỗi ${draft.series.length + 1}`,
    sourceKind:
      draft.dashboardScope === "project"
        ? "monthlyField"
        : draft.categoryAxis === "month"
          ? "summaryRow"
          : "summaryColumn",
    summaryRowId:
      draft.dashboardScope !== "project" && draft.categoryAxis === "month"
        ? state.summaryRows.find((item) => item.enabled)?.id
        : undefined,
    summaryColumnId:
      draft.categoryAxis === "project"
        ? state.summaryColumns.find((item) => item.enabled)?.id
        : undefined,
    ...(draft.dashboardScope === "project"
      ? { fieldId: field?.id ?? "", metricId: undefined }
      : { metricId: field?.id ?? "", fieldId: undefined }),
    columnId: column?.id ?? "",
    month: state.periods.at(-1)?.month ?? 12,
    renderer: draft.categoryAxis === "month" ? "line" : "column",
    valueAxis: "left",
    color: palette[draft.series.length % palette.length],
    showValue: false,
  };
}

function axisSuffixWarnings(state: KkvState, draft: ChartDefinition) {
  return (["left", "right"] as const).flatMap((axis) => {
    const suffixes = new Set(
      draft.series
        .filter((series) => series.valueAxis === axis)
        .map(
          (series) =>
            state.fieldDefinitions.find((field) => field.id === series.fieldId) ??
            state.monthlySummaryMetrics.find((metric) => metric.id === series.metricId),
        )
        .map((field) => field?.suffix ?? field?.displayMode ?? "")
        .filter(Boolean),
    );
    return suffixes.size > 1 ? [axis] : [];
  });
}

export function ChartEditorDialog({
  open,
  state,
  draft,
  filteredProjects,
  selectedProject,
  onChange,
  onClose,
  onSave,
}: ChartEditorDialogProps) {
  const [error, setError] = useState("");
  const numericFields = (
    draft.dashboardScope === "project" && selectedProject
      ? monthlyFieldsForProject(state, selectedProject.id)
      : state.monthlySummaryMetrics.filter((metric) => metric.enabled).map(summaryMetricAsField)
  ).filter((field) => field.semanticType === "Number");
  const availableRows = state.summaryRows
    .filter((row) => row.enabled && row.showInMonthlyColumns)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const availableColumns = state.summaryColumns
    .filter((column) => column.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const allProjects = state.projects.filter((project) => project.year === state.selectedYear);
  const projectDashboard = draft.dashboardScope === "project";
  const previewProjects = projectDashboard
    ? selectedProject
      ? [selectedProject]
      : []
    : draft.filterScope === "followPageFilters"
      ? filteredProjects
      : allProjects;
  const data = useMemo(
    () => buildChartData(state, draft, previewProjects),
    [draft, previewProjects, state],
  );
  const suffixWarnings = axisSuffixWarnings(state, draft);
  const circular = draft.presentation === "pie" || draft.presentation === "donut";
  const visibleSeries = circular ? draft.series.slice(0, 1) : draft.series;

  const updateSeries = (seriesId: string, patch: Partial<ChartSeriesDefinition>) => {
    onChange({
      ...draft,
      series: draft.series.map((series) =>
        series.id === seriesId ? { ...series, ...patch } : series,
      ),
    });
  };

  const changeCategoryAxis = (categoryAxis: ChartDefinition["categoryAxis"]) => {
    onChange({
      ...draft,
      categoryAxis,
      orientation: categoryAxis === "month" ? "vertical" : "horizontal",
      categorySort: categoryAxis === "month" ? "source" : (draft.categorySort ?? "valueDesc"),
      projectLabel:
        categoryAxis === "project" ? (draft.projectLabel ?? "name") : draft.projectLabel,
      series: draft.series.map((series) => ({
        ...series,
        sourceKind: projectDashboard
          ? "monthlyField"
          : categoryAxis === "month"
            ? "summaryRow"
            : "summaryColumn",
        summaryRowId:
          !projectDashboard && categoryAxis === "month"
            ? (series.summaryRowId ?? availableRows[0]?.id)
            : undefined,
        summaryColumnId:
          categoryAxis === "project"
            ? (series.summaryColumnId ?? availableColumns[0]?.id)
            : undefined,
        month: series.month ?? state.periods.at(-1)?.month ?? 12,
        renderer: categoryAxis === "project" ? "column" : series.renderer,
      })),
    });
  };

  const save = () => {
    if (!draft.name.trim()) {
      setError("Tên biểu đồ không được để trống.");
      return;
    }
    if (!draft.series.length) {
      setError("Biểu đồ cần ít nhất một chuỗi dữ liệu.");
      return;
    }
    const seriesToValidate = circular ? draft.series.slice(0, 1) : draft.series;
    const invalidSource = seriesToValidate.some(
      (series) =>
        (projectDashboard ? !series.fieldId : !series.metricId) ||
        !series.columnId ||
        (!projectDashboard && draft.categoryAxis === "month" && !series.summaryRowId) ||
        (draft.categoryAxis === "project" &&
          series.sourceKind === "summaryColumn" &&
          !series.summaryColumnId),
    );
    if (invalidSource) {
      setError("Có chuỗi chưa chọn đủ nguồn dữ liệu.");
      return;
    }
    setError("");
    onSave();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl">
      <DialogTitle>
        {projectDashboard ? "Cấu hình biểu đồ theo dự án" : "Cấu hình biểu đồ tổng hợp"}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(380px, 4fr) minmax(0, 8fr)" },
            minHeight: { lg: 680 },
          }}
        >
          <Stack spacing={2} sx={{ p: 2.5, borderRight: { lg: 1 }, borderColor: "divider" }}>
            <Box>
              <Typography variant="h6">Thông tin chung</Typography>
              <Typography variant="body2" color="text.secondary">
                Biểu đồ chỉ chọn kết quả đã được tính; công thức vẫn quản lý tại phần tổng hợp.
              </Typography>
            </Box>
            {error && <Alert severity="warning">{error}</Alert>}
            <TextField
              label="Tên biểu đồ"
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
            <TextField
              label="Mô tả"
              multiline
              minRows={2}
              value={draft.description ?? ""}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 1.5,
              }}
            >
              <TextField
                select
                label="Loại biểu đồ"
                value={draft.presentation ?? "cartesian"}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    presentation: event.target.value as NonNullable<
                      ChartDefinition["presentation"]
                    >,
                  })
                }
                sx={{ gridColumn: "1 / -1" }}
              >
                <MenuItem value="cartesian">Cột, đường, vùng hoặc điểm</MenuItem>
                <MenuItem value="pie">Biểu đồ tròn</MenuItem>
                <MenuItem value="donut">Biểu đồ vành khuyên</MenuItem>
              </TextField>
              <TextField
                select
                label="Nhóm dữ liệu theo"
                value={draft.categoryAxis}
                disabled={projectDashboard}
                onChange={(event) =>
                  changeCategoryAxis(event.target.value as ChartDefinition["categoryAxis"])
                }
              >
                <MenuItem value="month">Tháng</MenuItem>
                {!projectDashboard && <MenuItem value="project">Dự án</MenuItem>}
              </TextField>
              {projectDashboard ? (
                <TextField
                  label="Dự án dùng để xem trước"
                  value={selectedProject ? `${selectedProject.code} · ${selectedProject.name}` : ""}
                  disabled
                />
              ) : (
                <TextField
                  select
                  label="Phạm vi dự án"
                  value={draft.filterScope}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      filterScope: event.target.value as ChartDefinition["filterScope"],
                    })
                  }
                >
                  <MenuItem value="followPageFilters">Theo bộ lọc trang</MenuItem>
                  <MenuItem value="allProjects">Tất cả dự án</MenuItem>
                </TextField>
              )}
              <TextField
                select
                label="Độ rộng"
                value={draft.size}
                onChange={(event) =>
                  onChange({ ...draft, size: event.target.value as ChartDefinition["size"] })
                }
              >
                <MenuItem value="half">Nửa trang</MenuItem>
                <MenuItem value="full">Toàn trang</MenuItem>
              </TextField>
              <TextField
                select
                label="Chiều cao"
                value={draft.height}
                onChange={(event) =>
                  onChange({ ...draft, height: event.target.value as ChartDefinition["height"] })
                }
              >
                <MenuItem value="small">Thấp</MenuItem>
                <MenuItem value="medium">Vừa</MenuItem>
                <MenuItem value="large">Cao</MenuItem>
              </TextField>
              {!circular && (
                <TextField
                  select
                  label="Hướng biểu đồ"
                  value={draft.orientation ?? "vertical"}
                  onChange={(event) => {
                    const orientation = event.target.value as NonNullable<
                      ChartDefinition["orientation"]
                    >;
                    onChange({
                      ...draft,
                      orientation,
                      series:
                        orientation !== "vertical"
                          ? draft.series.map((series) => ({ ...series, renderer: "column" }))
                          : draft.series,
                    });
                  }}
                >
                  <MenuItem value="vertical">Dọc</MenuItem>
                  <MenuItem value="horizontal">Thanh ngang</MenuItem>
                  <MenuItem value="auto">Tự động theo số lượng</MenuItem>
                </TextField>
              )}
              {draft.categoryAxis === "project" && !circular && (
                <TextField
                  select
                  label="Sắp xếp dự án"
                  value={draft.categorySort ?? "source"}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      categorySort: event.target.value as NonNullable<
                        ChartDefinition["categorySort"]
                      >,
                    })
                  }
                >
                  <MenuItem value="valueDesc">Giá trị cao xuống thấp</MenuItem>
                  <MenuItem value="valueAsc">Giá trị thấp lên cao</MenuItem>
                  <MenuItem value="source">Thứ tự dự án hiện tại</MenuItem>
                </TextField>
              )}
              {draft.categoryAxis === "project" && (
                <TextField
                  select
                  label="Nhãn dự án"
                  value={draft.projectLabel ?? "code"}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      projectLabel: event.target.value as NonNullable<
                        ChartDefinition["projectLabel"]
                      >,
                    })
                  }
                >
                  <MenuItem value="name">Tên dự án</MenuItem>
                  <MenuItem value="code">Mã dự án</MenuItem>
                  <MenuItem value="codeAndName">Mã và tên dự án</MenuItem>
                </TextField>
              )}
              {!circular && (
                <TextField
                  select
                  label="Cách xếp các chuỗi cột"
                  value={draft.columnMode ?? "grouped"}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      columnMode: event.target.value as NonNullable<ChartDefinition["columnMode"]>,
                    })
                  }
                  sx={{ gridColumn: "1 / -1" }}
                >
                  <MenuItem value="grouped">Đặt cạnh nhau để so sánh</MenuItem>
                  <MenuItem value="stacked">Chồng lên nhau để xem cơ cấu</MenuItem>
                </TextField>
              )}
              {circular && (
                <>
                  <TextField
                    type="number"
                    label="Số lát cắt tối đa"
                    value={draft.topN ?? 8}
                    slotProps={{ htmlInput: { min: 2, max: 20 } }}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        topN: Math.max(2, Math.min(20, Number(event.target.value) || 8)),
                      })
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={draft.groupRemainder !== false}
                        onChange={(_, checked) => onChange({ ...draft, groupRemainder: checked })}
                      />
                    }
                    label="Gộp phần còn lại thành Khác"
                  />
                </>
              )}
            </Box>

            <Divider />
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Box>
                <Typography variant="h6">Chuỗi dữ liệu</Typography>
                <Typography variant="caption" color="text.secondary">
                  Mỗi chuỗi là một đường hoặc một nhóm cột.
                </Typography>
              </Box>
              <Button
                startIcon={<AddRounded />}
                disabled={circular}
                onClick={() =>
                  onChange({ ...draft, series: [...draft.series, createSeries(state, draft)] })
                }
              >
                Thêm chuỗi
              </Button>
            </Stack>

            {circular && draft.series.length > 1 && (
              <Alert severity="info">
                Biểu đồ tròn chỉ dùng chuỗi đầu tiên. Các chuỗi còn lại được giữ lại để không mất
                cấu hình khi chuyển về biểu đồ thường.
              </Alert>
            )}

            {visibleSeries.map((series, index) => (
              <Card key={series.id} variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack
                      direction="row"
                      sx={{ alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Typography variant="subtitle2">Chuỗi {index + 1}</Typography>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Xóa ${series.label}`}
                        onClick={() =>
                          onChange({
                            ...draft,
                            series: draft.series.filter((item) => item.id !== series.id),
                          })
                        }
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Stack>
                    <TextField
                      label="Tên hiển thị"
                      value={series.label}
                      onChange={(event) => updateSeries(series.id, { label: event.target.value })}
                    />
                    {projectDashboard ? (
                      <Alert severity="info" icon={false}>
                        Lấy trực tiếp dữ liệu từng tháng của dự án đang chọn.
                      </Alert>
                    ) : draft.categoryAxis === "month" ? (
                      <TextField
                        select
                        label="Dòng tổng hợp nguồn"
                        value={series.summaryRowId ?? ""}
                        onChange={(event) =>
                          updateSeries(series.id, { summaryRowId: event.target.value })
                        }
                      >
                        {availableRows.map((row) => (
                          <MenuItem key={row.id} value={row.id}>
                            {row.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <Stack spacing={1.5}>
                        <TextField
                          select
                          label="Nguồn so sánh dự án"
                          value={series.sourceKind}
                          onChange={(event) => {
                            const sourceKind = event.target.value as
                              "summaryColumn" | "summaryMetric";
                            updateSeries(series.id, {
                              sourceKind,
                              summaryColumnId:
                                sourceKind === "summaryColumn"
                                  ? (series.summaryColumnId ?? availableColumns[0]?.id)
                                  : undefined,
                            });
                          }}
                        >
                          <MenuItem value="summaryColumn">Kết quả cột tổng hợp</MenuItem>
                          <MenuItem value="summaryMetric">Giá trị của một tháng</MenuItem>
                        </TextField>
                        {series.sourceKind === "summaryColumn" ? (
                          <TextField
                            select
                            label="Cột tổng hợp nguồn"
                            value={series.summaryColumnId ?? ""}
                            onChange={(event) =>
                              updateSeries(series.id, { summaryColumnId: event.target.value })
                            }
                          >
                            {availableColumns.map((column) => (
                              <MenuItem key={column.id} value={column.id}>
                                {column.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        ) : (
                          <TextField
                            select
                            label="Tháng lấy dữ liệu"
                            value={series.month ?? state.periods.at(-1)?.month ?? 12}
                            onChange={(event) =>
                              updateSeries(series.id, { month: Number(event.target.value) })
                            }
                          >
                            {state.periods.map((period) => (
                              <MenuItem key={period.month} value={period.month}>
                                {period.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        )}
                      </Stack>
                    )}
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 1.25,
                      }}
                    >
                      <TextField
                        select
                        label={projectDashboard ? "Trường dữ liệu" : "Chỉ tiêu tổng hợp"}
                        value={projectDashboard ? (series.fieldId ?? "") : (series.metricId ?? "")}
                        onChange={(event) =>
                          updateSeries(
                            series.id,
                            projectDashboard
                              ? { fieldId: event.target.value, metricId: undefined }
                              : { metricId: event.target.value, fieldId: undefined },
                          )
                        }
                      >
                        {numericFields.map((field) => (
                          <MenuItem key={field.id} value={field.id}>
                            {field.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label="Cột dữ liệu"
                        value={series.columnId}
                        onChange={(event) =>
                          updateSeries(series.id, { columnId: event.target.value })
                        }
                      >
                        {state.monthlyColumns.map((column) => (
                          <MenuItem key={column.id} value={column.id}>
                            {column.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label="Cách vẽ"
                        value={series.renderer}
                        disabled={circular || (draft.orientation ?? "vertical") !== "vertical"}
                        onChange={(event) =>
                          updateSeries(series.id, {
                            renderer: event.target.value as ChartSeriesDefinition["renderer"],
                          })
                        }
                      >
                        {circular ? (
                          <MenuItem value={series.renderer}>Lát cắt</MenuItem>
                        ) : (draft.orientation ?? "vertical") !== "vertical" ? (
                          <MenuItem value="column">Thanh ngang</MenuItem>
                        ) : (
                          [
                            <MenuItem key="column" value="column">
                              Cột
                            </MenuItem>,
                            <MenuItem key="line" value="line">
                              Đường
                            </MenuItem>,
                            <MenuItem key="area" value="area">
                              Vùng
                            </MenuItem>,
                            <MenuItem key="scatter" value="scatter">
                              Điểm
                            </MenuItem>,
                          ]
                        )}
                      </TextField>
                      <TextField
                        select
                        label="Trục giá trị"
                        value={series.valueAxis}
                        onChange={(event) =>
                          updateSeries(series.id, {
                            valueAxis: event.target.value as ChartSeriesDefinition["valueAxis"],
                          })
                        }
                      >
                        <MenuItem value="left">Bên trái</MenuItem>
                        <MenuItem value="right">Bên phải</MenuItem>
                      </TextField>
                    </Box>
                    <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
                      <TextField
                        type="color"
                        label="Màu"
                        value={series.color}
                        onChange={(event) => updateSeries(series.id, { color: event.target.value })}
                        sx={{ width: 100 }}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={series.showValue}
                            onChange={(_, checked) =>
                              updateSeries(series.id, { showValue: checked })
                            }
                          />
                        }
                        label="Hiện giá trị"
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Box sx={{ p: 2.5, bgcolor: "#F7F9FA", minWidth: 0 }}>
            <Stack spacing={2} sx={{ position: { lg: "sticky" }, top: 16 }}>
              <Box>
                <Typography variant="h6">Xem trước</Typography>
                <Typography variant="body2" color="text.secondary">
                  {projectDashboard && selectedProject
                    ? `${selectedProject.code} · ${selectedProject.name} · Năm ${state.selectedYear}`
                    : `${previewProjects.length} dự án · Năm ${state.selectedYear}`}
                </Typography>
              </Box>
              {suffixWarnings.length > 0 && (
                <Alert severity="warning">
                  Có nhiều hậu tố trên cùng trục {suffixWarnings.includes("left") ? "trái" : "phải"}
                  . Hãy chuyển một chuỗi sang trục còn lại để biểu đồ dễ đọc.
                </Alert>
              )}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6">{draft.name || "Biểu đồ chưa đặt tên"}</Typography>
                  {draft.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {draft.description}
                    </Typography>
                  )}
                  <FlexibleChart definition={draft} data={data} />
                </CardContent>
              </Card>
            </Stack>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={save}>
          Lưu biểu đồ
        </Button>
      </DialogActions>
    </Dialog>
  );
}
