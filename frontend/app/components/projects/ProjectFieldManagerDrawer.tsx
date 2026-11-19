import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRounded from "@mui/icons-material/ArrowUpwardRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import FunctionsRounded from "@mui/icons-material/FunctionsRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import RestoreFromTrashRounded from "@mui/icons-material/RestoreFromTrashRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import type {
  InputMode,
  KkvState,
  ProjectFieldConfig,
  ProjectFieldDefinition,
  SemanticType,
} from "../../domain/types";
import {
  effectiveProjectField,
  effectiveProjectSummaryColumn,
  projectFieldConfig,
  projectFieldDefinitionsForProject,
  projectFieldsForProject,
} from "../../domain/metadata";
import { displayModesForField, normalizeFieldBehavior } from "../../domain/field-behavior";
import { createClientId } from "../../utils/id";
import { isProjectOwnedField } from "../../domain/field-ownership";
import { createTechnicalCode } from "../../utils/technical-code";
import { displayModeLabel, inputModeLabel } from "../../domain/field-labels";
import { useToast } from "../../context/toast-context";
import { dependentFormulaLabels as findDependentFormulaLabels } from "../../domain/field-deletion";

type UpdateKkvState = (updater: (state: KkvState) => KkvState) => void;

const semanticOptions: { value: SemanticType; label: string }[] = [
  { value: "Number", label: "Số" },
  { value: "Text", label: "Văn bản" },
  { value: "Date", label: "Ngày" },
  { value: "Boolean", label: "Có / Không" },
];

function displayModeForType(type: SemanticType): ProjectFieldDefinition["displayMode"] {
  if (type === "Text") return "text";
  if (type === "Date") return "date";
  if (type === "Boolean") return "badge";
  return "number";
}

export function ProjectFieldManagerDrawer({
  open,
  state,
  projectId,
  updateState,
  onClose,
  onAdded,
  onConfigureFormula,
}: {
  open: boolean;
  state: KkvState;
  projectId: string;
  updateState: UpdateKkvState;
  onClose: () => void;
  onAdded: (fieldId: string, inputMode: InputMode) => void;
  onConfigureFormula: (fieldId: string) => void;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"active" | "library" | "deleted" | "custom">("active");
  const [editingFieldId, setEditingFieldId] = useState("");
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [semanticType, setSemanticType] = useState<SemanticType>("Number");
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [summaryProjectColumnId, setSummaryProjectColumnId] = useState("");
  const [error, setError] = useState("");
  const [deleteFieldId, setDeleteFieldId] = useState("");
  const project = state.projects.find((candidate) => candidate.id === projectId);
  const allProjectFields = projectFieldDefinitionsForProject(state, projectId);
  const summaryColumns = [...state.summaryProjectColumns].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
  const activeFields = projectFieldsForProject(state, projectId);
  const deletedFields = state.fieldDefinitions
    .filter(
      (field) =>
        field.scope === "project" && field.deletedAt && isProjectOwnedField(field, projectId),
    )
    .sort((first, second) => first.sortOrder - second.sortOrder);
  const availableFields = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    return allProjectFields.filter((field) => {
      const config = projectFieldConfig(state, projectId, field.id);
      if (config?.visible) return false;
      return !keyword || `${field.label} ${field.id}`.toLocaleLowerCase("vi").includes(keyword);
    });
  }, [allProjectFields, projectId, query, state]);
  const deleteField = state.fieldDefinitions.find((field) => field.id === deleteFieldId);
  const deleteFieldIsPrivate = deleteField ? isProjectOwnedField(deleteField, projectId) : false;

  const dependentFormulaLabels = useMemo(() => {
    if (!deleteFieldId) return [];
    return findDependentFormulaLabels(state, deleteFieldId, projectId);
  }, [deleteFieldId, projectId, state]);

  const updateActiveConfig = (fieldId: string, patch: Partial<ProjectFieldConfig>) => {
    updateState((current) => {
      const existing = current.projectFieldConfigs.find(
        (config) => config.projectId === projectId && config.fieldId === fieldId,
      );
      const nextConfigs = current.projectFieldConfigs.map((config) => {
        if (
          patch.summaryProjectColumnId &&
          config.projectId === projectId &&
          config.fieldId !== fieldId &&
          config.summaryProjectColumnId === patch.summaryProjectColumnId
        ) {
          return { ...config, summaryProjectColumnId: null };
        }
        return config;
      });
      const saved = { projectId, fieldId, ...existing, ...patch };
      return {
        ...current,
        projectFieldConfigs: existing
          ? nextConfigs.map((config) =>
              config.projectId === projectId && config.fieldId === fieldId ? saved : config,
            )
          : [...nextConfigs, saved],
      };
    });
  };

  const updatePrivateDefinition = (
    field: ProjectFieldDefinition,
    patch: Partial<ProjectFieldDefinition>,
  ) => {
    if (!isProjectOwnedField(field, projectId)) return;
    updateState((current) => {
      const clearFormula = patch.inputMode != null && patch.inputMode !== "formula";
      return {
        ...current,
        fieldDefinitions: current.fieldDefinitions.map((candidate) =>
          candidate.id === field.id
            ? normalizeFieldBehavior({
                ...candidate,
                ...patch,
                ownerType: "project",
                ownerId: projectId,
                scope: "project",
                formula: clearFormula ? undefined : candidate.formula,
                columnFormulas: clearFormula ? undefined : candidate.columnFormulas,
              })
            : candidate,
        ),
        projectFormulaOverrides: clearFormula
          ? current.projectFormulaOverrides.filter(
              (override) => !(override.projectId === projectId && override.fieldId === field.id),
            )
          : current.projectFormulaOverrides,
      };
    });
  };

  const confirmDeleteField = () => {
    if (!deleteField || !deleteFieldIsPrivate) return;
    if (dependentFormulaLabels.length > 0) return;

    updateState((current) => ({
      ...current,
      fieldDefinitions: current.fieldDefinitions.map((field) =>
        field.id === deleteField.id ? { ...field, deletedAt: new Date().toISOString() } : field,
      ),
    }));
    showToast(`Đã chuyển “${deleteField.label}” vào mục Đã xóa. Dữ liệu vẫn được giữ.`);
    setDeleteFieldId("");
    setEditingFieldId("");
  };

  const restoreDeletedField = (field: ProjectFieldDefinition) => {
    updateState((current) => ({
      ...current,
      fieldDefinitions: current.fieldDefinitions.map((candidate) =>
        candidate.id === field.id ? { ...candidate, deletedAt: undefined } : candidate,
      ),
    }));
    showToast(`Đã khôi phục “${field.label}”.`);
    setTab("active");
    setEditingFieldId(field.id);
  };

  const moveActiveField = (fieldId: string, direction: -1 | 1) => {
    const index = activeFields.findIndex((field) => field.id === fieldId);
    const otherField = activeFields[index + direction];
    if (index < 0 || !otherField) return;
    const currentConfig = projectFieldConfig(state, projectId, fieldId);
    const otherConfig = projectFieldConfig(state, projectId, otherField.id);
    updateActiveConfig(fieldId, {
      sortOrder: otherConfig?.sortOrder ?? otherField.sortOrder,
    });
    updateActiveConfig(otherField.id, {
      sortOrder: currentConfig?.sortOrder ?? activeFields[index].sortOrder,
    });
  };

  const addFromLibrary = (field: ProjectFieldDefinition) => {
    updateState((current) => {
      const existing = current.projectFieldConfigs.find(
        (config) => config.projectId === projectId && config.fieldId === field.id,
      );
      const maxOrder = Math.max(
        0,
        ...current.projectFieldConfigs
          .filter((config) => config.projectId === projectId && config.visible)
          .map((config) => config.sortOrder ?? 0),
      );
      const next: ProjectFieldConfig = {
        projectId,
        fieldId: field.id,
        visible: true,
        sortOrder: maxOrder + 10,
        displayLabel: existing?.displayLabel,
        displaySuffix: existing?.displaySuffix,
        summaryProjectColumnId: existing?.summaryProjectColumnId,
      };
      return {
        ...current,
        projectFieldConfigs: existing
          ? current.projectFieldConfigs.map((config) => (config === existing ? next : config))
          : [...current.projectFieldConfigs, next],
      };
    });
    showToast(`Đã thêm “${field.label}” vào dự án.`);
    setError("");
    setTab("active");
    setEditingFieldId(field.id);
    onAdded(field.id, field.inputMode);
  };

  const createPrivateField = () => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      setError("Tên chỉ tiêu không được để trống.");
      return;
    }
    if (inputMode === "formula" && semanticType !== "Number") {
      setError("Chỉ tiêu tự tính hiện chỉ hỗ trợ kiểu Số.");
      return;
    }

    const createdCode = createTechnicalCode(
      `${project?.code ?? "project"} ${normalizedLabel}`,
      state.fieldDefinitions.map((field) => field.code),
    );
    const createdFieldId = createClientId("project-field");
    updateState((current) => {
      const sortOrder =
        Math.max(
          0,
          ...current.fieldDefinitions
            .filter((field) => field.scope === "project" && isProjectOwnedField(field, projectId))
            .map((field) => field.sortOrder),
        ) + 10;
      const definition = normalizeFieldBehavior({
        id: createdFieldId,
        code: createdCode,
        label: normalizedLabel,
        scope: "project" as const,
        ownerType: "project" as const,
        ownerId: projectId,
        columnType: "standalone" as const,
        semanticType,
        displayMode: displayModeForType(semanticType),
        inputMode,
        rowIndex: 2,
        sortOrder,
        errorPolicy: { useDefaultValue: false, defaultValue: 0 },
      });
      const configs = current.projectFieldConfigs.map((config) =>
        summaryProjectColumnId &&
        config.projectId === projectId &&
        config.summaryProjectColumnId === summaryProjectColumnId
          ? { ...config, summaryProjectColumnId: undefined }
          : config,
      );
      return {
        ...current,
        fieldDefinitions: [...current.fieldDefinitions, definition],
        projectFieldConfigs: [
          ...configs,
          {
            projectId,
            fieldId: createdFieldId,
            visible: true,
            sortOrder,
            displayLabel: normalizedLabel,
            summaryProjectColumnId: summaryProjectColumnId || undefined,
          },
        ],
      };
    });
    showToast(
      inputMode === "formula"
        ? `Đã tạo “${normalizedLabel}”. Hãy cấu hình công thức cho chỉ tiêu này trong Trình tạo công thức.`
        : `Đã tạo “${normalizedLabel}”. Bạn có thể nhập giá trị ngay trên dự án.`,
    );
    setError("");
    setLabel("");
    setSummaryProjectColumnId("");
    setTab("active");
    setEditingFieldId(createdFieldId);
    onAdded(createdFieldId, inputMode);
  };

  const resetToTemplate = (fieldId: string) => {
    updateState((current) => ({
      ...current,
      projectFieldConfigs: current.projectFieldConfigs.filter(
        (config) => !(config.projectId === projectId && config.fieldId === fieldId),
      ),
      projectFormulaOverrides: current.projectFormulaOverrides.filter(
        (override) => !(override.projectId === projectId && override.fieldId === fieldId),
      ),
    }));
    setEditingFieldId("");
    showToast("Đã khôi phục tên, hậu tố, vị trí và công thức theo mẫu.");
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        slotProps={{ paper: { sx: { width: { xs: "100%", sm: 680 }, maxWidth: "100%" } } }}
      >
        <Stack sx={{ height: "100%" }}>
          <Box sx={{ p: 2.5, pb: 1.5 }}>
            <Typography variant="h5">Quản lý chỉ tiêu dự án</Typography>
            <Typography variant="body2" color="text.secondary">
              {project?.code} · {project?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activeFields.length} chỉ tiêu ·{" "}
              {state.projectFieldTemplates.find((item) => item.id === project?.templateId)?.label ??
                "Tự cấu hình"}
            </Typography>
          </Box>

          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2 }}>
            <Tab value="active" label="Đang sử dụng" />
            <Tab value="library" label="Chỉ tiêu đang ẩn" />
            <Tab value="deleted" label={`Đã xóa (${deletedFields.length})`} />
            <Tab value="custom" label="Tạo chỉ tiêu riêng" />
          </Tabs>

          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            <Stack spacing={2}>
              {error && (
                <Alert severity="warning" onClose={() => setError("")}>
                  {error}
                </Alert>
              )}
              {tab === "active" ? (
                !activeFields.length ? (
                  <Alert severity="info">
                    Dự án chưa có chỉ tiêu. Hãy chọn mẫu có sẵn hoặc tạo chỉ tiêu riêng.
                  </Alert>
                ) : (
                  activeFields.map((field, index) => {
                    const config = projectFieldConfig(state, projectId, field.id);
                    const inherited = !isProjectOwnedField(field, projectId);
                    const mappedColumn = summaryColumns.find(
                      (candidate) =>
                        candidate.id === effectiveProjectSummaryColumn(state, projectId, field.id),
                    );
                    const mappedLabel = mappedColumn
                      ? `${mappedColumn.label}${mappedColumn.enabled ? "" : " (đang ẩn)"}`
                      : undefined;
                    const editing = editingFieldId === field.id;
                    return (
                      <Paper key={field.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Stack spacing={1.5}>
                          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 750 }}>
                                {field.label}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {mappedLabel
                                  ? `Bảng tổng hợp: ${mappedLabel}`
                                  : "Chỉ dùng trong dự án"}
                              </Typography>
                            </Box>
                            <Tooltip title="Đưa lên trên">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={index === 0}
                                  onClick={() => moveActiveField(field.id, -1)}
                                >
                                  <ArrowUpwardRounded fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Đưa xuống dưới">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={index === activeFields.length - 1}
                                  onClick={() => moveActiveField(field.id, 1)}
                                >
                                  <ArrowDownwardRounded fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Chỉnh chỉ tiêu">
                              <IconButton
                                size="small"
                                color={editing ? "primary" : "default"}
                                onClick={() => setEditingFieldId(editing ? "" : field.id)}
                              >
                                <EditRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                          {editing && (
                            <Stack spacing={1.25}>
                              <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
                                <Chip
                                  size="small"
                                  color={
                                    isProjectOwnedField(field, projectId)
                                      ? "secondary"
                                      : config
                                        ? "warning"
                                        : "default"
                                  }
                                  label={
                                    isProjectOwnedField(field, projectId)
                                      ? "Chỉ tiêu riêng của dự án"
                                      : config
                                        ? "Đã tùy chỉnh so với mẫu"
                                        : "Theo mẫu"
                                  }
                                />
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={inputModeLabel(field.inputMode)}
                                />
                              </Stack>
                              <TextField
                                size="small"
                                label="Tên hiển thị trong dự án"
                                value={config?.displayLabel ?? field.label}
                                onChange={(event) =>
                                  updateActiveConfig(field.id, {
                                    displayLabel: event.target.value,
                                  })
                                }
                              />
                              <TextField
                                select
                                size="small"
                                label="Vị trí trên bảng tổng hợp"
                                value={
                                  effectiveProjectSummaryColumn(state, projectId, field.id) ?? ""
                                }
                                onChange={(event) =>
                                  updateActiveConfig(field.id, {
                                    summaryProjectColumnId: event.target.value || null,
                                  })
                                }
                              >
                                <MenuItem value="">Không đưa lên bảng tổng hợp</MenuItem>
                                {summaryColumns.map((candidate) => (
                                  <MenuItem
                                    key={candidate.id}
                                    value={candidate.id}
                                    disabled={!candidate.enabled}
                                  >
                                    {candidate.label}
                                    {!candidate.enabled ? " (đang ẩn)" : ""}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <Box
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                                  gap: 1.25,
                                }}
                              >
                                <TextField
                                  select
                                  size="small"
                                  label="Kiểu dữ liệu"
                                  value={field.semanticType}
                                  disabled={!isProjectOwnedField(field, projectId)}
                                  helperText={
                                    isProjectOwnedField(field, projectId)
                                      ? "Có thể thay đổi vì đây là chỉ tiêu riêng."
                                      : "Kiểu dữ liệu do mẫu quản lý."
                                  }
                                  onChange={(event) => {
                                    const nextType = event.target.value as SemanticType;
                                    updatePrivateDefinition(field, {
                                      semanticType: nextType,
                                      displayMode: displayModesForField(nextType, "project")[0],
                                      inputMode:
                                        field.inputMode === "formula" && nextType !== "Number"
                                          ? "manual"
                                          : field.inputMode,
                                    });
                                  }}
                                >
                                  {semanticOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                      {option.label}
                                    </MenuItem>
                                  ))}
                                </TextField>
                                <TextField
                                  select
                                  size="small"
                                  label="Cách hiển thị"
                                  value={field.displayMode}
                                  disabled={!isProjectOwnedField(field, projectId)}
                                  onChange={(event) =>
                                    updatePrivateDefinition(field, {
                                      displayMode: event.target
                                        .value as ProjectFieldDefinition["displayMode"],
                                    })
                                  }
                                >
                                  {displayModesForField(field.semanticType, "project").map(
                                    (mode) => (
                                      <MenuItem key={mode} value={mode}>
                                        {displayModeLabel(mode)}
                                      </MenuItem>
                                    ),
                                  )}
                                </TextField>
                                <TextField
                                  select
                                  size="small"
                                  label="Cách nhập"
                                  value={field.inputMode}
                                  disabled={!isProjectOwnedField(field, projectId)}
                                  onChange={(event) =>
                                    updatePrivateDefinition(field, {
                                      inputMode: event.target.value as InputMode,
                                    })
                                  }
                                >
                                  <MenuItem value="manual">Nhập tay</MenuItem>
                                  <MenuItem
                                    value="formula"
                                    disabled={field.semanticType !== "Number"}
                                  >
                                    Tự tính bằng công thức
                                  </MenuItem>
                                </TextField>
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Số chữ số thập phân"
                                  value={field.displayPrecision ?? 0}
                                  disabled={
                                    !isProjectOwnedField(field, projectId) ||
                                    field.semanticType !== "Number"
                                  }
                                  slotProps={{ htmlInput: { min: 0, max: 8, step: 1 } }}
                                  onChange={(event) =>
                                    updatePrivateDefinition(field, {
                                      displayPrecision: Math.min(
                                        8,
                                        Math.max(0, Number(event.target.value) || 0),
                                      ),
                                    })
                                  }
                                />
                              </Box>

                              {field.inputMode === "formula" && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<FunctionsRounded />}
                                  onClick={() => onConfigureFormula(field.id)}
                                  sx={{ alignSelf: "flex-start" }}
                                >
                                  Cấu hình công thức
                                </Button>
                              )}

                              <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1 }}>
                                <Button
                                  size="small"
                                  color="warning"
                                  startIcon={<VisibilityOffRounded />}
                                  onClick={() => {
                                    updateActiveConfig(field.id, {
                                      visible: false,
                                      summaryProjectColumnId: null,
                                    });
                                    setEditingFieldId("");
                                  }}
                                >
                                  Ẩn khỏi dự án
                                </Button>
                                {isProjectOwnedField(field, projectId) && (
                                  <Button
                                    size="small"
                                    color="error"
                                    startIcon={<DeleteOutlineRounded />}
                                    onClick={() => setDeleteFieldId(field.id)}
                                  >
                                    Xóa chỉ tiêu
                                  </Button>
                                )}
                                {inherited && config && (
                                  <Button size="small" onClick={() => resetToTemplate(field.id)}>
                                    Khôi phục theo mẫu
                                  </Button>
                                )}
                              </Stack>
                            </Stack>
                          )}
                        </Stack>
                      </Paper>
                    );
                  })
                )
              ) : tab === "library" ? (
                <>
                  <TextField
                    size="small"
                    label="Tìm chỉ tiêu"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nhập tên chỉ tiêu"
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
                  {!availableFields.length ? (
                    <Alert severity="info">Không có chỉ tiêu nào của mẫu đang bị ẩn.</Alert>
                  ) : (
                    availableFields.map((rawField) => {
                      const field = effectiveProjectField(state, projectId, rawField);
                      return (
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
                              {field.inputMode === "formula" ? "Tự tính" : "Nhập tay"}
                              {field.suffix ? ` · ${field.suffix}` : ""}
                            </Typography>
                          </Box>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AddRounded />}
                            onClick={() => addFromLibrary(field)}
                          >
                            Bật lại
                          </Button>
                          {isProjectOwnedField(field, projectId) && (
                            <Button
                              size="small"
                              color="error"
                              onClick={() => setDeleteFieldId(field.id)}
                            >
                              Xóa
                            </Button>
                          )}
                        </Paper>
                      );
                    })
                  )}
                </>
              ) : tab === "deleted" ? (
                !deletedFields.length ? (
                  <Alert severity="info">Chưa có chỉ tiêu riêng nào đã xóa.</Alert>
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
                          Đã xóa mềm · Dữ liệu và công thức vẫn được giữ
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RestoreFromTrashRounded />}
                        onClick={() => restoreDeletedField(field)}
                      >
                        Khôi phục
                      </Button>
                    </Paper>
                  ))
                )
              ) : (
                <Stack spacing={2}>
                  <Alert severity="info">
                    Chỉ tiêu tạo tại đây thuộc riêng dự án này. Sau khi tạo, chỉ tiêu sẽ xuất hiện
                    ngay trong phần thông tin và trong Trình tạo công thức của dự án.
                  </Alert>
                  <TextField
                    autoFocus
                    required
                    label="Tên chỉ tiêu"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Ví dụ: Chi phí vật liệu sau cải thiện"
                  />
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      gap: 1.5,
                    }}
                  >
                    <TextField
                      select
                      label="Kiểu dữ liệu"
                      value={semanticType}
                      onChange={(event) => {
                        const nextType = event.target.value as SemanticType;
                        setSemanticType(nextType);
                        if (nextType !== "Number") setInputMode("manual");
                      }}
                    >
                      {semanticOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Cách nhập"
                      value={inputMode}
                      onChange={(event) => setInputMode(event.target.value as InputMode)}
                    >
                      <MenuItem value="manual">Nhập tay</MenuItem>
                      <MenuItem value="formula" disabled={semanticType !== "Number"}>
                        Tự tính bằng công thức
                      </MenuItem>
                    </TextField>
                    <TextField
                      select
                      label="Vị trí trên bảng tổng hợp"
                      value={summaryProjectColumnId}
                      onChange={(event) => setSummaryProjectColumnId(event.target.value)}
                      sx={{ gridColumn: { sm: "1 / -1" } }}
                    >
                      <MenuItem value="">Chưa đưa lên bảng tổng hợp</MenuItem>
                      {summaryColumns.map((field) => (
                        <MenuItem key={field.id} value={field.id} disabled={!field.enabled}>
                          {field.label}
                          {!field.enabled ? " (đang ẩn)" : ""}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Button
                    variant="contained"
                    startIcon={<AddRounded />}
                    onClick={createPrivateField}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Tạo và thêm vào dự án
                  </Button>
                </Stack>
              )}
            </Stack>
          </Box>

          <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", textAlign: "right" }}>
            <Button onClick={onClose}>Xong</Button>
          </Box>
        </Stack>
      </Drawer>

      <Dialog
        open={Boolean(deleteField)}
        onClose={() => setDeleteFieldId("")}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Xóa chỉ tiêu riêng?</DialogTitle>
        <DialogContent dividers>
          {deleteField && (
            <Stack spacing={1.5}>
              <Typography>
                <strong>{deleteField.label}</strong>
              </Typography>
              <>
                <Alert severity="warning">
                  Chỉ tiêu sẽ được chuyển vào mục Đã xóa. Giá trị, cấu hình và công thức của chỉ
                  tiêu vẫn được giữ để có thể khôi phục.
                </Alert>
                <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${state.fieldValues.filter((value) => value.projectId === projectId && value.fieldId === deleteField.id).length} giá trị đã lưu`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${state.projectFormulaOverrides.filter((override) => override.projectId === projectId && override.fieldId === deleteField.id).length} công thức riêng`}
                  />
                  {projectFieldConfig(state, projectId, deleteField.id)?.summaryProjectColumnId && (
                    <Chip size="small" color="info" label="Đang ánh xạ bảng tổng hợp" />
                  )}
                </Stack>
                {dependentFormulaLabels.length > 0 && (
                  <Alert severity="error">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {dependentFormulaLabels.length} công thức khác đang tham chiếu chỉ tiêu này:
                    </Typography>
                    <Box component="ul" sx={{ mt: 0.75, mb: 0, pl: 2.25 }}>
                      {dependentFormulaLabels.map((label) => (
                        <li key={label}>
                          <Typography variant="body2">{label}</Typography>
                        </li>
                      ))}
                    </Box>
                    <Typography variant="body2" sx={{ mt: 0.75 }}>
                      Hãy sửa các công thức này trước khi xóa chỉ tiêu.
                    </Typography>
                  </Alert>
                )}
              </>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFieldId("")}>Hủy</Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteOutlineRounded />}
            onClick={confirmDeleteField}
            disabled={!deleteFieldIsPrivate || dependentFormulaLabels.length > 0}
          >
            Chuyển vào Đã xóa
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
