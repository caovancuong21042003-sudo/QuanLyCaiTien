import { useMemo, useState, type ReactNode } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import DoneRounded from "@mui/icons-material/DoneRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import FunctionsRounded from "@mui/icons-material/FunctionsRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import { useKkv } from "../context/kkv-context";
import {
  calendarValue,
  defaultMonthlyColumnId,
  effectiveMonthlySummaryMetricId,
  projectFieldsForProject,
  monthlyFieldsForProject,
  monthlyFieldAllowsColumn,
  monthlyFieldColumns,
  monthlyFieldHasFormula,
  projectMonthlyFieldConfig,
  isNumericValue,
  numericValueNotes,
  projectsForYear,
} from "../domain/metadata";
import type { NumericValue, ProjectFieldDefinition } from "../domain/types";
import { isLibraryField, isProjectOwnedField } from "../domain/field-ownership";
import { DynamicProjectFields } from "../components/dynamic-fields/DynamicProjectFields";
import { RichTextEditor } from "../components/rich-text/RichTextEditor";
import { TableWorkspace } from "../components/table-workspace/TableWorkspace";
import { FormulaEngine } from "../formula/formula-engine";
import {
  buildFormulaHoverContent,
  useFormulaHoverCard,
} from "../components/formula-hover/useFormulaHoverCard";
import { BufferedTextField } from "../components/BufferedTextField";
import { formulaErrorLabel } from "../domain/field-labels";
import { FieldValueDisplay } from "../components/dynamic-fields/FieldValueDisplay";
import { TypedFieldInput } from "../components/dynamic-fields/TypedFieldInput";
import { fieldInputWidth } from "../domain/field-behavior";
import { ProjectFieldManagerDrawer } from "../components/projects/ProjectFieldManagerDrawer";
import { MonthlyFieldManagerDrawer } from "../components/projects/MonthlyFieldManagerDrawer";
import { astToBusinessExpression } from "../formula/ast-utils";
import { formatMonthRange } from "../utils/month-range";
import { FormulaConfigPage } from "./FormulaConfigPage";

export type ProjectDetailSection = "info" | "monthly";

export function ProjectDetailPage({
  projectId,
  section,
  onBack,
  onSelectProject,
  onSectionChange,
}: {
  projectId: string;
  section: ProjectDetailSection;
  onBack: () => void;
  onSelectProject: (projectId: string) => void;
  onSectionChange: (section: ProjectDetailSection) => void;
}) {
  const { state, updateState } = useKkv();
  const [editing, setEditing] = useState(false);
  const [managingFields, setManagingFields] = useState(false);
  const [managingMonthlyFields, setManagingMonthlyFields] = useState(false);
  const [selectedMonthlyFieldCode, setSelectedMonthlyFieldCode] = useState<string>();
  const [quickFormulaFieldId, setQuickFormulaFieldId] = useState<string>();
  const tab = { info: 0, monthly: 1 }[section];
  const projects = projectsForYear(state);
  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  const engine = useMemo(() => new FormulaEngine(state), [state]);
  if (!project)
    return (
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4">Quản lý dự án</Typography>
          <Typography color="text.secondary">Năm dữ liệu {state.selectedYear}</Typography>
        </Box>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6">Năm {state.selectedYear} chưa có dự án</Typography>
            <Typography color="text.secondary">
              Dữ liệu của mỗi năm được quản lý độc lập. Hãy tạo dự án đầu tiên để bắt đầu nhập dữ
              liệu.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    );
  const fields = monthlyFieldsForProject(state, project.id);
  const detailProjectFields = projectFieldsForProject(state, project.id);
  const evaluationMonth = state.periods.at(-1)?.month ?? 12;
  const actualColumn = defaultMonthlyColumnId(state);
  const values = Object.fromEntries(
    detailProjectFields.map((field) => {
      const result = engine.calculate(
        project.id,
        field.id,
        state.selectedYear,
        evaluationMonth,
        field.formula?.columnId ?? actualColumn,
      );
      return [field.id, result.value.kind === "scalar" ? result.value.value : null] as const;
    }),
  );
  const projectFormulaExpressions = Object.fromEntries(
    detailProjectFields.map((field) => [
      field.id,
      engine.formulaExpression(
        project.id,
        field.id,
        state.selectedYear,
        evaluationMonth,
        field.formula?.columnId ?? actualColumn,
      ),
    ]),
  );
  const valueNotes = Object.fromEntries(
    detailProjectFields.map((field) => {
      const stored = state.fieldValues.find(
        (item) => item.projectId === project.id && item.fieldId === field.id,
      )?.value;
      return [field.id, numericValueNotes(stored)] as const;
    }),
  );
  const updateProject = (patch: Partial<typeof project>) =>
    updateState((current) => ({
      ...current,
      projects: current.projects.map((item) =>
        item.id === project.id ? { ...item, ...patch } : item,
      ),
    }));
  const updateValue = (code: string, value: unknown) =>
    updateState((current) => {
      const exists = current.fieldValues.some(
        (item) => item.projectId === project.id && item.fieldId === code,
      );
      return {
        ...current,
        fieldValues: exists
          ? current.fieldValues.map((item) =>
              item.projectId === project.id && item.fieldId === code
                ? {
                    ...item,
                    value: isNumericValue(item.value)
                      ? { ...item.value, numericValue: value as number | null }
                      : value,
                  }
                : item,
            )
          : [...current.fieldValues, { projectId: project.id, fieldId: code, value }],
      };
    });
  const updateValueNotes = (
    code: string,
    patch: Pick<NumericValue, "leftNote"> | Pick<NumericValue, "rightNote">,
  ) =>
    updateState((current) => {
      const existing = current.fieldValues.find(
        (item) => item.projectId === project.id && item.fieldId === code,
      );
      const numericValue = isNumericValue(existing?.value)
        ? existing.value.numericValue
        : typeof existing?.value === "number"
          ? existing.value
          : null;
      const nextValue: NumericValue = {
        ...(isNumericValue(existing?.value) ? existing.value : {}),
        numericValue,
        ...patch,
      };
      return {
        ...current,
        fieldValues: existing
          ? current.fieldValues.map((item) =>
              item === existing ? { ...item, value: nextValue } : item,
            )
          : [...current.fieldValues, { projectId: project.id, fieldId: code, value: nextValue }],
      };
    });
  const updateMonthly = (fieldId: string, month: number, columnId: string, value: unknown) =>
    updateState((current) => {
      const exists = current.monthlyValues.some(
        (item) =>
          item.projectId === project.id &&
          item.fieldId === fieldId &&
          item.year === current.selectedYear &&
          item.month === month &&
          item.columnId === columnId,
      );
      const monthlyValues = exists
        ? current.monthlyValues.map((item) =>
            item.projectId === project.id &&
            item.fieldId === fieldId &&
            item.year === current.selectedYear &&
            item.month === month &&
            item.columnId === columnId
              ? { ...item, value }
              : item,
          )
        : [
            ...current.monthlyValues,
            {
              projectId: project.id,
              fieldId,
              year: current.selectedYear,
              month,
              columnId,
              value,
            },
          ];
      return { ...current, monthlyValues };
    });

  const setMonthlyFieldVisibility = (fieldId: string, visible: boolean) =>
    updateState((current) => {
      const field = current.fieldDefinitions.find(
        (item) =>
          item.id === fieldId &&
          item.scope === "monthly" &&
          (isLibraryField(item) || isProjectOwnedField(item, project.id)),
      );
      if (!field) return current;
      const existing = projectMonthlyFieldConfig(current, project.id, fieldId);
      const saved = {
        projectId: project.id,
        fieldId,
        visible,
        allowedColumnIds:
          existing?.allowedColumnIds ?? current.monthlyColumns.map((column) => column.id),
        displayLabel: existing?.displayLabel,
        displaySuffix: existing?.displaySuffix,
      };
      return {
        ...current,
        projectMonthlyFieldConfigs: [
          ...current.projectMonthlyFieldConfigs.filter(
            (config) => !(config.projectId === project.id && config.fieldId === fieldId),
          ),
          saved,
        ],
      };
    });

  const openMonthlyFieldManager = (fieldId?: string) => {
    setSelectedMonthlyFieldCode(fieldId);
    setManagingMonthlyFields(true);
  };
  const configureMonthlyFormula = (fieldId: string) => {
    setQuickFormulaFieldId(fieldId);
  };
  const configureProjectFormula = (fieldId: string) => {
    setQuickFormulaFieldId(fieldId);
  };

  const calculated = (field: ProjectFieldDefinition, month: number, columnId: string) =>
    engine.calculate(project.id, field.id, state.selectedYear, month, columnId);
  const summaryResult = (
    field: ProjectFieldDefinition,
    summaryColumnId: string,
    columnId: string,
  ) => {
    if (!monthlyFieldAllowsColumn(state, project.id, field.id, columnId)) return null;
    const summaryColumn = state.summaryColumns.find(
      (column) => column.id === summaryColumnId && column.enabled,
    );
    if (!summaryColumn?.columnIds.includes(columnId)) return null;
    const metricId = effectiveMonthlySummaryMetricId(state, project.id, field.id);
    if (!metricId) return null;
    return engine.calculateSummaryColumn(
      project.id,
      summaryColumnId,
      metricId,
      state.selectedYear,
      columnId,
    );
  };
  const summaryFormulaExpression = (
    field: ProjectFieldDefinition,
    summaryColumnId: string,
    columnId: string,
  ) => {
    const summaryColumn = state.summaryColumns.find(
      (column) => column.id === summaryColumnId && column.enabled,
    );
    if (!summaryColumn?.columnIds.includes(columnId)) return undefined;
    const metricId = effectiveMonthlySummaryMetricId(state, project.id, field.id);
    if (!metricId) return undefined;
    const definition = state.summaryFormulas.find(
      (formula) =>
        formula.targetKind === "column" &&
        formula.summaryId === summaryColumnId &&
        formula.metricId === metricId &&
        formula.columnId === columnId,
    );
    return definition
      ? astToBusinessExpression(definition.formula.ast, state, project.id, columnId)
      : undefined;
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1 }}
      >
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <Button startIcon={<ArrowBackRounded />} onClick={onBack}>
            Danh sách dự án
          </Button>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Quản lý dự án
            </Typography>
            <Typography variant="h4">{project.code}</Typography>
            <Typography color="text.secondary">{project.name}</Typography>
          </Box>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" }, width: { xs: "100%", md: "auto" } }}
        >
          <Autocomplete
            size="small"
            options={projects}
            value={project}
            getOptionLabel={(option) => `${option.code} · ${option.name}`}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterOptions={(options, params) => {
              const query = params.inputValue.trim().toLowerCase();
              return query
                ? options.filter((item) =>
                    `${item.code} ${item.name} ${item.department}`.toLowerCase().includes(query),
                  )
                : options;
            }}
            onChange={(_, selected) => {
              if (!selected || selected.id === project.id) return;
              setEditing(false);
              onSelectProject(selected.id);
            }}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {option.code} · {option.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.department || "Chưa có bộ phận"}
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label={`Dự án đang xem · ${projects.length} dự án`}
                placeholder="Tìm theo mã hoặc tên"
              />
            )}
            sx={{ width: { xs: "100%", sm: 390 } }}
          />
          {editing ? (
            <Button
              variant="contained"
              startIcon={<DoneRounded />}
              onClick={() => setEditing(false)}
            >
              Xong
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<EditRounded />}
              onClick={() => setEditing(true)}
              sx={{ whiteSpace: "nowrap" }}
            >
              Chỉnh sửa
            </Button>
          )}
        </Stack>
      </Stack>
      <Paper variant="outlined">
        <Tabs
          value={tab}
          onChange={(_, value) => onSectionChange((["info", "monthly"] as const)[value])}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Thông tin dự án" />
          <Tab label="Dữ liệu 12 tháng" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <ProjectInformation
          editing={editing}
          project={project}
          state={state}
          values={values}
          valueNotes={valueNotes}
          formulaExpressions={projectFormulaExpressions}
          updateProject={updateProject}
          updateValue={updateValue}
          updateValueNotes={updateValueNotes}
          onManageFields={() => setManagingFields(true)}
        />
      )}
      {tab === 1 && (
        <MonthlyDataTable
          editing={editing}
          state={state}
          projectId={project.id}
          fields={fields}
          calculated={calculated}
          formulaExpression={(field, month, columnId) =>
            engine.formulaExpression(project.id, field.id, state.selectedYear, month, columnId)
          }
          summaryResult={summaryResult}
          summaryFormulaExpression={summaryFormulaExpression}
          updateMonthly={updateMonthly}
          onManageFields={openMonthlyFieldManager}
          onConfigureFormula={configureMonthlyFormula}
          onRemoveField={(fieldId) => setMonthlyFieldVisibility(fieldId, false)}
        />
      )}
      <ProjectFieldManagerDrawer
        open={managingFields}
        state={state}
        projectId={project.id}
        updateState={updateState}
        onClose={() => setManagingFields(false)}
        onAdded={() => setEditing(true)}
        onConfigureFormula={configureProjectFormula}
      />
      <MonthlyFieldManagerDrawer
        open={managingMonthlyFields}
        state={state}
        projectId={project.id}
        initialFieldId={selectedMonthlyFieldCode}
        updateState={updateState}
        onClose={() => setManagingMonthlyFields(false)}
        onConfigureFormula={configureMonthlyFormula}
      />
      {quickFormulaFieldId && (
        <FormulaConfigPage
          quickEditor={{
            projectId: project.id,
            fieldId: quickFormulaFieldId,
            onClose: () => setQuickFormulaFieldId(undefined),
          }}
        />
      )}
    </Stack>
  );
}

function ProjectInformation({
  editing,
  project,
  state,
  values,
  valueNotes,
  formulaExpressions,
  updateProject,
  updateValue,
  updateValueNotes,
  onManageFields,
}: {
  editing: boolean;
  project: ReturnType<typeof useKkv>["state"]["projects"][number];
  state: ReturnType<typeof useKkv>["state"];
  values: Record<string, unknown>;
  valueNotes: Record<string, Pick<NumericValue, "leftNote" | "rightNote">>;
  formulaExpressions: Record<string, string | undefined>;
  updateProject: (patch: Partial<typeof project>) => void;
  updateValue: (code: string, value: unknown) => void;
  updateValueNotes: (
    code: string,
    patch: Pick<NumericValue, "leftNote"> | Pick<NumericValue, "rightNote">,
  ) => void;
  onManageFields: () => void;
}) {
  const detailProjectFields = projectFieldsForProject(state, project.id);
  if (!editing)
    return (
      <ProjectInformationView
        project={project}
        state={state}
        values={values}
        valueNotes={valueNotes}
        formulaExpressions={formulaExpressions}
        onManageFields={onManageFields}
      />
    );

  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Thông tin chung
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <BufferedTextField
                fullWidth
                label="Tên dự án"
                value={project.name}
                onCommit={(value) => updateProject({ name: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                select
                fullWidth
                label="Phân loại"
                value={project.category}
                onChange={(event) => updateProject({ category: event.target.value })}
              >
                {["ASSY改善", "SP改善", "成形改善", "省エネ", "材料改善", "LAYOUT"].map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <BufferedTextField
                fullWidth
                label="Bộ phận"
                value={project.department}
                onCommit={(value) => updateProject({ department: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <BufferedTextField
                fullWidth
                label="Người phụ trách"
                value={project.owner}
                onCommit={(value) => updateProject({ owner: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                fullWidth
                type="date"
                label="Hạn hoàn thành"
                value={project.deadline}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(event) => updateProject({ deadline: event.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <BufferedTextField
                fullWidth
                label="Sản phẩm/thiết bị áp dụng"
                value={project.product}
                onCommit={(value) => updateProject({ product: value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                fullWidth
                label="Tháng bắt đầu"
                value={project.startMonth}
                onChange={(event) => updateProject({ startMonth: Number(event.target.value) })}
              >
                {state.periods.map((period) => (
                  <MenuItem key={period.month} value={period.month}>
                    {period.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1, mb: 2 }}
          >
            <Typography variant="h6">Thông tin và chỉ tiêu của dự án</Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddRounded />}
              onClick={onManageFields}
            >
              Quản lý chỉ tiêu
            </Button>
          </Stack>
          <DynamicProjectFields
            fields={detailProjectFields}
            values={values}
            valueNotes={valueNotes}
            formulaExpressions={formulaExpressions}
            onChange={updateValue}
            onNotesChange={updateValueNotes}
          />
        </CardContent>
      </Card>
      <Grid container spacing={2}>
        {(
          [
            ["Mô tả", "description"],
            ["Lý do đặt mục tiêu", "targetReason"],
            ["Ghi chú", "notes"],
          ] as const
        ).map(([label, key]) => (
          <Grid key={key} size={{ xs: 12, md: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              {label}
            </Typography>
            <RichTextEditor
              value={project[key]}
              onChange={(value) => updateProject({ [key]: value })}
            />
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

function ProjectInformationView({
  project,
  state,
  values,
  valueNotes,
  formulaExpressions,
  onManageFields,
}: {
  project: ReturnType<typeof useKkv>["state"]["projects"][number];
  state: ReturnType<typeof useKkv>["state"];
  values: Record<string, unknown>;
  valueNotes: Record<string, Pick<NumericValue, "leftNote" | "rightNote">>;
  formulaExpressions: Record<string, string | undefined>;
  onManageFields: () => void;
}) {
  const { formulaHoverProps, formulaHoverCard } = useFormulaHoverCard();
  const engine = useMemo(() => new FormulaEngine(state), [state]);
  const evaluationMonth = state.periods.at(-1)?.month ?? 12;
  const actualColumn = defaultMonthlyColumnId(state);
  const startPeriod = state.periods.find((period) => period.month === project.startMonth);
  const details = [
    ["Tên dự án", project.name],
    ["Phân loại", project.category],
    ["Bộ phận", project.department],
    ["Người phụ trách", project.owner],
    ["Hạn hoàn thành", formatDate(project.deadline)],
    ["Sản phẩm/thiết bị áp dụng", project.product],
    ["Tháng bắt đầu", startPeriod?.label ?? `Tháng ${project.startMonth}`],
  ] as const;

  return (
    <>
      <Stack spacing={2}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Thông tin chung
            </Typography>
            <Grid container spacing={2}>
              {details.map(([label, value], index) => (
                <DetailItem
                  key={label}
                  label={label}
                  value={value}
                  wide={index === 0 || index === 5}
                />
              ))}
            </Grid>
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1, mb: 2 }}
            >
              <Typography variant="h6">Thông tin và chỉ tiêu của dự án</Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddRounded />}
                onClick={onManageFields}
              >
                Quản lý chỉ tiêu
              </Button>
            </Stack>
            <Grid container spacing={2}>
              {projectFieldsForProject(state, project.id).map((field) => {
                const expression = formulaExpressions[field.id];
                const result = engine.calculate(
                  project.id,
                  field.id,
                  state.selectedYear,
                  evaluationMonth,
                  field.formula?.columnId ?? actualColumn,
                );
                return (
                  <DetailItem
                    key={field.id}
                    label={field.label}
                    value={
                      <FieldValueDisplay
                        field={field}
                        value={values[field.id]}
                        notes={valueNotes[field.id]}
                        strong
                      />
                    }
                    wide={field.displayMode === "richText"}
                    valueProps={formulaHoverProps(() =>
                      buildFormulaHoverContent({
                        formula: expression,
                        result,
                        state,
                        projectId: project.id,
                        resultField: field,
                      }),
                    )}
                    formula={Boolean(expression)}
                  />
                );
              })}
            </Grid>
          </CardContent>
        </Card>
        <Grid container spacing={2}>
          {(
            [
              ["Mô tả", "description"],
              ["Lý do đặt mục tiêu", "targetReason"],
              ["Ghi chú", "notes"],
            ] as const
          ).map(([label, key]) => (
            <Grid key={key} size={{ xs: 12, lg: 4 }}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    {label}
                  </Typography>
                  <RichTextEditor value={project[key]} onChange={() => undefined} readOnly />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Stack>
      {formulaHoverCard}
    </>
  );
}

function DetailItem({
  label,
  value,
  wide = false,
  valueProps,
  formula = false,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
  valueProps?: Record<string, unknown>;
  formula?: boolean;
}) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: wide ? 6 : 3 }}>
      <Box
        sx={{
          height: "100%",
          minHeight: 72,
          px: 1.5,
          py: 1.25,
          bgcolor: "grey.50",
          borderRadius: 1.5,
          border: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Box
          {...valueProps}
          sx={{
            mt: 0.25,
            typography: "body1",
            fontWeight: 650,
            overflowWrap: "anywhere",
            cursor: formula ? "help" : undefined,
          }}
        >
          {value == null || value === "" ? "—" : value}
        </Box>
      </Box>
    </Grid>
  );
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function MonthlyDataTable({
  editing,
  state,
  projectId,
  fields,
  calculated,
  formulaExpression,
  summaryResult,
  summaryFormulaExpression,
  updateMonthly,
  onManageFields,
  onConfigureFormula,
  onRemoveField,
}: {
  editing: boolean;
  state: ReturnType<typeof useKkv>["state"];
  projectId: string;
  fields: ProjectFieldDefinition[];
  calculated: (
    field: ProjectFieldDefinition,
    month: number,
    columnId: string,
  ) => ReturnType<FormulaEngine["calculate"]>;
  formulaExpression: (
    field: ProjectFieldDefinition,
    month: number,
    columnId: string,
  ) => string | undefined;
  summaryResult: (
    field: ProjectFieldDefinition,
    summaryColumnId: string,
    columnId: string,
  ) => ReturnType<FormulaEngine["calculateSummaryColumn"]> | null;
  summaryFormulaExpression: (
    field: ProjectFieldDefinition,
    summaryColumnId: string,
    columnId: string,
  ) => string | undefined;
  updateMonthly: (fieldId: string, month: number, columnId: string, value: unknown) => void;
  onManageFields: (fieldId?: string) => void;
  onConfigureFormula: (fieldId: string) => void;
  onRemoveField: (fieldId: string) => void;
}) {
  const { formulaHoverProps, formulaHoverCard } = useFormulaHoverCard();
  const summaryColumns = [...state.summaryColumns]
    .filter((column) => column.enabled)
    .sort((first, second) => first.sortOrder - second.sortOrder);
  return (
    <>
      <TableWorkspace
        title="Dữ liệu 12 tháng"
        subtitle={
          editing
            ? "Ô nền trắng có thể nhập; giữ chuột trên vùng trống rồi kéo để xem các tháng"
            : "Kế hoạch, thực tế theo từng tháng và kết quả tổng hợp ở cuối bảng"
        }
        height="calc(100vh - 250px)"
        actions={
          editing ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsRounded />}
              onClick={() => onManageFields()}
              sx={{ whiteSpace: "nowrap" }}
            >
              Thêm / quản lý hàng
            </Button>
          ) : undefined
        }
      >
        <Table
          stickyHeader
          size="small"
          sx={{
            minWidth: 1780 + summaryColumns.length * 132,
            "& td, & th": { borderRight: 1, borderColor: "divider", whiteSpace: "nowrap" },
            "& thead th": { bgcolor: "#EAF1F2", color: "#274247" },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ position: "sticky", left: 0, zIndex: 6, minWidth: 220 }}>
                Chỉ tiêu
              </TableCell>
              <TableCell sx={{ position: "sticky", left: 220, zIndex: 6, minWidth: 112 }}>
                Cột dữ liệu
              </TableCell>
              {state.periods.map((period) => (
                <TableCell key={period.month} align="center" sx={{ minWidth: 112 }}>
                  T{period.month}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {String(calendarValue(state, "workingDays", period.month) ?? "—")} ngày
                  </Typography>
                </TableCell>
              ))}
              {summaryColumns.map((summaryColumn, index) => (
                <TableCell
                  key={summaryColumn.id}
                  align="center"
                  sx={{
                    minWidth: 132,
                    bgcolor: "#FFF4D8 !important",
                    borderLeft: index === 0 ? "2px solid" : undefined,
                    borderLeftColor: "warning.light",
                  }}
                >
                  {summaryColumn.label}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {formatMonthRange(
                      summaryColumn.months,
                      state.periods.map((period) => period.month),
                    )}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.flatMap((field) => {
              const columns = monthlyFieldColumns(state, projectId, field.id);
              const hasFormula = monthlyFieldHasFormula(state, projectId, field.id);
              return columns.map((column, columnIndex) => (
                <TableRow
                  key={`${field.id}-${column.id}`}
                  sx={{
                    "& > td": {
                      borderTop: columnIndex === 0 ? "2px solid" : undefined,
                      borderTopColor: "primary.light",
                    },
                    bgcolor: hasFormula ? "#F7FAFC" : "white",
                  }}
                >
                  {columnIndex === 0 && (
                    <TableCell
                      rowSpan={columns.length}
                      sx={{
                        position: "sticky",
                        left: 0,
                        zIndex: 3,
                        bgcolor: "white",
                        verticalAlign: "top",
                      }}
                    >
                      <Typography variant="caption" color="primary">
                        Dòng {field.rowIndex}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 750 }}>
                        {field.label}
                      </Typography>
                      {editing && (
                        <Stack direction="row" sx={{ gap: 0.25, mt: 0.5 }}>
                          <Tooltip title="Sửa tên, hậu tố, cột và vị trí hàng">
                            <IconButton size="small" onClick={() => onManageFields(field.id)}>
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cấu hình công thức cho hàng này">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => onConfigureFormula(field.id)}
                            >
                              <FunctionsRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Xóa hàng khỏi dự án; dữ liệu đã nhập vẫn được giữ">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => onRemoveField(field.id)}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      )}
                      <Stack direction="row" sx={{ gap: 0.5, mt: 0.5 }}>
                        <Chip
                          size="small"
                          label={
                            hasFormula || field.inputMode === "formula"
                              ? "Tính tự động"
                              : field.inputMode === "fixed"
                                ? "Giá trị cố định"
                                : "Nhập liệu"
                          }
                          color={
                            hasFormula || field.inputMode === "formula" ? "secondary" : "default"
                          }
                          variant="outlined"
                        />
                        {field.suffix && (
                          <Chip size="small" label={field.suffix} variant="outlined" />
                        )}
                      </Stack>
                    </TableCell>
                  )}
                  <TableCell
                    sx={{
                      position: "sticky",
                      left: 220,
                      zIndex: 2,
                      bgcolor: column.role === "actual" ? "#E8F4F0" : "#EEF3FA",
                      color: column.role === "actual" ? "#1F6A57" : "#315A8A",
                      fontWeight: 700,
                    }}
                  >
                    {column.label}
                  </TableCell>
                  {state.periods.map((period) => {
                    const result = calculated(field, period.month, column.id);
                    const value = result.value.kind === "scalar" ? result.value.value : null;
                    const expression = formulaExpression(field, period.month, column.id);
                    const editable = editing && field.inputMode !== "fixed" && !expression;
                    return (
                      <TableCell
                        key={period.month}
                        align={field.semanticType === "Number" ? "right" : "left"}
                        sx={{ bgcolor: editable ? "white" : "#F6F8F9" }}
                      >
                        {editable ? (
                          <TypedFieldInput
                            field={field}
                            value={value}
                            onCommit={(nextValue) =>
                              updateMonthly(field.id, period.month, column.id, nextValue)
                            }
                            ariaLabel={`${field.label} ${column.label} tháng ${period.month}`}
                            sx={{ width: fieldInputWidth(field) }}
                          />
                        ) : (
                          <Box
                            {...formulaHoverProps(() =>
                              buildFormulaHoverContent({
                                formula: expression,
                                result,
                                state,
                                projectId,
                                resultField: field,
                              }),
                            )}
                            sx={expression ? { cursor: "help" } : undefined}
                          >
                            {result.state === "Error" ? (
                              <Typography variant="body2" color="error">
                                {formulaErrorLabel(result.errorCode)}
                              </Typography>
                            ) : (
                              <FieldValueDisplay field={field} value={value} />
                            )}
                          </Box>
                        )}
                      </TableCell>
                    );
                  })}
                  {summaryColumns.map((summaryColumn, index) => {
                    const result = summaryResult(field, summaryColumn.id, column.id);
                    const value = result?.value.kind === "scalar" ? result.value.value : null;
                    const expression = summaryFormulaExpression(field, summaryColumn.id, column.id);
                    return (
                      <TableCell
                        key={summaryColumn.id}
                        align={field.semanticType === "Number" ? "right" : "left"}
                        sx={{
                          bgcolor: "#FFFBF0",
                          borderLeft: index === 0 ? "2px solid" : undefined,
                          borderLeftColor: "warning.light",
                          fontWeight: 700,
                        }}
                      >
                        {result?.state === "Error" ? (
                          <Typography variant="body2" color="error">
                            {formulaErrorLabel(result.errorCode)}
                          </Typography>
                        ) : (
                          <Box
                            {...(result && expression
                              ? formulaHoverProps(() =>
                                  buildFormulaHoverContent({
                                    formula: expression,
                                    result,
                                    state,
                                    projectId,
                                    resultField: field,
                                  }),
                                )
                              : {})}
                            sx={expression ? { cursor: "help" } : undefined}
                          >
                            <FieldValueDisplay field={field} value={value} strong />
                          </Box>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
      </TableWorkspace>
      {formulaHoverCard}
    </>
  );
}
