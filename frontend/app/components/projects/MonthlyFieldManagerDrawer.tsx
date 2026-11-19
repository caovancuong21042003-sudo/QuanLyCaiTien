import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import RestoreFromTrashRounded from "@mui/icons-material/RestoreFromTrashRounded";
import IconButton from "@mui/material/IconButton";
import type {
  InputMode,
  KkvState,
  ProjectFieldDefinition,
  ProjectMonthlyLayout,
  ProjectMonthlyFieldConfig,
  SemanticType,
} from "../../domain/types";
import {
  effectiveMonthlySummaryMetricId,
  monthlyFieldDefinitionsForProject,
  monthlyFieldsForProject,
  monthlyLayoutForProject,
  projectMonthlyFieldConfig,
} from "../../domain/metadata";
import {
  displayModesForField,
  normalizeFieldBehavior,
  semanticTypes,
} from "../../domain/field-behavior";
import { semanticTypeLabel } from "../../domain/field-labels";
import { createTechnicalCode } from "../../utils/technical-code";
import { createClientId } from "../../utils/id";
import { ProjectFieldEditor } from "../project-field-config/ProjectFieldEditor";
import { ProjectFieldList } from "../project-field-config/ProjectFieldList";
import { MonthlyLayoutPreview } from "../project-field-config/MonthlyLayoutPreview";
import { useToast } from "../../context/toast-context";
import {
  addMonthlyRow,
  deleteEmptyMonthlyRow,
  moveMonthlyField,
  moveMonthlyRow,
} from "../../domain/monthly-layout";
import { isProjectOwnedField } from "../../domain/field-ownership";
import { dependentFormulaLabels } from "../../domain/field-deletion";

type UpdateKkvState = (updater: (state: KkvState) => KkvState) => void;

interface MonthlyFieldManagerDrawerProps {
  open: boolean;
  state: KkvState;
  projectId: string;
  initialFieldId?: string;
  updateState: UpdateKkvState;
  onClose: () => void;
  onConfigureFormula: (fieldId: string) => void;
}

export function MonthlyFieldManagerDrawer({
  open,
  state,
  projectId,
  initialFieldId,
  updateState,
  onClose,
  onConfigureFormula,
}: MonthlyFieldManagerDrawerProps) {
  const { showToast } = useToast();
  const fields = monthlyFieldDefinitionsForProject(state, projectId);
  const [selectedFieldId, setSelectedFieldId] = useState(initialFieldId ?? "");
  const [activeTab, setActiveTab] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deleteFieldId, setDeleteFieldId] = useState("");
  const deletedFields = state.fieldDefinitions
    .filter(
      (field) =>
        field.scope === "monthly" && field.deletedAt && isProjectOwnedField(field, projectId),
    )
    .sort((first, second) => first.sortOrder - second.sortOrder);
  const deleteField = state.fieldDefinitions.find((field) => field.id === deleteFieldId);
  const deleteDependencies = useMemo(
    () => (deleteFieldId ? dependentFormulaLabels(state, deleteFieldId, projectId) : []),
    [deleteFieldId, projectId, state],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedFieldId(initialFieldId || fields[0]?.id || "");
    setActiveTab(0);
  }, [initialFieldId, open, projectId]);

  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0];

  const updateConfig = (
    field: ProjectFieldDefinition,
    patch: Partial<ProjectMonthlyFieldConfig>,
  ) => {
    updateState((current) => {
      const existing = projectMonthlyFieldConfig(current, projectId, field.id);
      const saved = { projectId, fieldId: field.id, ...existing, ...patch };
      return {
        ...current,
        projectMonthlyFieldConfigs: [
          ...current.projectMonthlyFieldConfigs.filter(
            (config) => !(config.projectId === projectId && config.fieldId === field.id),
          ),
          saved,
        ],
      };
    });
  };

  const resetToTemplate = (field: ProjectFieldDefinition) => {
    updateState((current) => ({
      ...current,
      projectMonthlyFieldConfigs: current.projectMonthlyFieldConfigs.filter(
        (config) => !(config.projectId === projectId && config.fieldId === field.id),
      ),
      formulaOverrides: current.formulaOverrides.filter(
        (override) => !(override.projectId === projectId && override.fieldId === field.id),
      ),
    }));
  };

  const updateLayout = (
    current: KkvState,
    updater: (layout: ProjectMonthlyLayout) => ProjectMonthlyLayout,
  ) => {
    const effective = monthlyLayoutForProject(current, projectId);
    const next = updater({
      projectId,
      rows: effective.rows.map((row) => ({ ...row })),
      placements: effective.placements.map((placement) => ({ ...placement })),
    });
    return {
      ...current,
      projectMonthlyLayouts: [
        ...current.projectMonthlyLayouts.filter((layout) => layout.projectId !== projectId),
        next,
      ],
    };
  };

  const moveLayoutField = (fieldId: string, rowId: string, beforeFieldId?: string) =>
    updateState((current) =>
      updateLayout(current, (layout) => moveMonthlyField(layout, fieldId, rowId, beforeFieldId)),
    );

  const moveLayoutRow = (rowId: string, beforeRowId: string) =>
    updateState((current) =>
      updateLayout(current, (layout) => moveMonthlyRow(layout, rowId, beforeRowId)),
    );

  const addLayoutRow = () =>
    updateState((current) =>
      updateLayout(current, (layout) => addMonthlyRow(layout, createClientId("layout-row"))),
    );

  const deleteLayoutRow = (rowId: string) =>
    updateState((current) =>
      updateLayout(current, (layout) => deleteEmptyMonthlyRow(layout, rowId)),
    );

  const resetLayout = () => {
    updateState((current) => ({
      ...current,
      projectMonthlyLayouts: current.projectMonthlyLayouts.filter(
        (layout) => layout.projectId !== projectId,
      ),
    }));
    showToast("Đã khôi phục bố cục hàng theo mẫu đang áp dụng.");
  };

  const softDeleteField = () => {
    if (!deleteField || !isProjectOwnedField(deleteField, projectId)) return;
    if (deleteDependencies.length > 0) return;
    updateState((current) => ({
      ...current,
      fieldDefinitions: current.fieldDefinitions.map((field) =>
        field.id === deleteField.id ? { ...field, deletedAt: new Date().toISOString() } : field,
      ),
    }));
    setDeleteFieldId("");
    setSelectedFieldId(fields.find((field) => field.id !== deleteField.id)?.id ?? "");
    showToast(`Đã chuyển “${deleteField.label}” vào mục Đã xóa. Dữ liệu vẫn được giữ.`);
  };

  const restoreField = (field: ProjectFieldDefinition) => {
    updateState((current) => ({
      ...current,
      fieldDefinitions: current.fieldDefinitions.map((candidate) =>
        candidate.id === field.id ? { ...candidate, deletedAt: undefined } : candidate,
      ),
    }));
    setActiveTab(0);
    setSelectedFieldId(field.id);
    showToast(`Đã khôi phục “${field.label}”.`);
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        slotProps={{ paper: { sx: { width: { xs: "100%", lg: 980 }, maxWidth: "100%" } } }}
      >
        <Stack sx={{ height: "100%" }}>
          <Stack
            direction="row"
            sx={{ p: 2, alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6">Quản lý hàng dữ liệu 12 tháng</Typography>
            </Box>
            {activeTab === 0 && (
              <Button
                startIcon={<AddRounded />}
                variant="contained"
                onClick={() => setCreating(true)}
              >
                Tạo trường riêng
              </Button>
            )}
            <IconButton aria-label="Đóng" onClick={onClose}>
              <CloseRounded />
            </IconButton>
          </Stack>

          <Tabs
            value={activeTab}
            onChange={(_, value: number) => setActiveTab(value)}
            aria-label="Nội dung quản lý hàng dữ liệu 12 tháng"
            sx={{ mt: 1, px: 2, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab label={`Cấu hình hàng (${fields.length})`} />
            <Tab label="Sắp xếp hiển thị" />
            <Tab label={`Đã xóa (${deletedFields.length})`} />
          </Tabs>

          {activeTab === 0 && (
            <Box sx={{ minHeight: 0, flex: 1, overflow: "auto" }}>
              <Alert severity="info" sx={{ mx: 2, mt: 2 }}>
                Tắt một hàng chỉ xóa hàng khỏi bảng của dự án này. Giá trị và công thức đã lưu vẫn
                được giữ để có thể bật lại sau.
              </Alert>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "330px minmax(0, 1fr)" },
                  gap: 2,
                  p: 2,
                }}
              >
                <ProjectFieldList
                  state={state}
                  projectId={projectId}
                  fields={fields}
                  selectedFieldId={selectedField?.id ?? ""}
                  onSelect={setSelectedFieldId}
                  onVisibilityChange={(field, visible) => updateConfig(field, { visible })}
                />
                <ProjectFieldEditor
                  state={state}
                  projectId={projectId}
                  field={selectedField}
                  onChange={updateConfig}
                  onDefinitionChange={() => undefined}
                  onConfigureFormula={(field) => onConfigureFormula(field.id)}
                  onResetToTemplate={resetToTemplate}
                  onDelete={(field) => setDeleteFieldId(field.id)}
                />
              </Box>
            </Box>
          )}

          {activeTab === 1 && (
            <Box sx={{ minHeight: 0, flex: 1, overflow: "auto", p: 2 }}>
              <MonthlyLayoutPreview
                state={state}
                projectId={projectId}
                onMoveField={moveLayoutField}
                onMoveRow={moveLayoutRow}
                onAddRow={addLayoutRow}
                onDeleteRow={deleteLayoutRow}
                onResetLayout={resetLayout}
              />
            </Box>
          )}

          {activeTab === 2 && (
            <Box sx={{ minHeight: 0, flex: 1, overflow: "auto", p: 2 }}>
              <Stack spacing={1.5}>
                <Alert severity="info">
                  Chỉ hàng riêng của dự án mới có thể xóa. Dữ liệu và công thức được giữ cho đến khi
                  hàng được khôi phục.
                </Alert>
                {!deletedFields.length ? (
                  <Alert severity="info">Chưa có hàng dữ liệu riêng nào đã xóa.</Alert>
                ) : (
                  deletedFields.map((field) => (
                    <Paper
                      key={field.id}
                      variant="outlined"
                      sx={{ p: 1.5, display: "flex", gap: 1.5, alignItems: "center" }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 750 }}>
                          {field.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Hàng riêng · Đã xóa mềm
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RestoreFromTrashRounded />}
                        onClick={() => restoreField(field)}
                      >
                        Khôi phục
                      </Button>
                    </Paper>
                  ))
                )}
              </Stack>
            </Box>
          )}

          <Box sx={{ p: 2, mt: "auto", borderTop: 1, borderColor: "divider", textAlign: "right" }}>
            <Button onClick={onClose}>Xong</Button>
          </Box>
        </Stack>
      </Drawer>

      {creating && (
        <CreateMonthlyFieldDialog
          state={state}
          projectId={projectId}
          updateState={updateState}
          onClose={() => setCreating(false)}
          onCreated={(field) => {
            setCreating(false);
            setSelectedFieldId(field.id);
          }}
        />
      )}

      <Dialog
        open={Boolean(deleteField)}
        onClose={() => setDeleteFieldId("")}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Xóa hàng dữ liệu riêng?</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography>
              <strong>{deleteField?.label}</strong>
            </Typography>
            <Alert severity="warning">
              Hàng sẽ được chuyển vào mục Đã xóa. Giá trị, cấu hình và công thức vẫn được giữ để có
              thể khôi phục.
            </Alert>
            {deleteDependencies.length > 0 && (
              <Alert severity="error">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Các công thức sau vẫn đang tham chiếu hàng này:
                </Typography>
                <Box component="ul" sx={{ mt: 0.75, mb: 0, pl: 2.25 }}>
                  {deleteDependencies.map((label) => (
                    <li key={label}>
                      <Typography variant="body2">{label}</Typography>
                    </li>
                  ))}
                </Box>
                <Typography variant="body2" sx={{ mt: 0.75 }}>
                  Hãy sửa các công thức này trước khi xóa hàng.
                </Typography>
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFieldId("")}>Hủy</Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteOutlineRounded />}
            disabled={deleteDependencies.length > 0}
            onClick={softDeleteField}
          >
            Chuyển vào Đã xóa
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function CreateMonthlyFieldDialog({
  state,
  projectId,
  updateState,
  onClose,
  onCreated,
}: {
  state: KkvState;
  projectId: string;
  updateState: UpdateKkvState;
  onClose: () => void;
  onCreated: (field: ProjectFieldDefinition) => void;
}) {
  const project = state.projects.find((item) => item.id === projectId);
  const [label, setLabel] = useState("");
  const [semanticType, setSemanticType] = useState<SemanticType>("Number");
  const [suffix, setSuffix] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [summaryMetricId, setSummaryMetricId] = useState("");
  const [error, setError] = useState("");
  const existingCodes = useMemo(
    () => state.fieldDefinitions.map((field) => field.code),
    [state.fieldDefinitions],
  );
  const usedSummaryMetricIds = useMemo(
    () =>
      new Set(
        monthlyFieldsForProject(state, projectId).flatMap((field) => {
          const metricId = effectiveMonthlySummaryMetricId(state, projectId, field.id);
          return metricId ? [metricId] : [];
        }),
      ),
    [projectId, state],
  );

  const save = () => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      setError("Tên hàng không được để trống.");
      return;
    }
    const visibleFields = monthlyFieldsForProject(state, projectId);
    const sortOrder = Math.max(0, ...visibleFields.map((field) => field.sortOrder)) + 10;
    const rowIndex = Math.max(0, ...visibleFields.map((field) => field.rowIndex)) + 1;
    const code = createTechnicalCode(
      `${project?.code ?? "project"} ${normalizedLabel}`,
      existingCodes,
    );
    const field = normalizeFieldBehavior({
      id: createClientId("monthly-field"),
      code,
      label: normalizedLabel,
      scope: "monthly",
      ownerType: "project",
      ownerId: projectId,
      columnType: "standalone",
      semanticType,
      displayMode: displayModesForField(semanticType, "monthly")[0],
      inputMode,
      suffix: suffix.trim() || undefined,
      rowIndex,
      sortOrder,
      errorPolicy: { useDefaultValue: false, defaultValue: 0 },
    });
    const config: ProjectMonthlyFieldConfig = {
      projectId,
      fieldId: field.id,
      visible: true,
      allowedColumnIds: state.monthlyColumns.map((column) => column.id),
      summaryMetricId: summaryMetricId || null,
    };
    updateState((current) => {
      const inheritedLayout = monthlyLayoutForProject(current, projectId);
      const rows = inheritedLayout.rows.length
        ? structuredClone(inheritedLayout.rows)
        : [{ id: createClientId("layout-row"), sortOrder: 10 }];
      const targetRow = [...rows].sort((a, b) => a.sortOrder - b.sortOrder).at(-1)!;
      const layout: ProjectMonthlyLayout = {
        projectId,
        rows,
        placements: [
          ...structuredClone(inheritedLayout.placements),
          {
            fieldId: field.id,
            rowId: targetRow.id,
            sortOrder:
              Math.max(0, ...inheritedLayout.placements.map((item) => item.sortOrder)) + 10,
          },
        ],
      };
      return {
        ...current,
        fieldDefinitions: [...current.fieldDefinitions, field],
        projectMonthlyFieldConfigs: [...current.projectMonthlyFieldConfigs, config],
        projectMonthlyLayouts: [
          ...current.projectMonthlyLayouts.filter((item) => item.projectId !== projectId),
          layout,
        ],
      };
    });
    onCreated(field);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Tạo trường dữ liệu riêng cho dự án</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="warning">{error}</Alert>}
          <TextField
            autoFocus
            label="Tên hàng"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <TextField
            select
            label="Kiểu dữ liệu"
            value={semanticType}
            onChange={(event) => setSemanticType(event.target.value as SemanticType)}
          >
            {semanticTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {semanticTypeLabel(type)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Hậu tố"
            value={suffix}
            onChange={(event) => setSuffix(event.target.value)}
            placeholder="Ví dụ: %, USD, pcs, giờ"
          />
          <TextField
            select
            label="Cách nhập dữ liệu"
            value={inputMode}
            onChange={(event) => setInputMode(event.target.value as InputMode)}
          >
            <MenuItem value="manual">Nhập trực tiếp theo tháng</MenuItem>
            <MenuItem value="formula">Tính bằng công thức</MenuItem>
          </TextField>
          <TextField
            select
            label="Chỉ tiêu trên bảng tổng hợp"
            value={summaryMetricId}
            onChange={(event) => setSummaryMetricId(event.target.value)}
            helperText="Có thể để trống nếu hàng này chỉ dùng riêng trong dự án."
          >
            <MenuItem value="">Không đưa lên bảng tổng hợp</MenuItem>
            {[...state.monthlySummaryMetrics]
              .filter((metric) => metric.enabled)
              .sort((first, second) => first.sortOrder - second.sortOrder)
              .map((metric) => (
                <MenuItem
                  key={metric.id}
                  value={metric.id}
                  disabled={usedSummaryMetricIds.has(metric.id)}
                >
                  {metric.label}
                  {usedSummaryMetricIds.has(metric.id) ? " · Đã được sử dụng" : ""}
                </MenuItem>
              ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={save}>
          Tạo trường
        </Button>
      </DialogActions>
    </Dialog>
  );
}
