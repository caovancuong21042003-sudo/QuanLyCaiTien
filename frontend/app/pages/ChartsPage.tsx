import { useDeferredValue, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { ChartEditorDialog } from "../components/charts/ChartEditorDialog";
import { FlexibleChart } from "../components/charts/FlexibleChart";
import { useKkv } from "../context/kkv-context";
import { buildChartData } from "../domain/chart-data";
import type { ChartDefinition, Project } from "../domain/types";
import { createClientId } from "../utils/id";

const filterOptions = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "vi"));

export function createChartDefinition(
  state: ReturnType<typeof useKkv>["state"],
  dashboardScope: NonNullable<ChartDefinition["dashboardScope"]>,
): ChartDefinition {
  const row = state.summaryRows.find((item) => item.enabled && item.showInMonthlyColumns);
  const field =
    dashboardScope === "summary"
      ? (state.monthlySummaryMetrics.find((item) => item.code === "savingUsd") ??
        state.monthlySummaryMetrics.find((item) => item.enabled && item.semanticType === "Number"))
      : (state.fieldDefinitions.find((item) => item.code === "savingUsd") ??
        state.fieldDefinitions.find(
          (item) => item.scope === "monthly" && item.semanticType === "Number",
        ));
  const column = state.monthlyColumns[0];
  const scopeCharts = (state.chartDefinitions ?? []).filter(
    (item) => (item.dashboardScope ?? "summary") === dashboardScope,
  );
  return {
    id: createClientId("chart"),
    name: "Biểu đồ mới",
    description: "",
    dashboardScope,
    categoryAxis: "month",
    presentation: "cartesian",
    filterScope: "followPageFilters",
    size: "half",
    height: "medium",
    orientation: "vertical",
    categorySort: "source",
    projectLabel: "code",
    columnMode: "grouped",
    sortOrder: Math.max(0, ...scopeCharts.map((item) => item.sortOrder)) + 10,
    series: [
      {
        id: createClientId("chart-series"),
        label: column?.label ?? "Chuỗi 1",
        sourceKind: dashboardScope === "project" ? "monthlyField" : "summaryRow",
        summaryRowId: dashboardScope === "summary" ? row?.id : undefined,
        ...(dashboardScope === "project"
          ? { fieldId: field?.id ?? "", metricId: undefined }
          : { metricId: field?.id ?? "", fieldId: undefined }),
        columnId: column?.id ?? "",
        renderer: "column",
        valueAxis: "left",
        color: "#135D66",
        showValue: false,
      },
    ],
  };
}

function ChartCard({
  definition,
  state,
  scopedProjects,
  onEdit,
  onDelete,
}: {
  definition: ChartDefinition;
  state: ReturnType<typeof useKkv>["state"];
  scopedProjects: Project[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const data = useMemo(
    () => buildChartData(state, definition, scopedProjects),
    [definition, scopedProjects, state],
  );
  return (
    <Card
      variant="outlined"
      sx={{
        gridColumn: {
          xs: "span 1",
          xl: definition.size === "full" ? "span 2" : "span 1",
        },
        minWidth: 0,
      }}
    >
      <CardContent>
        <Stack
          direction="row"
          sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 1.5 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6">{definition.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {definition.description || "Không có mô tả"}
            </Typography>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 1 }}>
              <Chip
                size="small"
                color={definition.presentation === "donut" ? "secondary" : "default"}
                label={
                  definition.presentation === "pie"
                    ? "Biểu đồ tròn"
                    : definition.presentation === "donut"
                      ? "Vành khuyên"
                      : definition.orientation === "horizontal"
                        ? "Thanh ngang"
                        : "Biểu đồ kết hợp"
                }
              />
              <Chip
                size="small"
                label={definition.categoryAxis === "month" ? "Theo tháng" : "Theo dự án"}
              />
              <Chip
                size="small"
                variant="outlined"
                label={
                  definition.dashboardScope === "project"
                    ? scopedProjects[0]
                      ? `${scopedProjects[0].code} · ${scopedProjects[0].name}`
                      : "Chưa chọn dự án"
                    : definition.filterScope === "followPageFilters"
                      ? `${scopedProjects.length} dự án theo bộ lọc`
                      : `${scopedProjects.length} dự án trong năm`
                }
              />
            </Stack>
          </Box>
          <Stack direction="row">
            <Tooltip title="Sửa biểu đồ">
              <IconButton aria-label={`Sửa ${definition.name}`} onClick={onEdit}>
                <EditOutlined />
              </IconButton>
            </Tooltip>
            <Tooltip title="Xóa biểu đồ">
              <IconButton color="error" aria-label={`Xóa ${definition.name}`} onClick={onDelete}>
                <DeleteOutlineRounded />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <FlexibleChart definition={definition} data={data} compact={definition.size === "half"} />
      </CardContent>
    </Card>
  );
}

export function ChartsPage() {
  const { state, updateState } = useKkv();
  const allProjects = useMemo(
    () => state.projects.filter((project) => project.year === state.selectedYear),
    [state.projects, state.selectedYear],
  );
  const [searchText, setSearchText] = useState("");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [owner, setOwner] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "project">("summary");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [draft, setDraft] = useState<ChartDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChartDefinition | null>(null);
  const deferredSearch = useDeferredValue(searchText);
  const filteredProjects = useMemo(() => {
    const keyword = deferredSearch.trim().toLocaleLowerCase("vi");
    return allProjects.filter((project) => {
      const matchesKeyword =
        !keyword ||
        [project.code, project.name, project.product, project.owner]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(keyword);
      return (
        matchesKeyword &&
        (!department || project.department === department) &&
        (!category || project.category === category) &&
        (!owner || project.owner === owner)
      );
    });
  }, [allProjects, category, deferredSearch, department, owner]);
  const selectedProject =
    allProjects.find((project) => project.id === selectedProjectId) ?? allProjects[0];
  const projectChartScope = useMemo(
    () => (selectedProject ? [selectedProject] : []),
    [selectedProject],
  );
  const charts = [...(state.chartDefinitions ?? [])]
    .filter((chart) => (chart.dashboardScope ?? "summary") === activeTab)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const hasFilters = Boolean(searchText || department || category || owner);

  const saveDraft = () => {
    if (!draft) return;
    updateState((current) => ({
      ...current,
      chartDefinitions: (current.chartDefinitions ?? []).some((item) => item.id === draft.id)
        ? (current.chartDefinitions ?? []).map((item) => (item.id === draft.id ? draft : item))
        : [...(current.chartDefinitions ?? []), draft],
    }));
    setDraft(null);
  };

  const clearFilters = () => {
    setSearchText("");
    setDepartment("");
    setCategory("");
    setOwner("");
  };

  return (
    <Stack spacing={2.25}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", gap: 1.5 }}
      >
        <Box>
          <Typography variant="h4">Biểu đồ KKV</Typography>
          <Typography color="text.secondary">
            {activeTab === "summary"
              ? `${allProjects.length} dự án · Năm ${state.selectedYear} · Dùng chung kết quả với bảng tổng hợp`
              : selectedProject
                ? `${selectedProject.code} · ${selectedProject.name} · Năm ${state.selectedYear}`
                : `Năm ${state.selectedYear} chưa có dự án`}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          onClick={() => setDraft(createChartDefinition(state, activeTab))}
        >
          Thêm biểu đồ
        </Button>
      </Stack>

      <Card variant="outlined">
        <Tabs
          value={activeTab}
          onChange={(_, value: "summary" | "project") => setActiveTab(value)}
          aria-label="Phạm vi biểu đồ"
          sx={{ px: 1.5 }}
        >
          <Tab value="summary" label="Tổng hợp" />
          <Tab value="project" label="Theo dự án" />
        </Tabs>
      </Card>

      {activeTab === "summary" ? (
        <Card variant="outlined">
          <CardContent sx={{ py: "16px !important" }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "minmax(220px, 1.4fr) repeat(3, minmax(150px, 1fr)) auto",
                },
                gap: 1,
                alignItems: "center",
              }}
            >
              <TextField
                label="Tìm dự án"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <TextField
                select
                label="Bộ phận"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {filterOptions(allProjects.map((project) => project.department)).map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Phân loại"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {filterOptions(allProjects.map((project) => project.category)).map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Phụ trách"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {filterOptions(allProjects.map((project) => project.owner)).map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                color="inherit"
                startIcon={<RestartAltRounded />}
                disabled={!hasFilters}
                onClick={clearFilters}
              >
                Bỏ lọc
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          <CardContent sx={{ py: "16px !important" }}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              sx={{ alignItems: { md: "center" }, gap: 1.5 }}
            >
              <TextField
                select
                label="Dự án đang xem"
                value={selectedProject?.id ?? ""}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                sx={{ minWidth: { md: 420 } }}
              >
                {allProjects.map((project) => (
                  <MenuItem key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </MenuItem>
                ))}
              </TextField>
              {selectedProject && (
                <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
                  <Chip label={selectedProject.department} />
                  <Chip label={selectedProject.category} />
                  <Chip label={`Phụ trách: ${selectedProject.owner}`} />
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {charts.length ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "repeat(2, minmax(0, 1fr))" },
            gap: 2,
          }}
        >
          {charts.map((chart) => (
            <ChartCard
              key={chart.id}
              definition={chart}
              state={state}
              scopedProjects={
                activeTab === "project"
                  ? projectChartScope
                  : chart.filterScope === "followPageFilters"
                    ? filteredProjects
                    : allProjects
              }
              onEdit={() => setDraft(structuredClone(chart))}
              onDelete={() => setDeleteTarget(chart)}
            />
          ))}
        </Box>
      ) : (
        <Card variant="outlined">
          <CardContent sx={{ py: 8, textAlign: "center" }}>
            <InsightsRounded color="disabled" sx={{ fontSize: 56 }} />
            <Typography variant="h6" sx={{ mt: 1 }}>
              Chưa có biểu đồ
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Tạo biểu đồ đầu tiên từ kết quả của dòng tổng hợp hoặc dữ liệu tháng.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setDraft(createChartDefinition(state, activeTab))}
            >
              Thêm biểu đồ
            </Button>
          </CardContent>
        </Card>
      )}

      {draft && (
        <ChartEditorDialog
          open
          state={state}
          draft={draft}
          filteredProjects={filteredProjects}
          selectedProject={selectedProject}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs">
        <DialogTitle>Xóa biểu đồ?</DialogTitle>
        <DialogContent>
          <Typography>
            Biểu đồ “{deleteTarget?.name}” sẽ bị xóa. Dữ liệu và công thức nguồn không bị ảnh hưởng.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Hủy</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (!deleteTarget) return;
              updateState((current) => ({
                ...current,
                chartDefinitions: (current.chartDefinitions ?? []).filter(
                  (item) => item.id !== deleteTarget.id,
                ),
              }));
              setDeleteTarget(null);
            }}
          >
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
