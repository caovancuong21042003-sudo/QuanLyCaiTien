import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { Link } from "react-router";
import type {
  InputMode,
  KkvState,
  ProjectFieldDefinition,
  ProjectFieldTemplate,
  ProjectFieldTemplateItem,
  ProjectTemplateFieldItem,
  SemanticType,
} from "../../domain/types";
import {
  effectiveProjectSummaryColumn,
  effectiveMonthlySummaryMetricId,
  monthlyFieldColumns,
  monthlyFieldsForProject,
  monthlyLayoutForProject,
  projectFieldsForProject,
  projectsForYear,
} from "../../domain/metadata";
import { PROJECT_FIELD_BLUEPRINTS } from "../../domain/project-field-blueprints";
import { createClientId } from "../../utils/id";
import { createTechnicalCode } from "../../utils/technical-code";
import {
  displayModesForField,
  normalizeFieldBehavior,
  semanticTypes,
} from "../../domain/field-behavior";
import { inputModeLabel, semanticTypeLabel } from "../../domain/field-labels";

type UpdateKkvState = (updater: (state: KkvState) => KkvState) => void;

interface ConfigTemplatesTabProps {
  state: KkvState;
  updateState: UpdateKkvState;
}

export function ConfigTemplatesTab({ state, updateState }: ConfigTemplatesTabProps) {
  const [draft, setDraft] = useState<ProjectFieldTemplate | null>(null);
  const [draftDefinitions, setDraftDefinitions] = useState<ProjectFieldDefinition[]>([]);
  const [deleteTemplate, setDeleteTemplate] = useState<ProjectFieldTemplate | null>(null);
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const projects = projectsForYear(state);
  const sourceProject = projects.find((project) => project.id === sourceProjectId) ?? null;

  const openBlankTemplate = () => {
    setError(null);
    setDraft({
      id: "",
      label: "",
      description: "",
      projectFields: [],
      fields: [],
      monthlyLayout: { rows: [], placements: [] },
      formulas: [],
    });
    setDraftDefinitions([]);
  };

  const openFromProject = () => {
    if (!sourceProject) return;
    const fields = monthlyFieldsForProject(state, sourceProject.id).map<ProjectFieldTemplateItem>(
      (field) => ({
        fieldId: field.id,
        displayLabel: field.label,
        displaySuffix: field.suffix,
        allowedColumnIds: monthlyFieldColumns(state, sourceProject.id, field.id).map(
          (column) => column.id,
        ),
        summaryMetricId: effectiveMonthlySummaryMetricId(state, sourceProject.id, field.id),
      }),
    );
    const configuredProjectFields = projectFieldsForProject(
      state,
      sourceProject.id,
    ).map<ProjectTemplateFieldItem>((field) => ({
      fieldId: field.id,
      sortOrder: field.sortOrder,
      displayLabel: field.label,
      displaySuffix: field.suffix,
      summaryProjectColumnId: effectiveProjectSummaryColumn(state, sourceProject.id, field.id),
      visible: true,
    }));

    setError(null);
    setDraft({
      id: "",
      label: `Mẫu từ ${sourceProject.code}`,
      description: `Tạo từ cấu hình của dự án ${sourceProject.name}.`,
      projectFields: configuredProjectFields,
      fields,
      monthlyLayout: structuredClone(monthlyLayoutForProject(state, sourceProject.id)),
      formulas: structuredClone(
        state.projectFieldTemplates.find((template) => template.id === sourceProject.templateId)
          ?.formulas ?? [],
      ),
    });
    setDraftDefinitions(
      fields.flatMap((item) => {
        const definition = state.fieldDefinitions.find((field) => field.id === item.fieldId);
        return definition ? [structuredClone(definition)] : [];
      }),
    );
  };

  const saveTemplate = () => {
    if (!draft?.label.trim()) {
      setError("Tên mẫu không được để trống.");
      return;
    }

    const templateFieldIds = new Set([
      ...(draft.projectFields ?? []).map((item) => item.fieldId),
      ...draft.fields.map((item) => item.fieldId),
    ]);
    const saved: ProjectFieldTemplate = {
      ...draft,
      id: draft.id || createClientId("template"),
      label: draft.label.trim(),
      description: draft.description.trim(),
      projectFields: draft.projectFields ?? [],
      fields: [...draft.fields],
      monthlyLayout: normalizeTemplateLayout(draft),
      formulas: (draft.formulas ?? []).filter((item) => templateFieldIds.has(item.fieldId)),
    };

    updateState((current) => ({
      ...current,
      fieldDefinitions: [
        ...current.fieldDefinitions.filter(
          (field) => !draftDefinitions.some((definition) => definition.id === field.id),
        ),
        ...draftDefinitions,
      ],
      projectFieldTemplates: current.projectFieldTemplates.some(
        (template) => template.id === saved.id,
      )
        ? current.projectFieldTemplates.map((template) =>
            template.id === saved.id ? saved : template,
          )
        : [...current.projectFieldTemplates, saved],
    }));
    setDraft(null);
    setDraftDefinitions([]);
    setError(null);
  };

  const duplicateTemplate = (template: ProjectFieldTemplate) => {
    const copy = structuredClone(template);
    setDraft({ ...copy, id: "", label: `${copy.label} - bản sao` });
    setDraftDefinitions(
      copy.fields.flatMap((item) => {
        const definition = state.fieldDefinitions.find((field) => field.id === item.fieldId);
        return definition ? [structuredClone(definition)] : [];
      }),
    );
    setError(null);
  };

  const confirmDelete = () => {
    if (!deleteTemplate) return;
    const usingCount = state.projects.filter(
      (project) => project.templateId === deleteTemplate.id,
    ).length;
    if (usingCount) {
      setError(`Không thể xóa: có ${usingCount} dự án đang kế thừa công thức của mẫu này.`);
      setDeleteTemplate(null);
      return;
    }
    updateState((current) => ({
      ...current,
      projectFieldTemplates: current.projectFieldTemplates.filter(
        (template) => template.id !== deleteTemplate.id,
      ),
    }));
    setDeleteTemplate(null);
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">Mẫu cấu hình dự án</Typography>
        <Typography variant="body2" color="text.secondary">
          Mẫu lưu bố cục và công thức dùng chung. Dự án có thể chỉnh bố cục riêng; công thức mẫu chỉ
          áp dụng khi dự án chưa có công thức riêng.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 1, alignItems: { md: "center" } }}>
        <Button variant="contained" startIcon={<AddRounded />} onClick={openBlankTemplate}>
          Thêm mẫu
        </Button>
        <Autocomplete
          options={projects}
          value={sourceProject}
          getOptionLabel={(project) => `${project.code} · ${project.name}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_, project) => setSourceProjectId(project?.id ?? "")}
          renderInput={(params) => <TextField {...params} label="Lấy cấu hình từ dự án" />}
          sx={{ minWidth: { md: 360 } }}
        />
        <Button variant="outlined" disabled={!sourceProject} onClick={openFromProject}>
          Tạo mẫu từ dự án
        </Button>
      </Stack>

      {!state.projectFieldTemplates.length && (
        <Alert severity="info">
          Chưa có mẫu. Hãy tạo mẫu mới hoặc lấy từ một dự án đã cấu hình.
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          gap: 1.5,
        }}
      >
        {state.projectFieldTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            state={state}
            onEdit={() => {
              setError(null);
              setDraft(structuredClone(template));
              setDraftDefinitions(
                template.fields.flatMap((item) => {
                  const definition = state.fieldDefinitions.find(
                    (field) => field.id === item.fieldId,
                  );
                  return definition ? [structuredClone(definition)] : [];
                }),
              );
            }}
            onDuplicate={() => duplicateTemplate(template)}
            onDelete={() => setDeleteTemplate(template)}
          />
        ))}
      </Box>

      <TemplateDialog
        state={state}
        draft={draft}
        definitions={draftDefinitions}
        error={error}
        onChange={setDraft}
        onDefinitionsChange={setDraftDefinitions}
        onClose={() => {
          setDraft(null);
          setDraftDefinitions([]);
          setError(null);
        }}
        onSave={saveTemplate}
      />

      <Dialog open={Boolean(deleteTemplate)} onClose={() => setDeleteTemplate(null)} maxWidth="xs">
        <DialogTitle>Xóa mẫu?</DialogTitle>
        <DialogContent>
          <Typography>
            Mẫu “{deleteTemplate?.label}” sẽ bị xóa. Chỉ có thể xóa khi không còn dự án nào đang kế
            thừa mẫu.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTemplate(null)}>Hủy</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Xóa mẫu
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function TemplateCard({
  template,
  state,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: ProjectFieldTemplate;
  state: KkvState;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const labels = template.fields.map((item) => {
    const definition = state.fieldDefinitions.find((field) => field.id === item.fieldId);
    return item.displayLabel || definition?.label || item.fieldId;
  });
  const projectCount = state.projects.filter(
    (project) => project.templateId === template.id,
  ).length;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
          <Box>
            <Typography variant="h6">{template.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              {template.description || "Không có mô tả"}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={`${projectCount} dự án · ${template.formulas?.length ?? 0} công thức`}
          />
        </Stack>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {labels.length ? labels.join(" · ") : "Bảng trống để tự cấu hình"}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Công thức dùng chung được chỉnh tại tab “Công thức theo mẫu”.
        </Typography>
      </CardContent>
      <CardActions sx={{ justifyContent: "flex-end" }}>
        <Button
          size="small"
          component={Link}
          to={`/formulas?mode=template&templateId=${encodeURIComponent(template.id)}`}
        >
          Cấu hình công thức
        </Button>
        <Tooltip title="Nhân bản">
          <IconButton onClick={onDuplicate}>
            <ContentCopyRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Sửa mẫu">
          <IconButton onClick={onEdit}>
            <EditOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Xóa mẫu">
          <IconButton color="error" onClick={onDelete}>
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
}

function TemplateDialog({
  state,
  draft,
  definitions,
  error,
  onChange,
  onDefinitionsChange,
  onClose,
  onSave,
}: {
  state: KkvState;
  draft: ProjectFieldTemplate | null;
  definitions: ProjectFieldDefinition[];
  error: string | null;
  onChange: (draft: ProjectFieldTemplate | null) => void;
  onDefinitionsChange: (definitions: ProjectFieldDefinition[]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [definitionDraft, setDefinitionDraft] = useState<ProjectFieldDefinition | null>(null);
  const [definitionError, setDefinitionError] = useState("");
  const fields = useMemo(
    () =>
      draft?.fields.flatMap((item) => {
        const definition = definitions.find((field) => field.id === item.fieldId);
        return definition ? [definition] : [];
      }) ?? [],
    [definitions, draft?.fields],
  );
  const informationFields = PROJECT_FIELD_BLUEPRINTS;
  const summaryColumns = useMemo(
    () =>
      [...state.summaryProjectColumns].sort((first, second) => first.sortOrder - second.sortOrder),
    [state.summaryProjectColumns],
  );

  const updateProjectField = (
    field: ProjectFieldDefinition,
    updater: (item: ProjectTemplateFieldItem) => ProjectTemplateFieldItem,
  ) => {
    if (!draft) return;
    const existing = draft.projectFields?.find((item) => item.fieldId === field.id);
    if (!existing) return;
    const nextItem = updater(existing);
    onChange({
      ...draft,
      projectFields: (draft.projectFields ?? []).map((item) => {
        if (item.fieldId === field.id) return nextItem;
        if (
          nextItem.summaryProjectColumnId &&
          item.summaryProjectColumnId === nextItem.summaryProjectColumnId
        ) {
          return { ...item, summaryProjectColumnId: undefined };
        }
        return item;
      }),
    });
  };

  const toggleProjectField = (field: ProjectFieldDefinition, enabled: boolean) => {
    if (!draft) return;
    const current = draft.projectFields ?? [];
    if (!enabled) {
      onChange({
        ...draft,
        projectFields: current.filter((item) => item.fieldId !== field.id),
      });
      return;
    }
    onChange({
      ...draft,
      projectFields: [
        ...current,
        {
          fieldId: field.id,
          displayLabel: field.label,
          displaySuffix: field.suffix,
          summaryProjectColumnId: summaryColumns.some(
            (column) => column.enabled && column.code === field.id,
          )
            ? summaryColumns.find((column) => column.enabled && column.code === field.id)?.id
            : undefined,
          visible: true,
        },
      ],
    });
  };

  const updateField = (
    field: ProjectFieldDefinition,
    updater: (item: ProjectFieldTemplateItem) => ProjectFieldTemplateItem,
  ) => {
    if (!draft) return;
    const existing = draft.fields.find((item) => item.fieldId === field.id);
    if (!existing) return;
    onChange({
      ...draft,
      fields: draft.fields.map((item) => (item.fieldId === field.id ? updater(item) : item)),
    });
  };

  const openNewDefinition = () => {
    setDefinitionError("");
    setDefinitionDraft({
      id: "",
      code: "",
      label: "",
      scope: "monthly",
      ownerType: "library",
      columnType: "standalone",
      semanticType: "Number",
      displayMode: "number",
      inputMode: "manual",
      rowIndex: 1,
      sortOrder: Math.max(0, ...state.fieldDefinitions.map((field) => field.sortOrder)) + 10,
      errorPolicy: { useDefaultValue: false, defaultValue: 0 },
    });
  };

  const saveDefinition = () => {
    if (!draft || !definitionDraft) return;
    const label = definitionDraft.label.trim();
    if (!label) {
      setDefinitionError("Tên chỉ tiêu không được để trống.");
      return;
    }
    const existingCodes = [...state.fieldDefinitions, ...definitions]
      .filter((field) => field.id !== definitionDraft.id)
      .map((field) => field.code);
    const id = definitionDraft.id || createClientId("template-field");
    const saved = normalizeFieldBehavior({
      ...definitionDraft,
      id,
      code: definitionDraft.id
        ? definitionDraft.code
        : createTechnicalCode(label, existingCodes, definitionDraft.code),
      label,
      scope: "monthly",
      ownerType: "library",
      ownerId: undefined,
      columnType: "standalone",
    });
    const exists = definitions.some((field) => field.id === id);
    onDefinitionsChange(
      exists
        ? definitions.map((field) => (field.id === id ? saved : field))
        : [...definitions, saved],
    );
    if (!draft.fields.some((item) => item.fieldId === id)) {
      const rows = draft.monthlyLayout.rows.length
        ? draft.monthlyLayout.rows
        : [{ id: createClientId("template-row"), sortOrder: 10 }];
      const targetRow = [...rows].sort((a, b) => a.sortOrder - b.sortOrder).at(-1)!;
      onChange({
        ...draft,
        fields: [
          ...draft.fields,
          {
            fieldId: id,
            displayLabel: label,
            displaySuffix: saved.suffix,
            allowedColumnIds: state.monthlyColumns.map((column) => column.id),
          },
        ],
        monthlyLayout: {
          rows,
          placements: [
            ...draft.monthlyLayout.placements,
            {
              fieldId: id,
              rowId: targetRow.id,
              sortOrder:
                Math.max(
                  0,
                  ...draft.monthlyLayout.placements.map((placement) => placement.sortOrder),
                ) + 10,
            },
          ],
        },
      });
    }
    setDefinitionDraft(null);
    setDefinitionError("");
  };

  const removeTemplateField = (fieldId: string) => {
    if (!draft) return;
    onChange({
      ...draft,
      fields: draft.fields.filter((item) => item.fieldId !== fieldId),
      monthlyLayout: {
        ...draft.monthlyLayout,
        placements: draft.monthlyLayout.placements.filter(
          (placement) => placement.fieldId !== fieldId,
        ),
      },
      formulas: (draft.formulas ?? []).filter((formula) => formula.fieldId !== fieldId),
      disabledFormulaKeys: (draft.disabledFormulaKeys ?? []).filter(
        (key) => !key.startsWith(`${fieldId}::`),
      ),
    });
    if (!state.fieldDefinitions.some((field) => field.id === fieldId)) {
      onDefinitionsChange(definitions.filter((field) => field.id !== fieldId));
    }
  };

  const definitionIsShared = (fieldId: string) =>
    state.projectFieldTemplates.some(
      (template) =>
        template.id !== draft?.id && template.fields.some((item) => item.fieldId === fieldId),
    );

  const moveFieldToRow = (fieldId: string, requestedRow: number) => {
    if (!draft) return;
    const rowNumber = Math.max(1, requestedRow || 1);
    const rows = [...draft.monthlyLayout.rows].sort((a, b) => a.sortOrder - b.sortOrder);
    while (rows.length < rowNumber) {
      rows.push({ id: createClientId("template-row"), sortOrder: (rows.length + 1) * 10 });
    }
    const rowId = rows[rowNumber - 1].id;
    const placements = draft.monthlyLayout.placements.some(
      (placement) => placement.fieldId === fieldId,
    )
      ? draft.monthlyLayout.placements.map((placement) =>
          placement.fieldId === fieldId ? { ...placement, rowId } : placement,
        )
      : [
          ...draft.monthlyLayout.placements,
          {
            fieldId,
            rowId,
            sortOrder:
              Math.max(0, ...draft.monthlyLayout.placements.map((entry) => entry.sortOrder)) + 10,
          },
        ];
    onChange({ ...draft, monthlyLayout: { rows, placements } });
  };

  return (
    <Dialog open={Boolean(draft)} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{draft?.id ? "Sửa mẫu cấu hình" : "Thêm mẫu cấu hình"}</DialogTitle>
      {draft && (
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="warning">{error}</Alert>}
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <TextField
                required
                label="Tên mẫu"
                value={draft.label}
                onChange={(event) => onChange({ ...draft, label: event.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Mô tả"
                value={draft.description}
                onChange={(event) => onChange({ ...draft, description: event.target.value })}
                sx={{ flex: 2 }}
              />
            </Stack>

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
                Thông tin dự án và cột chung
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tên riêng giúp người dùng hiểu đúng nghiệp vụ; cột chung quyết định vị trí trên bảng
                tổng hợp.
              </Typography>
            </Box>
            <Stack spacing={1}>
              {informationFields.map((field) => {
                const item = draft.projectFields?.find((entry) => entry.fieldId === field.id);
                return (
                  <Card key={field.id} variant="outlined">
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={Boolean(item)}
                            onChange={(_, checked) => toggleProjectField(field, checked)}
                          />
                        }
                        label={field.label}
                      />
                      {item ? (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              md: "minmax(180px, 1fr) minmax(120px, .55fr) minmax(220px, 1fr)",
                            },
                            gap: 1,
                            pl: { md: 4 },
                          }}
                        >
                          <TextField
                            size="small"
                            label="Tên trong dự án"
                            value={item.displayLabel ?? ""}
                            onChange={(event) =>
                              updateProjectField(field, (current) => ({
                                ...current,
                                displayLabel: event.target.value,
                              }))
                            }
                          />
                          <TextField
                            size="small"
                            label="Hậu tố"
                            value={item.displaySuffix ?? ""}
                            onChange={(event) =>
                              updateProjectField(field, (current) => ({
                                ...current,
                                displaySuffix: event.target.value,
                              }))
                            }
                          />
                          <TextField
                            select
                            size="small"
                            label="Vị trí trên bảng tổng hợp"
                            value={item.summaryProjectColumnId ?? ""}
                            onChange={(event) =>
                              updateProjectField(field, (current) => ({
                                ...current,
                                summaryProjectColumnId: event.target.value || undefined,
                              }))
                            }
                          >
                            <MenuItem value="">Không đưa lên bảng tổng hợp</MenuItem>
                            {summaryColumns.map((summaryColumn) => (
                              <MenuItem
                                key={summaryColumn.id}
                                value={summaryColumn.id}
                                disabled={!summaryColumn.enabled}
                              >
                                {summaryColumn.label}
                                {!summaryColumn.enabled ? " (đang ẩn)" : ""}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Box>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>

            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
                  Chỉ tiêu theo tháng của mẫu
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Các dự án dùng mẫu sẽ kế thừa những chỉ tiêu, cột nhập và ánh xạ dưới đây.
                </Typography>
              </Box>
              <Button variant="outlined" startIcon={<AddRounded />} onClick={openNewDefinition}>
                Thêm chỉ tiêu
              </Button>
            </Stack>
            {!fields.length && (
              <Alert severity="info">
                Mẫu chưa có chỉ tiêu theo tháng. Hãy thêm chỉ tiêu đầu tiên.
              </Alert>
            )}
            <Stack spacing={1}>
              {fields.map((field) => {
                const item = draft.fields.find((entry) => entry.fieldId === field.id);
                if (!item) return null;
                return (
                  <Card key={field.id} variant="outlined">
                    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Stack spacing={1.25}>
                        <Stack
                          direction="row"
                          sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
                        >
                          <Box>
                            <Typography sx={{ fontWeight: 700 }}>
                              {item.displayLabel || field.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {semanticTypeLabel(field.semanticType)} ·{" "}
                              {inputModeLabel(field.inputMode)}
                            </Typography>
                          </Box>
                          <Stack direction="row">
                            <Tooltip
                              title={
                                definitionIsShared(field.id)
                                  ? "Định nghĩa kỹ thuật này đang được mẫu khác dùng chung. Bạn vẫn có thể đổi tên và hậu tố riêng cho mẫu này."
                                  : "Sửa kiểu dữ liệu và cách nhập"
                              }
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={definitionIsShared(field.id)}
                                  onClick={() => {
                                    setDefinitionError("");
                                    setDefinitionDraft(structuredClone(field));
                                  }}
                                >
                                  <EditOutlined fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Bỏ chỉ tiêu khỏi mẫu">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => removeTemplateField(field.id)}
                              >
                                <DeleteOutlineRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Stack>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          sx={{ gap: 1, alignItems: { md: "center" } }}
                        >
                          <TextField
                            size="small"
                            label="Tên hiển thị"
                            value={item.displayLabel ?? ""}
                            onChange={(event) =>
                              updateField(field, (current) => ({
                                ...current,
                                displayLabel: event.target.value,
                              }))
                            }
                          />
                          <TextField
                            size="small"
                            label="Hậu tố"
                            value={item.displaySuffix ?? ""}
                            onChange={(event) =>
                              updateField(field, (current) => ({
                                ...current,
                                displaySuffix: event.target.value,
                              }))
                            }
                          />
                          <TextField
                            size="small"
                            type="number"
                            label="Dòng"
                            value={templateFieldRowNumber(draft, field.id)}
                            onChange={(event) =>
                              moveFieldToRow(field.id, Number(event.target.value))
                            }
                            slotProps={{ htmlInput: { min: 1 } }}
                            sx={{ minWidth: 100 }}
                          />
                          <TextField
                            select
                            size="small"
                            label="Chỉ tiêu tổng hợp"
                            value={item.summaryMetricId ?? ""}
                            onChange={(event) =>
                              updateField(field, (current) => ({
                                ...current,
                                summaryMetricId: event.target.value || null,
                              }))
                            }
                            sx={{ minWidth: 210 }}
                          >
                            <MenuItem value="">Không tổng hợp</MenuItem>
                            {[...state.monthlySummaryMetrics]
                              .filter((metric) => metric.enabled)
                              .sort((first, second) => first.sortOrder - second.sortOrder)
                              .map((metric) => (
                                <MenuItem
                                  key={metric.id}
                                  value={metric.id}
                                  disabled={draft.fields.some(
                                    (candidate) =>
                                      candidate.fieldId !== field.id &&
                                      candidate.summaryMetricId === metric.id,
                                  )}
                                >
                                  {metric.label}
                                </MenuItem>
                              ))}
                          </TextField>
                          <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
                            {state.monthlyColumns.map((column) => (
                              <FormControlLabel
                                key={column.id}
                                label={column.label}
                                control={
                                  <Checkbox
                                    size="small"
                                    checked={item.allowedColumnIds.includes(column.id)}
                                    onChange={(_, checked) =>
                                      updateField(field, (current) => ({
                                        ...current,
                                        allowedColumnIds: checked
                                          ? [...current.allowedColumnIds, column.id]
                                          : current.allowedColumnIds.filter(
                                              (id) => id !== column.id,
                                            ),
                                      }))
                                    }
                                  />
                                }
                              />
                            ))}
                          </Stack>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>

            <TemplateFieldDefinitionDialog
              draft={definitionDraft}
              error={definitionError}
              onChange={setDefinitionDraft}
              onClose={() => {
                setDefinitionDraft(null);
                setDefinitionError("");
              }}
              onSave={saveDefinition}
            />
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={onSave}>
          Lưu mẫu
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TemplateFieldDefinitionDialog({
  draft,
  error,
  onChange,
  onClose,
  onSave,
}: {
  draft: ProjectFieldDefinition | null;
  error: string;
  onChange: (draft: ProjectFieldDefinition | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  const displayModes = displayModesForField(draft.semanticType, "monthly");
  const displayModeLabels = {
    number: "Số",
    progress: "Thanh tiến độ",
    text: "Văn bản",
    badge: "Nhãn",
    richText: "Văn bản định dạng",
    date: "Ngày",
  } as const;
  const inputModes: Array<{ value: InputMode; label: string }> = [
    { value: "manual", label: "Nhập trực tiếp" },
    { value: "formula", label: "Tính bằng công thức" },
    { value: "fixed", label: "Giá trị cố định" },
  ];

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{draft.id ? "Sửa định nghĩa chỉ tiêu" : "Thêm chỉ tiêu cho mẫu"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="warning">{error}</Alert>}
          <TextField
            autoFocus
            required
            label="Tên chỉ tiêu"
            value={draft.label}
            onChange={(event) => onChange({ ...draft, label: event.target.value })}
          />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              select
              label="Kiểu dữ liệu"
              value={draft.semanticType}
              onChange={(event) => {
                const semanticType = event.target.value as SemanticType;
                onChange(
                  normalizeFieldBehavior(
                    {
                      ...draft,
                      semanticType,
                      displayMode: displayModesForField(semanticType, "monthly")[0],
                    },
                    semanticType,
                    "monthly",
                  ),
                );
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
                onChange({
                  ...draft,
                  displayMode: event.target.value as ProjectFieldDefinition["displayMode"],
                })
              }
            >
              {displayModes.map((mode) => (
                <MenuItem key={mode} value={mode}>
                  {displayModeLabels[mode]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Cách nhập"
              value={draft.inputMode}
              onChange={(event) =>
                onChange({ ...draft, inputMode: event.target.value as InputMode })
              }
            >
              {inputModes.map((mode) => (
                <MenuItem key={mode.value} value={mode.value}>
                  {mode.label}
                </MenuItem>
              ))}
            </TextField>
            {draft.semanticType === "Number" && (
              <TextField
                type="number"
                label="Số chữ số thập phân"
                value={draft.displayPrecision ?? 0}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    displayPrecision: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            )}
            <TextField
              label="Tiền tố hiển thị"
              value={draft.prefix ?? ""}
              onChange={(event) => onChange({ ...draft, prefix: event.target.value || undefined })}
            />
            <TextField
              label="Hậu tố hiển thị"
              value={draft.suffix ?? ""}
              onChange={(event) => onChange({ ...draft, suffix: event.target.value || undefined })}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={onSave}>
          {draft.id ? "Lưu chỉ tiêu" : "Thêm vào mẫu"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function templateFieldRowNumber(template: ProjectFieldTemplate, fieldId: string) {
  const rows = [...template.monthlyLayout.rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const placement = template.monthlyLayout.placements.find((item) => item.fieldId === fieldId);
  const index = rows.findIndex((row) => row.id === placement?.rowId);
  return index >= 0 ? index + 1 : 1;
}

function normalizeTemplateLayout(template: ProjectFieldTemplate) {
  const fieldIds = new Set(template.fields.map((item) => item.fieldId));
  let rows = [...template.monthlyLayout.rows].sort((a, b) => a.sortOrder - b.sortOrder);
  let placements = template.monthlyLayout.placements.filter((item) => fieldIds.has(item.fieldId));
  const placedIds = new Set(placements.map((item) => item.fieldId));

  if (fieldIds.size > 0 && rows.length === 0) {
    rows = [{ id: createClientId("template-row"), sortOrder: 10 }];
  }
  const fallbackRow = rows[0];
  if (fallbackRow) {
    template.fields.forEach((item) => {
      if (placedIds.has(item.fieldId)) return;
      placements.push({
        fieldId: item.fieldId,
        rowId: fallbackRow.id,
        sortOrder: Math.max(0, ...placements.map((entry) => entry.sortOrder)) + 10,
      });
    });
  }

  const usedRowIds = new Set(placements.map((item) => item.rowId));
  rows = rows
    .filter((row) => usedRowIds.has(row.id))
    .map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 }));
  placements = placements.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }));
  return { rows, placements };
}
