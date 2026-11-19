import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import SaveRounded from "@mui/icons-material/SaveRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { useSearchParams } from "react-router";
import { useKkv } from "../context/kkv-context";
import { useToast } from "../context/toast-context";
import type { FormulaDefinition, FormulaOverride, ProjectFormulaOverride } from "../domain/types";
import {
  baseFormulaForProject,
  defaultMonthlyColumnId,
  effectiveMonthlyField,
  effectiveProjectField,
  fieldDefinitionForProject,
  fieldFormulaForColumn,
  monthlyFieldAllowsColumn,
  monthlyFieldsForProject,
  projectFieldsForProject,
  projectTemplateForProject,
  projectsForYear,
  templateFormulaKey,
} from "../domain/metadata";
import { functionCatalog } from "../formula/function-catalog";
import { parseFormula } from "../formula/parser";
import {
  analyzeParentheses,
  completeMissingClosingParentheses,
} from "../formula/formula-validation";
import { FormulaEngine } from "../formula/formula-engine";
import { ref, type FormulaAst, type PeriodSelector } from "../formula/ast";
import {
  astToBusinessExpression,
  formulaToTokens,
  periodLabel,
  periodToSyntax,
  type DisplayToken,
} from "../formula/ast-utils";
import { typeCheck } from "../formula/type-checker";
import {
  FormulaExpressionEditor,
  type FormulaEditorHandle,
} from "../components/formula-builder/FormulaExpressionEditor";
import { FormulaEditorSurface } from "../components/formula-builder/FormulaEditorSurface";
import { createClientId } from "../utils/id";
import { fieldScopeLabel, formulaErrorLabel, inputModeLabel } from "../domain/field-labels";
import { isNumericSemanticType } from "../domain/field-behavior";
import { FieldValueDisplay } from "../components/dynamic-fields/FieldValueDisplay";
import { replaceFormulaOverrideCoverage } from "../formula/formula-override-utils";
import { isProjectOwnedField } from "../domain/field-ownership";
import { formatMonthApplication, formatMonthRange } from "../utils/month-range";
import { resolveProjectFormulaTargetId } from "../formula/formula-navigation";

type FormulaScope = "default" | "override";
type FormulaEditorMode = "project" | "template";
const SAME_RESULT_COLUMN = "__same_result_column__";

function tokensToExpression(tokens: DisplayToken[]) {
  return {
    internal: tokens
      .map((token) => token.raw)
      .join(" ")
      .trim(),
    business: tokens
      .map((token) => token.label)
      .join(" ")
      .trim(),
  };
}

function normalizeExpression(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .trim();
}

export interface FormulaQuickEditorContext {
  projectId: string;
  fieldId: string;
  columnId?: string;
  onClose: () => void;
}

export function FormulaConfigPage({
  quickEditor,
}: {
  quickEditor?: FormulaQuickEditorContext;
} = {}) {
  const { ready } = useKkv();
  if (!ready)
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Đang tải cấu hình công thức…</Typography>
      </Box>
    );
  return <ReadyFormulaConfigPage quickEditor={quickEditor} />;
}

function ReadyFormulaConfigPage({ quickEditor }: { quickEditor?: FormulaQuickEditorContext }) {
  const { state, updateState } = useKkv();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const projects = projectsForYear(state);
  const initialEditorMode: FormulaEditorMode = quickEditor
    ? "project"
    : searchParams.get("mode") === "template"
      ? "template"
      : "project";
  const requestedTemplateId = searchParams.get("templateId") ?? "";
  const initialTemplate =
    state.projectFieldTemplates.find((template) => template.id === requestedTemplateId) ??
    state.projectFieldTemplates[0];
  const requestedProjectId = quickEditor?.projectId ?? searchParams.get("projectId") ?? "";
  const initialProjectId = projects.some((project) => project.id === requestedProjectId)
    ? requestedProjectId
    : initialEditorMode === "template"
      ? (projects.find((project) => project.templateId === initialTemplate?.id)?.id ??
        projects[0]?.id ??
        "")
      : (projects[0]?.id ?? "");
  const allTargetFields = state.fieldDefinitions.filter(
    (field) => field.scope !== "calendar" && !field.deletedAt,
  );
  const allFormulaFields = state.fieldDefinitions.filter(
    (field) => field.inputMode === "formula" && !field.deletedAt,
  );
  const belongsToInitialProject = (field: (typeof state.fieldDefinitions)[number]) =>
    field.scope !== "project" || isProjectOwnedField(field, initialProjectId);
  const requestedFieldId = quickEditor?.fieldId ?? searchParams.get("fieldId") ?? "";
  const requestedField = fieldDefinitionForProject(state, initialProjectId, requestedFieldId);
  const initialTemplateTarget =
    initialTemplate?.formulas?.[0]?.fieldId ??
    initialTemplate?.fields[0]?.fieldId ??
    initialTemplate?.projectFields?.[0]?.fieldId;
  const firstTarget =
    initialEditorMode === "template"
      ? ((requestedField?.scope !== "calendar" ? requestedField?.id : undefined) ??
        initialTemplateTarget ??
        allFormulaFields.find(belongsToInitialProject)?.id ??
        allTargetFields.find(belongsToInitialProject)?.id ??
        "")
      : resolveProjectFormulaTargetId(state, initialProjectId, requestedFieldId);
  const firstField = fieldDefinitionForProject(state, initialProjectId, firstTarget);
  const requestedColumnId = quickEditor?.columnId ?? searchParams.get("columnId") ?? "";
  const initialTemplateField = initialTemplate?.fields.find((item) => item.fieldId === firstTarget);
  const initialAllowedColumns =
    firstField?.scope === "monthly"
      ? initialEditorMode === "template" && initialTemplateField?.allowedColumnIds.length
        ? state.monthlyColumns
            .filter((column) => initialTemplateField.allowedColumnIds.includes(column.id))
            .map((column) => column.id)
        : state.monthlyColumns
            .filter((column) =>
              monthlyFieldAllowsColumn(state, initialProjectId, firstField.id, column.id),
            )
            .map((column) => column.id)
      : state.monthlyColumns.map((column) => column.id);
  const initialColumnId =
    (initialAllowedColumns.includes(requestedColumnId) ? requestedColumnId : undefined) ??
    firstField?.columnFormulas?.find((formula) =>
      initialAllowedColumns.includes(formula.columnId ?? ""),
    )?.columnId ??
    (firstField?.formula?.columnId && initialAllowedColumns.includes(firstField.formula.columnId)
      ? firstField.formula.columnId
      : undefined) ??
    initialAllowedColumns[0] ??
    defaultMonthlyColumnId(state);
  const firstTemplateFormula = initialTemplate?.formulas?.find(
    (item) =>
      item.fieldId === firstTarget &&
      item.columnId === (firstField?.scope === "monthly" ? initialColumnId : undefined),
  )?.formula;
  const firstTemplateFormulaDisabled = initialTemplate?.disabledFormulaKeys?.includes(
    templateFormulaKey(firstTarget, firstField?.scope === "monthly" ? initialColumnId : undefined),
  );
  const firstBaseDefinition =
    initialEditorMode === "template"
      ? firstTemplateFormulaDisabled
        ? undefined
        : (firstTemplateFormula ?? fieldFormulaForColumn(firstField, initialColumnId))
      : baseFormulaForProject(state, initialProjectId, firstField, initialColumnId);
  const firstQuickOverride = quickEditor
    ? firstField?.scope === "project"
      ? state.projectFormulaOverrides.find(
          (override) => override.projectId === initialProjectId && override.fieldId === firstTarget,
        )
      : state.formulaOverrides
          .filter(
            (override) =>
              override.projectId === initialProjectId &&
              override.fieldId === firstTarget &&
              override.columnId === initialColumnId,
          )
          .sort((first, second) => second.months.length - first.months.length)[0]
    : undefined;
  const firstDefinition = firstQuickOverride?.formula ?? firstBaseDefinition;
  const [target, setTarget] = useState(firstTarget);
  const [resultColumn, setResultColumn] = useState(initialColumnId);
  const [referenceColumn, setReferenceColumn] = useState(SAME_RESULT_COLUMN);
  const [tokens, setTokens] = useState<DisplayToken[]>(() =>
    firstDefinition
      ? formulaToTokens(firstDefinition, state, initialProjectId, initialColumnId)
      : [],
  );
  const [editorRevision, setEditorRevision] = useState(0);
  const [expression, setExpression] = useState(() => tokensToExpression(tokens));
  const [editorBaselineInternal, setEditorBaselineInternal] = useState(
    () => tokensToExpression(tokens).internal,
  );
  const [editorOptionsDirty, setEditorOptionsDirty] = useState(false);
  const editorRef = useRef<FormulaEditorHandle>(null);
  const [formulaScope, setFormulaScope] = useState<FormulaScope>(
    quickEditor && firstQuickOverride ? "override" : "default",
  );
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(
    firstQuickOverride?.id ?? null,
  );
  const [overrideMonths, setOverrideMonths] = useState<number[]>(
    firstQuickOverride && "months" in firstQuickOverride
      ? [...firstQuickOverride.months]
      : quickEditor
        ? state.periods.map((period) => period.month)
        : [5, 6, 7],
  );
  const [overrideProjectId, setOverrideProjectId] = useState(initialProjectId);
  const [periodKind, setPeriodKind] = useState<PeriodSelector["kind"]>("current");
  const [periodA, setPeriodA] = useState(1);
  const [periodB, setPeriodB] = useState(6);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([5, 6, 7]);
  const [advanced, setAdvanced] = useState(false);
  const [editorMode, setEditorMode] = useState<FormulaEditorMode>(initialEditorMode);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplate?.id ?? "");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [showReferenceDetails, setShowReferenceDetails] = useState(false);
  const [showMonthlySources, setShowMonthlySources] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [projectEditorOpen, setProjectEditorOpen] = useState(Boolean(quickEditor));
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [discardEditorOpen, setDiscardEditorOpen] = useState(false);
  const [deleteTemplateFormulaOpen, setDeleteTemplateFormulaOpen] = useState(false);
  const [returnToTemplateOverrideId, setReturnToTemplateOverrideId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [month, setMonth] = useState(5);
  const [message, setMessage] = useState<{
    severity: "warning" | "info";
    text: string;
  } | null>(null);

  const configuredMonthlyFieldIds = new Set(
    monthlyFieldsForProject(state, projectId).map((field) => field.id),
  );
  const configuredProjectFieldIds = new Set(
    projectFieldsForProject(state, projectId).map((field) => field.id),
  );
  const selectedTemplate =
    editorMode === "template"
      ? state.projectFieldTemplates.find((template) => template.id === selectedTemplateId)
      : projectTemplateForProject(state, projectId);
  const templateFieldIds = new Set([
    ...(selectedTemplate?.projectFields ?? []).map((item) => item.fieldId),
    ...(selectedTemplate?.fields ?? []).map((item) => item.fieldId),
    ...(selectedTemplate?.formulas ?? []).map((item) => item.fieldId),
  ]);
  // Người dùng nghiệp vụ chỉ thấy các field tháng đã bật cho dự án. Advanced Mode vẫn
  // cho dev truy cập field ẩn/helper để kiểm tra hoặc bảo trì công thức cũ.
  const availableForProject = (field: (typeof state.fieldDefinitions)[number]) => {
    if (field.deletedAt) return false;
    if (field.ownerType === "project" && !isProjectOwnedField(field, projectId)) return false;
    if (editorMode === "template") return templateFieldIds.has(field.id);
    return (
      (field.scope !== "monthly" && field.scope !== "project") ||
      advanced ||
      (field.scope === "monthly"
        ? configuredMonthlyFieldIds.has(field.id)
        : configuredProjectFieldIds.has(field.id)) ||
      field.id === target
    );
  };
  const targetFields = allTargetFields.filter(availableForProject);
  const targetField = fieldDefinitionForProject(state, projectId, target);
  const targetTemplateFormula = selectedTemplate?.formulas?.find(
    (item) =>
      item.fieldId === target &&
      item.columnId === (targetField?.scope === "monthly" ? resultColumn : undefined),
  )?.formula;
  const targetTemplateFormulaDisabled = selectedTemplate?.disabledFormulaKeys?.includes(
    templateFormulaKey(target, targetField?.scope === "monthly" ? resultColumn : undefined),
  );
  const targetColumnFormula =
    editorMode === "template"
      ? targetTemplateFormulaDisabled
        ? undefined
        : (targetTemplateFormula ?? fieldFormulaForColumn(targetField, resultColumn))
      : baseFormulaForProject(state, projectId, targetField, resultColumn);
  const templateProjectCount = selectedTemplate
    ? state.projects.filter((project) => project.templateId === selectedTemplate.id).length
    : 0;
  const formulaSourceLabel = targetTemplateFormula
    ? (selectedTemplate?.label ?? "Công thức mẫu")
    : selectedTemplate
      ? `${selectedTemplate.label} · kế thừa công thức nền`
      : "Cấu hình nền";
  const templatePreviewProjects = selectedTemplate
    ? projects.filter((project) => project.templateId === selectedTemplate.id)
    : [];
  const templateProjectIds = new Set(templatePreviewProjects.map((project) => project.id));
  const templatePrivateProjectIds = new Set(
    targetField?.scope === "project"
      ? state.projectFormulaOverrides
          .filter(
            (override) => override.fieldId === target && templateProjectIds.has(override.projectId),
          )
          .map((override) => override.projectId)
      : state.formulaOverrides
          .filter(
            (override) =>
              override.fieldId === target &&
              override.columnId === resultColumn &&
              Boolean(override.projectId && templateProjectIds.has(override.projectId)),
          )
          .map((override) => override.projectId as string),
  );
  const templatePrivateProjectCount = templatePrivateProjectIds.size;
  const templateInheritedProjectCount = Math.max(
    0,
    templateProjectCount - templatePrivateProjectCount,
  );
  const isReadOnlyDefault = formulaScope === "default" && editorMode === "project";
  const allowedResultColumns = (fieldId: string, contextProjectId = projectId) => {
    if (editorMode === "template") {
      const configured = selectedTemplate?.fields.find((item) => item.fieldId === fieldId);
      return configured?.allowedColumnIds.length
        ? state.monthlyColumns
            .filter((column) => configured.allowedColumnIds.includes(column.id))
            .map((column) => column.id)
        : state.monthlyColumns.map((column) => column.id);
    }
    return state.monthlyColumns
      .filter((column) => monthlyFieldAllowsColumn(state, contextProjectId, fieldId, column.id))
      .map((column) => column.id);
  };
  const selectedProject = projects.find((project) => project.id === projectId);
  const columnLabel = (columnId: string) =>
    state.monthlyColumns.find((column) => column.id === columnId)?.label ?? columnId;
  const resolvedReferenceColumn =
    referenceColumn === SAME_RESULT_COLUMN ? resultColumn : referenceColumn;
  const resolvedReferenceColumnLabel = columnLabel(resolvedReferenceColumn);
  const sameNameProjects = selectedProject
    ? projects.filter(
        (project) =>
          project.name.trim().toLocaleLowerCase() ===
          selectedProject.name.trim().toLocaleLowerCase(),
      )
    : [];
  const { internal, business } = expression;
  const formulaEditorDirty =
    normalizeExpression(internal) !== normalizeExpression(editorBaselineInternal);
  const hasUnsavedEditorChanges = formulaEditorDirty || editorOptionsDirty;
  const parenthesisAnalysis = useMemo(() => analyzeParentheses(internal), [internal]);
  const completedExpression = useMemo(
    () => completeMissingClosingParentheses(internal),
    [internal],
  );
  const monthlyOverrides = state.formulaOverrides
    .filter(
      (item) =>
        item.fieldId === target &&
        item.year === state.selectedYear &&
        (!item.projectId || item.projectId === projectId),
    )
    .sort((a, b) => Math.min(...a.months) - Math.min(...b.months));
  const pendingOverrideProjectId = overrideProjectId === "all" ? undefined : overrideProjectId;
  const overlappingMonthlyOverrides =
    formulaScope === "override" && targetField?.scope === "monthly"
      ? state.formulaOverrides.filter(
          (item) =>
            item.id !== editingOverrideId &&
            item.fieldId === target &&
            item.year === state.selectedYear &&
            item.projectId === pendingOverrideProjectId &&
            item.columnId === resultColumn &&
            item.months.some((itemMonth) => overrideMonths.includes(itemMonth)),
        )
      : [];
  const visibleMonthlyOverrides = advanced
    ? monthlyOverrides.filter((item) => item.columnId === resultColumn)
    : monthlyOverrides.filter(
        (item) => item.projectId === projectId && item.columnId === resultColumn,
      );
  const projectOverrides = state.projectFormulaOverrides.filter(
    (item) => item.fieldId === target && item.projectId === projectId,
  );
  const projectMonthlyOverridesForTarget = state.formulaOverrides.filter(
    (item) =>
      item.projectId === projectId &&
      item.fieldId === target &&
      item.columnId === resultColumn &&
      item.year === state.selectedYear,
  );
  const templateFormulaBusiness = targetColumnFormula
    ? astToBusinessExpression(targetColumnFormula.ast, state, projectId, resultColumn)
    : "";
  const storedPrivateMonths = new Set(
    projectMonthlyOverridesForTarget.flatMap((item) => item.months),
  );
  const storedInheritedMonths = state.periods
    .map((period) => period.month)
    .filter((item) => !storedPrivateMonths.has(item));
  const privatelyConfiguredMonths = new Set([
    ...projectMonthlyOverridesForTarget.flatMap((item) => item.months),
    ...(formulaScope === "override" && targetField?.scope === "monthly" ? overrideMonths : []),
  ]);
  const inheritedMonths = state.periods
    .map((period) => period.month)
    .filter((item) => !privatelyConfiguredMonths.has(item));

  const referencePeriod = (): PeriodSelector => {
    if (periodKind === "offset") return { kind: "offset", amount: periodA };
    if (periodKind === "specific") return { kind: "specific", month: periodA };
    if (periodKind === "range")
      return { kind: "range", from: Math.min(periodA, periodB), to: Math.max(periodA, periodB) };
    if (periodKind === "selected") return { kind: "selected", months: selectedMonths };
    return { kind: periodKind } as PeriodSelector;
  };

  const loadEditor = (nextTokens: DisplayToken[]) => {
    const nextExpression = tokensToExpression(nextTokens);
    setTokens(nextTokens);
    setEditorRevision((current) => current + 1);
    setExpression(nextExpression);
    setEditorBaselineInternal(nextExpression.internal);
    setEditorOptionsDirty(false);
    setFieldSearch("");
  };

  const loadDefault = (
    fieldId: string,
    contextProjectId = projectId,
    preferredColumnId = resultColumn,
    contextTemplateId: string | null = editorMode === "template" ? selectedTemplateId : null,
  ) => {
    const field = fieldDefinitionForProject(state, contextProjectId, fieldId);
    const contextTemplate = contextTemplateId
      ? state.projectFieldTemplates.find((template) => template.id === contextTemplateId)
      : undefined;
    const templateField = contextTemplate?.fields.find((item) => item.fieldId === fieldId);
    const allowedColumns =
      field?.scope === "monthly"
        ? contextTemplate
          ? templateField?.allowedColumnIds.length
            ? state.monthlyColumns
                .filter((column) => templateField.allowedColumnIds.includes(column.id))
                .map((column) => column.id)
            : state.monthlyColumns.map((column) => column.id)
          : allowedResultColumns(fieldId, contextProjectId)
        : state.monthlyColumns.map((column) => column.id);
    const nextColumn = allowedColumns.includes(preferredColumnId)
      ? preferredColumnId
      : (field?.columnFormulas?.find((formula) => allowedColumns.includes(formula.columnId ?? ""))
          ?.columnId ??
        allowedColumns[0] ??
        defaultMonthlyColumnId(state));
    const templateKey = templateFormulaKey(
      fieldId,
      field?.scope === "monthly" ? nextColumn : undefined,
    );
    const templateDefinition = contextTemplate?.formulas?.find(
      (item) =>
        item.fieldId === fieldId &&
        item.columnId === (field?.scope === "monthly" ? nextColumn : undefined),
    )?.formula;
    const definition = contextTemplate
      ? contextTemplate.disabledFormulaKeys?.includes(templateKey)
        ? undefined
        : (templateDefinition ?? fieldFormulaForColumn(field, nextColumn))
      : baseFormulaForProject(state, contextProjectId, field, nextColumn);
    setFormulaScope("default");
    setEditingOverrideId(null);
    loadEditor(definition ? formulaToTokens(definition, state, contextProjectId, nextColumn) : []);
    setResultColumn(nextColumn);
    setReferenceColumn(field?.scope === "monthly" ? SAME_RESULT_COLUMN : nextColumn);
  };

  const selectTarget = (fieldId: string) => {
    setTarget(fieldId);
    loadDefault(fieldId, projectId, resultColumn);
    setShowMonthlySources(false);
    setMonthPickerOpen(false);
    setMessage(null);
  };

  const selectProject = (nextProjectId: string) => {
    const nextTarget = resolveProjectFormulaTargetId(state, nextProjectId, target);
    setProjectId(nextProjectId);
    setOverrideProjectId(nextProjectId);
    setTarget(nextTarget);
    loadDefault(nextTarget, nextProjectId, resultColumn);
    setMessage(null);
  };

  const selectTemplate = (nextTemplateId: string) => {
    const template = state.projectFieldTemplates.find((item) => item.id === nextTemplateId);
    if (!template) return;
    const contextProjectId =
      projects.find((project) => project.templateId === nextTemplateId)?.id ??
      (projectId || projects[0]?.id || "");
    const codes = new Set([
      ...(template.projectFields ?? []).map((item) => item.fieldId),
      ...template.fields.map((item) => item.fieldId),
      ...(template.formulas ?? []).map((item) => item.fieldId),
    ]);
    const nextTarget = codes.has(target)
      ? target
      : (template.formulas?.[0]?.fieldId ??
        template.fields[0]?.fieldId ??
        template.projectFields?.[0]?.fieldId ??
        "");
    setSelectedTemplateId(nextTemplateId);
    setProjectId(contextProjectId);
    setOverrideProjectId(contextProjectId);
    setTarget(nextTarget);
    loadDefault(nextTarget, contextProjectId, resultColumn, nextTemplateId);
    setMessage(null);
  };

  const selectEditorMode = (nextMode: FormulaEditorMode) => {
    setEditorMode(nextMode);
    setProjectEditorOpen(false);
    setTemplateEditorOpen(false);
    setFormulaScope("default");
    setEditingOverrideId(null);
    setMessage(null);
    if (nextMode === "template") {
      const nextTemplateId =
        projectTemplateForProject(state, projectId)?.id ??
        selectedTemplateId ??
        state.projectFieldTemplates[0]?.id;
      if (nextTemplateId) selectTemplate(nextTemplateId);
    } else {
      loadDefault(target, projectId, resultColumn, null);
    }
  };

  const selectResultColumn = (columnId: string) => {
    if (quickEditor) {
      const existing = state.formulaOverrides
        .filter(
          (override) =>
            override.projectId === projectId &&
            override.fieldId === target &&
            override.columnId === columnId,
        )
        .sort((first, second) => second.months.length - first.months.length)[0];
      const definition =
        existing?.formula ?? baseFormulaForProject(state, projectId, targetField, columnId);
      setFormulaScope("override");
      setEditingOverrideId(existing?.id ?? null);
      setOverrideProjectId(projectId);
      setOverrideMonths(
        existing?.months.length
          ? [...existing.months]
          : state.periods.map((period) => period.month),
      );
      setResultColumn(columnId);
      setReferenceColumn(SAME_RESULT_COLUMN);
      loadEditor(definition ? formulaToTokens(definition, state, projectId, columnId) : []);
      setMessage(null);
      return;
    }
    loadDefault(target, projectId, columnId);
    setMessage(null);
  };

  const editOverride = (override: FormulaOverride) => {
    setFormulaScope("override");
    setEditingOverrideId(override.id);
    setOverrideMonths([...override.months]);
    setOverrideProjectId(override.projectId ?? "all");
    setResultColumn(override.columnId);
    setReferenceColumn(SAME_RESULT_COLUMN);
    loadEditor(
      formulaToTokens(override.formula, state, override.projectId ?? projectId, override.columnId),
    );
    setMonthPickerOpen(false);
    setMessage(null);
    setProjectEditorOpen(true);
  };

  const editProjectOverride = (override: ProjectFormulaOverride) => {
    setFormulaScope("override");
    setEditingOverrideId(override.id);
    setOverrideProjectId(override.projectId);
    setReferenceColumn(override.formula.columnId ?? defaultMonthlyColumnId(state));
    loadEditor(
      formulaToTokens(
        override.formula,
        state,
        override.projectId,
        override.formula.columnId ?? resultColumn,
      ),
    );
    setMonthPickerOpen(false);
    setMessage(null);
    setProjectEditorOpen(true);
  };

  const startNewOverride = (months?: number[]) => {
    const definition = baseFormulaForProject(state, projectId, targetField, resultColumn);
    setFormulaScope("override");
    setEditingOverrideId(null);
    setOverrideMonths(months?.length ? [...months] : state.periods.map((period) => period.month));
    setOverrideProjectId(projectId);
    setReferenceColumn(targetField?.scope === "monthly" ? SAME_RESULT_COLUMN : resultColumn);
    loadEditor(definition ? formulaToTokens(definition, state, projectId, resultColumn) : []);
    setMonthPickerOpen(false);
    setMessage(null);
    setProjectEditorOpen(true);
  };

  const openTemplateEditor = () => {
    loadDefault(target, projectId, resultColumn, selectedTemplateId);
    setMessage(null);
    setTemplateEditorOpen(true);
  };

  const addReference = (code: string) => {
    const sourceField = fieldDefinitionForProject(state, projectId, code);
    if (!sourceField) return;
    const field =
      sourceField.scope === "monthly"
        ? effectiveMonthlyField(state, projectId, sourceField)
        : sourceField.scope === "project"
          ? effectiveProjectField(state, projectId, sourceField)
          : sourceField;
    if (code === target && field.scope === "project") {
      showToast("Không thể dùng chính trường đang tính làm dữ liệu đầu vào.", {
        severity: "warning",
      });
      return;
    }
    const referenceColumnIds = [resolvedReferenceColumn];
    const unavailableColumns =
      field.scope === "monthly"
        ? referenceColumnIds.filter(
            (columnId) => !monthlyFieldAllowsColumn(state, projectId, field.id, columnId),
          )
        : [];
    if (unavailableColumns.length) {
      const columnLabel = unavailableColumns
        .map(
          (columnId) =>
            state.monthlyColumns.find((item) => item.id === columnId)?.label ?? columnId,
        )
        .join(", ");
      setMessage({
        severity: "warning",
        text: `${field.label} không được cấu hình cho cột ${columnLabel} ở dự án này.`,
      });
      return;
    }
    const period = referencePeriod();
    if (code === target && field.scope === "monthly" && period.kind === "current") {
      showToast("Không thể dùng chính trường đang tính trong tháng hiện tại.", {
        severity: "warning",
      });
      return;
    }
    if (field.scope !== "project") {
      const useSameResultColumn =
        field.scope === "monthly" && referenceColumn === SAME_RESULT_COLUMN;
      editorRef.current?.insertReference({
        fieldId: code,
        columnId: field.scope === "monthly" && !useSameResultColumn ? referenceColumn : undefined,
        period: periodToSyntax(period),
        label:
          field.scope === "monthly"
            ? `[${field.label} · ${resolvedReferenceColumnLabel} · ${periodLabel(period)}]`
            : `[${field.label} · ${periodLabel(period)}]`,
      });
    } else editorRef.current?.insertReference({ fieldId: code, label: `[${field.label}]` });
  };

  const parseAndValidate = (source = internal): FormulaAst => {
    const ast = parseFormula(source);
    const resultType = typeCheck(ast, state.fieldDefinitions);
    if (String(resultType).startsWith("Series<")) throw new Error("SeriesResult");
    if (targetField) {
      const numericTarget = isNumericSemanticType(targetField.semanticType);
      const numericResult = resultType === "Number";
      const compatible =
        (numericTarget && numericResult) ||
        resultType === targetField.semanticType ||
        (targetField.semanticType === "Date" && resultType === "Text") ||
        resultType === "Null";
      if (!compatible) throw new Error("TargetTypeMismatch");
    }
    return ast;
  };

  const save = () => {
    try {
      if (!targetField) throw new Error("MissingTarget");
      if (
        formulaScope === "override" &&
        targetField.scope === "project" &&
        (!overrideProjectId || overrideProjectId === "all")
      )
        throw new Error("MissingProject");
      if (targetField.scope === "monthly" && !resultColumn) throw new Error("MissingResultColumn");
      if (parenthesisAnalysis.unexpectedClosingIndexes.length)
        throw new Error(
          `UnexpectedClosingParenthesis:${parenthesisAnalysis.unexpectedClosingIndexes[0]}`,
        );
      const completed = completedExpression;
      const savedInternal = completed.source;
      const savedBusiness = completed.addedCount
        ? `${business}${")".repeat(completed.addedCount)}`
        : business;
      const ast = parseAndValidate(savedInternal);
      updateState((current) => {
        if (formulaScope === "override") {
          if (targetField.scope === "project") {
            const id = editingOverrideId ?? createClientId("override");
            const definition: FormulaDefinition = {
              id: `formula-${id}`,
              ast,
              businessExpression: savedBusiness,
              internalExpression: savedInternal,
              preserveUserParentheses: true,
            };
            const saved: ProjectFormulaOverride = {
              id,
              projectId: overrideProjectId,
              fieldId: target,
              formula: definition,
            };
            return {
              ...current,
              projectFormulaOverrides: [
                ...current.projectFormulaOverrides.filter(
                  (item) =>
                    item.id !== id &&
                    !(item.fieldId === target && item.projectId === overrideProjectId),
                ),
                saved,
              ],
            };
          }
          const savedProjectId = overrideProjectId === "all" ? undefined : overrideProjectId;
          const savedMonths = [...overrideMonths].sort((a, b) => a - b);
          const id = editingOverrideId ?? createClientId("override");
          const savedOverride: FormulaOverride = {
            id,
            projectId: savedProjectId,
            fieldId: target,
            columnId: resultColumn,
            year: current.selectedYear,
            months: savedMonths,
            formula: {
              id: `formula-${id}`,
              columnId: resultColumn,
              ast,
              businessExpression: savedBusiness,
              internalExpression: savedInternal,
              preserveUserParentheses: true,
            },
          };
          return {
            ...current,
            formulaOverrides: replaceFormulaOverrideCoverage(
              current.formulaOverrides,
              [savedOverride],
              editingOverrideId,
            ),
          };
        }
        const templateId =
          editorMode === "template"
            ? selectedTemplateId
            : current.projects.find((project) => project.id === projectId)?.templateId;
        if (templateId) {
          const template = current.projectFieldTemplates.find((item) => item.id === templateId);
          const existing = template?.formulas?.find(
            (item) =>
              item.fieldId === target &&
              item.columnId === (targetField.scope === "monthly" ? resultColumn : undefined),
          );
          const definition: FormulaDefinition = {
            id: existing?.formula.id ?? createClientId("formula-template"),
            columnId: targetField.scope === "monthly" ? resultColumn : undefined,
            ast,
            businessExpression: savedBusiness,
            internalExpression: savedInternal,
            preserveUserParentheses: true,
          };
          return {
            ...current,
            projectFieldTemplates: current.projectFieldTemplates.map((item) =>
              item.id === templateId
                ? {
                    ...item,
                    disabledFormulaKeys: (item.disabledFormulaKeys ?? []).filter(
                      (key) =>
                        key !==
                        templateFormulaKey(
                          target,
                          targetField.scope === "monthly" ? resultColumn : undefined,
                        ),
                    ),
                    formulas: [
                      ...(item.formulas ?? []).filter(
                        (formula) =>
                          !(
                            formula.fieldId === target &&
                            formula.columnId ===
                              (targetField.scope === "monthly" ? resultColumn : undefined)
                          ),
                      ),
                      {
                        fieldId: target,
                        columnId: targetField.scope === "monthly" ? resultColumn : undefined,
                        formula: definition,
                      },
                    ],
                  }
                : item,
            ),
          };
        }
        return {
          ...current,
          fieldDefinitions: current.fieldDefinitions.map((field) =>
            field.id === target &&
            (targetField?.scope !== "project" || isProjectOwnedField(field, projectId))
              ? {
                  ...field,
                  inputMode: "formula",
                  ...(field.scope === "monthly"
                    ? {
                        formula: undefined,
                        columnFormulas: [
                          ...(field.columnFormulas ?? []).filter(
                            (formula) => formula.columnId !== resultColumn,
                          ),
                          {
                            id:
                              fieldFormulaForColumn(field, resultColumn)?.id ??
                              createClientId("formula"),
                            columnId: resultColumn,
                            ast,
                            businessExpression: savedBusiness,
                            internalExpression: savedInternal,
                            preserveUserParentheses: true,
                          },
                        ],
                      }
                    : {
                        formula: {
                          id: field.formula?.id ?? createClientId("formula"),
                          ast,
                          businessExpression: savedBusiness,
                          internalExpression: savedInternal,
                          preserveUserParentheses: true,
                        },
                      }),
                }
              : field,
          ),
        };
      });
      if (completed.addedCount) editorRef.current?.appendClosingParentheses(completed.addedCount);
      const projectName =
        state.projects.find((item) => item.id === overrideProjectId)?.name ?? "dự án đã chọn";
      const savedMessage =
        formulaScope === "override"
          ? targetField.scope === "project"
            ? `Đã lưu công thức riêng cho ${projectName}.`
            : `Đã lưu cấu hình ghi đè cho ${state.monthlyColumns.find((column) => column.id === resultColumn)?.label ?? resultColumn}, ${formatMonthApplication(
                overrideMonths,
                state.periods.map((period) => period.month),
              ).toLocaleLowerCase("vi")}.`
          : targetField.scope === "monthly"
            ? `Đã cập nhật công thức của ${selectedTemplate ? `mẫu “${selectedTemplate.label}”` : "cấu hình nền"} cho ${state.monthlyColumns.find((column) => column.id === resultColumn)?.label ?? resultColumn}.`
            : `Đã cập nhật công thức của ${selectedTemplate ? `mẫu “${selectedTemplate.label}”` : "cấu hình nền"}.`;
      showToast(
        completed.addedCount
          ? `Đã tự bổ sung ${completed.addedCount} dấu ) ở cuối. ${savedMessage}`
          : savedMessage,
      );
      setEditorBaselineInternal(savedInternal);
      setEditorOptionsDirty(false);
      if (formulaScope === "override") setEditingOverrideId(null);
      if (editorMode === "project") {
        setProjectEditorOpen(false);
        quickEditor?.onClose();
      } else setTemplateEditorOpen(false);
    } catch (error) {
      const errorMessage = (error as Error).message;
      setMessage({
        severity: "warning",
        text:
          errorMessage === "SeriesResult"
            ? "Kết quả là một chuỗi giá trị. Hãy dùng SUM/AVG/MIN/MAX để đưa về một giá trị trước khi gán."
            : errorMessage === "TargetTypeMismatch"
              ? "Kiểu kết quả của công thức không phù hợp với kiểu dữ liệu của trường đích."
              : errorMessage === "MissingProject"
                ? "Hãy chọn dự án cần áp dụng công thức riêng."
                : errorMessage === "MissingResultColumn"
                  ? "Hãy chọn cột nhận kết quả."
                  : errorMessage.startsWith("UnexpectedClosingParenthesis:")
                    ? `Dấu ) tại vị trí ${Number(errorMessage.split(":")[1]) + 1} không có dấu ( tương ứng.`
                    : "Công thức chưa hoàn chỉnh hoặc sai kiểu dữ liệu.",
      });
    }
  };

  const removeDefault = () =>
    updateState((current) => {
      const templateId =
        editorMode === "template"
          ? selectedTemplateId
          : current.projects.find((project) => project.id === projectId)?.templateId;
      if (templateId) {
        return {
          ...current,
          projectFieldTemplates: current.projectFieldTemplates.map((template) =>
            template.id === templateId
              ? {
                  ...template,
                  disabledFormulaKeys: [
                    ...(template.disabledFormulaKeys ?? []).filter(
                      (key) =>
                        key !==
                        templateFormulaKey(
                          target,
                          targetField?.scope === "monthly" ? resultColumn : undefined,
                        ),
                    ),
                    templateFormulaKey(
                      target,
                      targetField?.scope === "monthly" ? resultColumn : undefined,
                    ),
                  ],
                  formulas: (template.formulas ?? []).filter(
                    (item) =>
                      !(
                        item.fieldId === target &&
                        item.columnId ===
                          (targetField?.scope === "monthly" ? resultColumn : undefined)
                      ),
                  ),
                }
              : template,
          ),
        };
      }
      return {
        ...current,
        fieldDefinitions: current.fieldDefinitions.map((field) =>
          field.id === target &&
          (targetField?.scope !== "project" || isProjectOwnedField(field, projectId))
            ? field.scope === "monthly"
              ? (() => {
                  const columnFormulas = (field.columnFormulas ?? []).filter(
                    (formula) => formula.columnId !== resultColumn,
                  );
                  return {
                    ...field,
                    formula: undefined,
                    columnFormulas,
                    inputMode: columnFormulas.length ? ("formula" as const) : ("manual" as const),
                  };
                })()
              : { ...field, inputMode: "manual", formula: undefined }
            : field,
        ),
      };
    });

  const confirmRemoveDefault = () => {
    removeDefault();
    setDeleteTemplateFormulaOpen(false);
    showToast(
      `Đã xóa công thức ${targetDisplayField?.label ?? target}${
        targetField?.scope === "monthly" ? ` của cột ${columnLabel(resultColumn)}` : ""
      } khỏi mẫu “${selectedTemplate?.label ?? "đã chọn"}”.`,
    );
  };

  const removeOverride = (id: string) =>
    updateState((current) =>
      targetField?.scope === "project"
        ? {
            ...current,
            projectFormulaOverrides: current.projectFormulaOverrides.filter(
              (item) => item.id !== id,
            ),
          }
        : {
            ...current,
            formulaOverrides: current.formulaOverrides.filter((item) => item.id !== id),
          },
    );

  const confirmReturnToTemplate = () => {
    if (!returnToTemplateOverride) return;
    removeOverride(returnToTemplateOverride.id);
    loadDefault(target, projectId, resultColumn, null);
    setReturnToTemplateOverrideId(null);
    if (targetColumnFormula) {
      showToast("Đã xóa cấu hình riêng. Dự án đã quay lại sử dụng công thức của mẫu.");
    } else {
      setMessage({
        severity: "warning",
        text: "Đã xóa cấu hình riêng. Mẫu hiện chưa có công thức thay thế cho trường này.",
      });
    }
  };

  const closeProjectEditor = () => {
    setProjectEditorOpen(false);
    loadDefault(target, projectId, resultColumn, null);
    setMessage(null);
    quickEditor?.onClose();
  };

  const closeTemplateEditor = () => {
    setTemplateEditorOpen(false);
    loadDefault(target, projectId, resultColumn, selectedTemplateId);
    setMessage(null);
  };

  const closeActiveEditor = () => {
    setDiscardEditorOpen(false);
    if (editorMode === "project") closeProjectEditor();
    else closeTemplateEditor();
  };

  const requestCloseEditor = () => {
    if (hasUnsavedEditorChanges) {
      setDiscardEditorOpen(true);
      return;
    }
    closeActiveEditor();
  };

  const readOnlyDefaultInternal =
    isReadOnlyDefault && targetColumnFormula
      ? formulaToTokens(targetColumnFormula, state, projectId, resultColumn)
          .map((token) => token.raw)
          .join(" ")
      : undefined;
  const previewInternal = readOnlyDefaultInternal ?? completedExpression.source;
  const inheritedFormulaBusiness = targetColumnFormula
    ? astToBusinessExpression(targetColumnFormula.ast, state, projectId, resultColumn)
    : "";
  const inheritedCoverageLabel =
    targetField?.scope === "monthly"
      ? formatMonthRange(
          inheritedMonths,
          state.periods.map((period) => period.month),
        )
      : projectOverrides.length
        ? "Đang được thay thế bởi công thức riêng"
        : "Toàn bộ dự án";
  const privateCoverageLabel =
    targetField?.scope === "monthly"
      ? privatelyConfiguredMonths.size
        ? formatMonthRange(
            [...privatelyConfiguredMonths],
            state.periods.map((period) => period.month),
          )
        : "Chưa có"
      : projectOverrides.length || formulaScope === "override"
        ? "Toàn bộ dự án"
        : "Chưa có";
  const preview = useMemo(() => {
    if (editorMode === "template" && !templatePreviewProjects.length) return null;
    if (!previewInternal || !projectId) return null;
    try {
      return new FormulaEngine(state).evaluate(
        projectId,
        parseFormula(previewInternal),
        state.selectedYear,
        month,
        resultColumn,
      );
    } catch {
      return null;
    }
  }, [
    editorMode,
    formulaScope,
    month,
    previewInternal,
    projectId,
    resultColumn,
    state,
    templatePreviewProjects.length,
  ]);

  const forProject = (field: NonNullable<typeof targetField>) => {
    if (editorMode === "template") {
      const templateItem =
        field.scope === "monthly"
          ? selectedTemplate?.fields.find((item) => item.fieldId === field.id)
          : selectedTemplate?.projectFields?.find((item) => item.fieldId === field.id);
      return {
        ...field,
        label: templateItem?.displayLabel?.trim() || field.label,
        suffix: templateItem?.displaySuffix?.trim() || field.suffix,
      };
    }
    return field.scope === "monthly"
      ? effectiveMonthlyField(state, projectId, field)
      : field.scope === "project"
        ? effectiveProjectField(state, projectId, field)
        : field;
  };
  const columnLabels = (columnIds: string[]) => columnIds.map(columnLabel).join(", ");
  const groups = [
    {
      title: "Thông tin dự án",
      fields: state.fieldDefinitions
        .filter(
          (field) => field.scope === "project" && !field.deletedAt && availableForProject(field),
        )
        .map(forProject),
    },
    {
      title: "Dữ liệu lịch",
      fields: state.fieldDefinitions.filter((field) => field.scope === "calendar"),
    },
    {
      title: "Dữ liệu theo tháng",
      fields: state.fieldDefinitions
        .filter(
          (field) => field.scope === "monthly" && !field.deletedAt && availableForProject(field),
        )
        .map(forProject),
    },
  ];
  const normalizedFieldSearch = normalizeSearchText(fieldSearch);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      fields: (targetField?.scope === "project" && !showMonthlySources
        ? group.fields.filter((field) => field.scope === "project")
        : group.fields
      ).filter((field) => {
        if (!normalizedFieldSearch) return true;
        return normalizeSearchText(`${field.label} ${field.id} ${field.suffix ?? ""}`).includes(
          normalizedFieldSearch,
        );
      }),
    }))
    .filter((group) => group.fields.length > 0);
  const targetDisplayField = targetField ? forProject(targetField) : undefined;
  const allPeriodMonths = state.periods.map((period) => period.month);
  const baseFormulaSourceLabel =
    targetColumnFormula && selectedTemplate
      ? `Theo mẫu ${selectedTemplate.label}`
      : targetColumnFormula
        ? "Công thức nền"
        : "Chưa cấu hình";
  const appliedFormulaViews: Array<{
    id: string;
    kind: "private" | "base";
    sourceLabel: string;
    formula?: FormulaDefinition;
    months?: number[];
    override?: FormulaOverride | ProjectFormulaOverride;
  }> =
    targetField?.scope === "project"
      ? projectOverrides[0]
        ? [
            {
              id: projectOverrides[0].id,
              kind: "private",
              sourceLabel: "Công thức riêng của dự án",
              formula: projectOverrides[0].formula,
              override: projectOverrides[0],
            },
          ]
        : [
            {
              id: "base-project-formula",
              kind: "base",
              sourceLabel: baseFormulaSourceLabel,
              formula: targetColumnFormula,
            },
          ]
      : targetField?.scope === "monthly"
        ? [
            ...projectMonthlyOverridesForTarget
              .slice()
              .sort((first, second) => Math.min(...first.months) - Math.min(...second.months))
              .map((override) => ({
                id: override.id,
                kind: "private" as const,
                sourceLabel: "Công thức riêng của dự án",
                formula: override.formula,
                months: override.months,
                override,
              })),
            ...(storedInheritedMonths.length
              ? [
                  {
                    id: "base-monthly-formula",
                    kind: "base" as const,
                    sourceLabel: baseFormulaSourceLabel,
                    formula: targetColumnFormula,
                    months: storedInheritedMonths,
                  },
                ]
              : []),
          ]
        : [];
  const returnToTemplateOverride = [...projectOverrides, ...projectMonthlyOverridesForTarget].find(
    (override) => override.id === returnToTemplateOverrideId,
  );
  const returnToTemplateFormula = returnToTemplateOverride?.formula;
  const returnToTemplateScopeLabel =
    returnToTemplateOverride && "months" in returnToTemplateOverride
      ? `${columnLabels([returnToTemplateOverride.columnId])} · ${formatMonthApplication(
          returnToTemplateOverride.months,
          allPeriodMonths,
        )}`
      : "Toàn bộ dự án";
  const saveMonthLabel = formatMonthRange(overrideMonths, allPeriodMonths);
  const saveContextLabels = [
    formulaScope === "default"
      ? selectedTemplate
        ? `Mẫu: ${selectedTemplate.label}`
        : "Công thức nền"
      : selectedProject
        ? `${selectedProject.code} · ${selectedProject.name}`
        : "Chưa chọn dự án",
    targetDisplayField?.label ?? "Chưa chọn trường",
    targetField?.scope === "monthly"
      ? `Cột: ${resultColumn ? columnLabels([resultColumn]) : "chưa chọn"}`
      : undefined,
    formulaScope === "override" && targetField?.scope === "monthly"
      ? `Tháng: ${saveMonthLabel || "chưa chọn"}`
      : targetField?.scope === "monthly"
        ? editorMode === "template"
          ? "Tất cả các tháng"
          : "Các tháng chưa có công thức riêng"
        : undefined,
  ].filter((item): item is string => Boolean(item));
  const overlappingCoverageLabels = overlappingMonthlyOverrides.map((item) => {
    const replacedMonths = formatMonthRange(
      item.months.filter((itemMonth) => overrideMonths.includes(itemMonth)),
      allPeriodMonths,
    );
    return `${columnLabels([item.columnId])}: ${replacedMonths}`;
  });

  const overrideContextReady =
    formulaScope === "default" ||
    (targetField?.scope === "project"
      ? Boolean(overrideProjectId && overrideProjectId !== "all")
      : overrideMonths.length > 0);
  const canEditScope = formulaScope === "override" || editorMode === "template";
  const canSave =
    canEditScope &&
    internal.trim().length > 0 &&
    overrideContextReady &&
    (targetField?.scope !== "monthly" || Boolean(resultColumn)) &&
    parenthesisAnalysis.unexpectedClosingIndexes.length === 0;
  const saveDisabledReason = (() => {
    if (isReadOnlyDefault)
      return selectedTemplate
        ? `Công thức của mẫu ${selectedTemplate.label} đang ở chế độ chỉ xem.`
        : "Công thức nền đang ở chế độ chỉ xem.";
    if (!targetField) return "Chưa chọn trường cần tính.";
    if (targetField.scope === "monthly" && !resultColumn) return "Chưa chọn cột nhận kết quả.";
    if (formulaScope === "override" && targetField.scope === "monthly" && !overrideMonths.length)
      return "Chưa chọn tháng áp dụng.";
    if (
      formulaScope === "override" &&
      targetField.scope === "project" &&
      (!overrideProjectId || overrideProjectId === "all")
    )
      return "Chưa chọn dự án áp dụng.";
    if (!internal.trim()) return "Công thức đang để trống.";
    if (parenthesisAnalysis.unexpectedClosingIndexes.length)
      return "Công thức có dấu ngoặc đóng không hợp lệ.";
    return "";
  })();

  return (
    <Stack spacing={2} sx={quickEditor ? { display: "none" } : undefined}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1 }}
      >
        <Box>
          <Typography variant="h4">Trình tạo công thức</Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: "center" }}>
          <Switch checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} />
          <Typography>Hiện thông tin kỹ thuật</Typography>
        </Stack>
      </Stack>
      <Tabs
        value={editorMode}
        onChange={(_, value: FormulaEditorMode) => selectEditorMode(value)}
        sx={{ minHeight: 42 }}
      >
        <Tab value="project" label="Công thức riêng dự án" />
        <Tab value="template" label="Công thức theo mẫu" />
      </Tabs>
      {message && !projectEditorOpen && !templateEditorOpen && (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      {editorMode === "project" && sameNameProjects.length > 1 && (
        <Alert severity="warning">
          Có {sameNameProjects.length} dự án cùng tên “{selectedProject?.name}”. Hãy đối chiếu mã dự
          án khi cấu hình công thức; mỗi mã có dữ liệu và công thức riêng.
        </Alert>
      )}
      <Card variant="outlined">
        <CardContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: targetField?.scope === "monthly" ? "1.4fr 1fr 0.9fr" : "1.4fr 1fr",
              },
              gap: 1.5,
              mt: 0.75,
            }}
          >
            {editorMode === "template" ? (
              <Autocomplete
                options={state.projectFieldTemplates}
                value={selectedTemplate ?? null}
                getOptionLabel={(template) => template.label}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                onChange={(_, template) => {
                  if (template) selectTemplate(template.id);
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Mẫu cấu hình" placeholder="Chọn mẫu cần sửa" />
                )}
              />
            ) : (
              <Autocomplete
                options={projects}
                value={selectedProject ?? null}
                getOptionLabel={(project) => `${project.code} · ${project.name}`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                filterOptions={(options, params) => {
                  const query = params.inputValue.trim().toLowerCase();
                  return query
                    ? options.filter((project) =>
                        `${project.code} ${project.name}`.toLowerCase().includes(query),
                      )
                    : options;
                }}
                onChange={(_, project) => {
                  if (project) selectProject(project.id);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Dự án đang cấu hình"
                    placeholder="Nhập tên dự án để tìm"
                  />
                )}
              />
            )}
            <Autocomplete
              options={[...targetFields].sort(
                (first, second) =>
                  fieldScopeLabel(first.scope).localeCompare(fieldScopeLabel(second.scope), "vi") ||
                  first.sortOrder - second.sortOrder,
              )}
              value={targetFields.find((field) => field.id === target) ?? null}
              getOptionLabel={(field) => forProject(field).label}
              groupBy={(field) => fieldScopeLabel(field.scope)}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, field) => {
                if (field) selectTarget(field.id);
              }}
              renderOption={(props, field) => {
                const displayField = forProject(field);
                const secondary = [
                  displayField.label !== field.label ? `Trường chung: ${field.label}` : undefined,
                  fieldScopeLabel(field.scope),
                  displayField.suffix,
                  inputModeLabel(field.inputMode),
                  advanced ? field.id : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li {...props} key={field.id}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {displayField.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {secondary}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label="Trường cần tính" placeholder="Tìm theo tên trường" />
              )}
            />
            {targetField?.scope === "monthly" && (
              <TextField
                select
                fullWidth
                label="Cột nhận kết quả"
                value={resultColumn}
                onChange={(event) => selectResultColumn(event.target.value)}
              >
                {state.monthlyColumns.map((item) => (
                  <MenuItem
                    key={item.id}
                    value={item.id}
                    disabled={!allowedResultColumns(target).includes(item.id)}
                  >
                    {advanced ? `${item.label} · ${item.code}` : item.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
          {editorMode === "template" && !targetFields.length && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Mẫu này chưa có trường dữ liệu. Hãy thêm trường vào mẫu trong Cấu hình dữ liệu trước
              khi tạo công thức.
            </Alert>
          )}
        </CardContent>
      </Card>

      {editorMode === "project" && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" color="primary">
                  Công thức đang áp dụng
                </Typography>
                <Typography variant="h6">
                  {targetDisplayField?.label ?? "Chưa chọn trường"}
                  {targetField?.scope === "monthly" ? ` · ${columnLabels([resultColumn])}` : ""}
                </Typography>
              </Box>

              {appliedFormulaViews.map((view) => (
                <Paper
                  key={view.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: view.kind === "private" ? "#FFF9F4" : "#F7FAFA",
                    borderColor: view.kind === "private" ? "secondary.light" : "divider",
                  }}
                >
                  <Stack spacing={1.25}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      sx={{
                        justifyContent: "space-between",
                        gap: 1,
                        alignItems: { sm: "center" },
                      }}
                    >
                      <Chip
                        size="small"
                        color={view.kind === "private" ? "secondary" : "primary"}
                        variant={view.kind === "private" ? "filled" : "outlined"}
                        label={view.sourceLabel}
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }}>
                        {targetField?.scope === "monthly"
                          ? formatMonthApplication(view.months ?? [], allPeriodMonths)
                          : "Áp dụng toàn bộ dự án"}
                      </Typography>
                    </Stack>

                    <Typography sx={{ fontWeight: 650, wordBreak: "break-word" }}>
                      {view.formula
                        ? astToBusinessExpression(view.formula.ast, state, projectId, resultColumn)
                        : "Chưa có công thức cho phạm vi này"}
                    </Typography>

                    {view.kind === "private" &&
                      targetField?.scope === "project" &&
                      templateFormulaBusiness && (
                        <Box sx={{ pt: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
                          <Typography variant="caption" color="text.secondary">
                            Nếu dùng lại mẫu, hệ thống sẽ áp dụng công thức này
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {templateFormulaBusiness}
                          </Typography>
                        </Box>
                      )}

                    <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                      {view.kind === "private" && view.override ? (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<EditOutlined />}
                            onClick={() => {
                              if (targetField?.scope === "project")
                                editProjectOverride(view.override as ProjectFormulaOverride);
                              else editOverride(view.override as FormulaOverride);
                            }}
                          >
                            Sửa công thức riêng
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="inherit"
                            onClick={() => setReturnToTemplateOverrideId(view.override?.id ?? null)}
                          >
                            {targetColumnFormula
                              ? "Dùng lại công thức mẫu…"
                              : "Xóa cấu hình riêng…"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<EditOutlined />}
                          disabled={!targetField || !selectedProject}
                          onClick={() => startNewOverride(view.months)}
                        >
                          {view.formula ? "Tùy chỉnh riêng" : "Tạo công thức riêng"}
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {editorMode === "template" && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" color="primary">
                  Công thức đang áp dụng
                </Typography>
                <Typography variant="h6">
                  {targetDisplayField?.label ?? "Chưa chọn trường"}
                  {targetField?.scope === "monthly" ? ` · ${columnLabels([resultColumn])}` : ""}
                </Typography>
              </Box>

              <Paper
                variant="outlined"
                sx={{ p: 2, bgcolor: targetColumnFormula ? "#F3FAFA" : "#FAFAFA" }}
              >
                <Stack spacing={1.25}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    sx={{ justifyContent: "space-between", gap: 1, alignItems: { sm: "center" } }}
                  >
                    <Chip
                      size="small"
                      color={targetColumnFormula ? "primary" : "default"}
                      variant="outlined"
                      label={targetColumnFormula ? formulaSourceLabel : "Chưa cấu hình"}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }}>
                      {targetField?.scope === "monthly"
                        ? "Áp dụng tất cả các tháng"
                        : "Áp dụng toàn bộ dự án"}
                    </Typography>
                  </Stack>

                  <Typography sx={{ fontWeight: 650, wordBreak: "break-word" }}>
                    {targetColumnFormula
                      ? astToBusinessExpression(
                          targetColumnFormula.ast,
                          state,
                          projectId,
                          resultColumn,
                        )
                      : "Mẫu chưa có công thức cho trường và cột này."}
                  </Typography>

                  <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                    <Chip
                      size="small"
                      label={`${templateProjectCount} dự án thuộc mẫu`}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={`${templateInheritedProjectCount} dự án chỉ dùng mẫu`}
                      variant="outlined"
                    />
                    {templatePrivateProjectCount > 0 && (
                      <Chip
                        size="small"
                        color="secondary"
                        label={`${templatePrivateProjectCount} dự án có tùy chỉnh riêng`}
                        variant="outlined"
                      />
                    )}
                  </Stack>

                  {templatePrivateProjectCount > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Các phạm vi đã có công thức riêng sẽ không bị ghi đè; phần còn lại vẫn kế thừa
                      công thức của mẫu.
                    </Typography>
                  )}
                </Stack>
              </Paper>

              <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<EditOutlined />}
                  disabled={!targetField || !selectedTemplate}
                  onClick={openTemplateEditor}
                >
                  {targetColumnFormula ? "Sửa công thức mẫu" : "Tạo công thức mẫu"}
                </Button>
                {targetColumnFormula && (
                  <Button color="error" onClick={() => setDeleteTemplateFormulaOpen(true)}>
                    Xóa công thức khỏi mẫu
                  </Button>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={deleteTemplateFormulaOpen}
        onClose={() => setDeleteTemplateFormulaOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Xóa công thức khỏi mẫu?</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              Các dự án đang kế thừa mẫu sẽ không còn được tính tự động ở phạm vi này. Công thức
              riêng của từng dự án vẫn được giữ nguyên.
            </Alert>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">
                CÔNG THỨC SẼ BỊ XÓA
              </Typography>
              <Typography sx={{ mt: 0.5, fontWeight: 700 }}>
                {targetDisplayField?.label ?? target}
                {targetField?.scope === "monthly" ? ` · ${columnLabel(resultColumn)}` : ""}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, wordBreak: "break-word" }}>
                {templateFormulaBusiness || "—"}
              </Typography>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 1.5 }}>
                <Chip size="small" variant="outlined" label={`Mẫu: ${selectedTemplate?.label}`} />
                <Chip
                  size="small"
                  variant="outlined"
                  label={
                    targetField?.scope === "monthly"
                      ? "Áp dụng tất cả các tháng chưa ghi đè"
                      : "Áp dụng toàn bộ dự án chưa ghi đè"
                  }
                />
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={`${templateProjectCount} dự án thuộc mẫu`}
                />
              </Stack>
            </Paper>
            {templatePrivateProjectCount > 0 && (
              <Typography variant="body2" color="text.secondary">
                {templatePrivateProjectCount} dự án có ít nhất một cấu hình riêng. Các cấu hình
                riêng đó không bị xóa; chỉ phần đang kế thừa công thức mẫu bị ảnh hưởng.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button color="inherit" onClick={() => setDeleteTemplateFormulaOpen(false)}>
            Giữ lại công thức
          </Button>
          <Button color="error" variant="contained" onClick={confirmRemoveDefault}>
            Xóa công thức khỏi mẫu
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(returnToTemplateOverride)}
        onClose={() => setReturnToTemplateOverrideId(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {targetColumnFormula ? "Dùng lại công thức mẫu?" : "Xóa cấu hình riêng?"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Kiểm tra thay đổi trước khi xóa cấu hình riêng của dự án này.
            </Typography>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
                <Typography variant="overline" color="secondary.main">
                  Đang áp dụng · cấu hình riêng
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {returnToTemplateScopeLabel}
                </Typography>
              </Stack>
              <Typography sx={{ mt: 0.75, fontWeight: 650, wordBreak: "break-word" }}>
                {returnToTemplateFormula
                  ? astToBusinessExpression(
                      returnToTemplateFormula.ast,
                      state,
                      projectId,
                      resultColumn,
                    )
                  : "—"}
              </Typography>
            </Paper>

            {targetColumnFormula ? (
              <Paper
                variant="outlined"
                sx={{ p: 2, bgcolor: "#F3FAFA", borderColor: "primary.light" }}
              >
                <Typography variant="overline" color="primary">
                  Sau khi quay lại ·{" "}
                  {selectedTemplate ? `mẫu ${selectedTemplate.label}` : "công thức nền"}
                </Typography>
                <Typography sx={{ mt: 0.75, fontWeight: 650, wordBreak: "break-word" }}>
                  {templateFormulaBusiness}
                </Typography>
              </Paper>
            ) : (
              <Alert severity="warning">
                Mẫu hiện chưa có công thức cho trường này. Sau khi xóa cấu hình riêng, trường sẽ
                không còn được tính tự động.
              </Alert>
            )}

            <Typography variant="body2" color="text.secondary">
              Cấu hình riêng sẽ bị xóa. Thao tác này không sửa công thức của mẫu và không ảnh hưởng
              đến các dự án khác.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button color="inherit" onClick={() => setReturnToTemplateOverrideId(null)}>
            Hủy
          </Button>
          <Button color="error" variant="contained" onClick={confirmReturnToTemplate}>
            {targetColumnFormula ? "Xóa công thức riêng và dùng mẫu" : "Xóa cấu hình riêng"}
          </Button>
        </DialogActions>
      </Dialog>

      <FormulaEditorSurface
        open={editorMode === "project" ? projectEditorOpen : templateEditorOpen}
        title={
          editorMode === "project"
            ? editingOverrideId
              ? "Sửa công thức riêng"
              : "Tạo công thức riêng"
            : targetColumnFormula
              ? "Sửa công thức mẫu"
              : "Tạo công thức mẫu"
        }
        context={[
          editorMode === "template"
            ? selectedTemplate?.label
            : selectedProject
              ? `${selectedProject.code} · ${selectedProject.name}`
              : undefined,
          targetDisplayField?.label,
          targetField?.scope === "monthly" ? columnLabels([resultColumn]) : undefined,
        ]
          .filter(Boolean)
          .join(" / ")}
        actions={
          quickEditor || targetField?.scope === "monthly" ? (
            <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
              {quickEditor && (
                <Chip
                  size="small"
                  color={formulaScope === "override" ? "secondary" : "primary"}
                  variant={formulaScope === "override" ? "filled" : "outlined"}
                  label={
                    formulaScope === "override"
                      ? "Đang dùng công thức riêng"
                      : selectedTemplate
                        ? `Đang kế thừa mẫu ${selectedTemplate.label}`
                        : "Đang dùng công thức nền"
                  }
                />
              )}
              {quickEditor && targetField?.scope === "monthly" && (
                <TextField
                  select
                  size="small"
                  label="Cột nhận kết quả"
                  value={resultColumn}
                  onChange={(event) => selectResultColumn(event.target.value)}
                  sx={{ minWidth: 150 }}
                >
                  {state.monthlyColumns.map((column) => (
                    <MenuItem
                      key={column.id}
                      value={column.id}
                      disabled={!allowedResultColumns(target).includes(column.id)}
                    >
                      {column.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {targetField?.scope === "monthly" && (
                <>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={formatMonthApplication(
                      formulaScope === "override" ? overrideMonths : allPeriodMonths,
                      allPeriodMonths,
                    )}
                  />
                  {formulaScope === "override" && !isReadOnlyDefault && (
                    <Button size="small" onClick={() => setMonthPickerOpen(true)}>
                      Thay đổi
                    </Button>
                  )}
                </>
              )}
            </Stack>
          ) : undefined
        }
        onClose={requestCloseEditor}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              lg: "minmax(390px, 9fr) minmax(300px, 7fr) minmax(230px, 4fr)",
            },
            gridTemplateAreas: {
              xs: message
                ? '"message" "formula" "data" "functions"'
                : '"formula" "data" "functions"',
              lg: message
                ? '"message message message" "formula data functions"'
                : '"formula data functions"',
            },
            gridTemplateRows: {
              lg: message ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)",
            },
            gap: 2,
            height: { lg: "100%" },
            minHeight: 0,
            alignItems: "start",
          }}
        >
          {message && (
            <Alert
              severity={message.severity}
              onClose={() => setMessage(null)}
              sx={{ gridArea: "message" }}
            >
              {message.text}
            </Alert>
          )}
          <Box
            sx={{
              display: "contents",
            }}
          >
            {isReadOnlyDefault ? (
              <Card variant="outlined" sx={{ gridArea: "formula", minWidth: 0 }}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography variant="overline" color="primary">
                        {targetTemplateFormula && selectedTemplate
                          ? `Kế thừa từ mẫu ${selectedTemplate.label}`
                          : "Công thức nền · chỉ xem"}
                      </Typography>
                      <Typography variant="h6">
                        {targetDisplayField?.label ?? "Chưa chọn trường"}
                      </Typography>
                    </Box>
                    <Alert severity="info">
                      {targetTemplateFormula && selectedTemplate
                        ? `Công thức này đang dùng chung cho ${templateProjectCount} dự án thuộc mẫu. Chỉ tùy chỉnh khi dự án này cần cách tính khác.`
                        : "Công thức nền không chỉnh trực tiếp trong chế độ thường. Chỉ tùy chỉnh khi dự án này cần cách tính khác."}
                    </Alert>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "#F7FAFA" }}>
                      <Typography variant="caption" color="text.secondary">
                        CÔNG THỨC ĐANG ÁP DỤNG
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.75, wordBreak: "break-word" }}>
                        {inheritedFormulaBusiness || "Mẫu chưa có công thức cho trường này"}
                      </Typography>
                      <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 1.25 }}>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Mẫu áp dụng: ${inheritedCoverageLabel}`}
                        />
                        {privateCoverageLabel !== "Chưa có" && (
                          <Chip
                            size="small"
                            color="secondary"
                            variant="outlined"
                            label={`Công thức riêng: ${privateCoverageLabel}`}
                          />
                        )}
                      </Stack>
                    </Paper>
                    <Button
                      variant="contained"
                      disabled={!targetField || !selectedProject}
                      onClick={() =>
                        projectOverrides[0]
                          ? editProjectOverride(projectOverrides[0])
                          : startNewOverride()
                      }
                      sx={{ alignSelf: "flex-start" }}
                    >
                      {projectOverrides[0]
                        ? "Sửa công thức riêng đang áp dụng"
                        : "Tùy chỉnh riêng cho dự án này"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <>
                <Dialog
                  open={monthPickerOpen}
                  onClose={() => setMonthPickerOpen(false)}
                  fullWidth
                  maxWidth="sm"
                >
                  <DialogTitle sx={{ pr: 7 }}>
                    <Typography variant="h6">Chọn tháng áp dụng</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Công thức riêng chỉ thay thế công thức chung tại những tháng được chọn.
                    </Typography>
                    <IconButton
                      aria-label="Đóng chọn tháng áp dụng"
                      onClick={() => setMonthPickerOpen(false)}
                      sx={{ position: "absolute", right: 12, top: 12 }}
                    >
                      <CloseRounded />
                    </IconButton>
                  </DialogTitle>
                  <DialogContent dividers>
                    <FormControl fullWidth sx={{ mt: 1 }}>
                      <InputLabel>Tháng áp dụng</InputLabel>
                      <Select
                        multiple
                        label="Tháng áp dụng"
                        value={overrideMonths}
                        onChange={(event) => {
                          setOverrideMonths(event.target.value as number[]);
                          setEditorOptionsDirty(true);
                        }}
                        renderValue={(items) => formatMonthRange(items, allPeriodMonths)}
                      >
                        {state.periods.map((period) => (
                          <MenuItem key={period.month} value={period.month}>
                            {period.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Stack direction="row" sx={{ gap: 0.5, mt: 0.5 }}>
                      <Button
                        size="small"
                        onClick={() => {
                          setOverrideMonths(state.periods.map((period) => period.month));
                          setEditorOptionsDirty(true);
                        }}
                      >
                        Cả năm
                      </Button>
                      <Button
                        size="small"
                        onClick={() => {
                          setOverrideMonths([]);
                          setEditorOptionsDirty(true);
                        }}
                      >
                        Bỏ chọn
                      </Button>
                    </Stack>
                    {overlappingCoverageLabels.length > 0 && (
                      <Alert severity="warning" sx={{ mt: 1.5 }}>
                        Cấu hình mới sẽ thay thế {overlappingCoverageLabels.join("; ")} trong công
                        thức cũ. Những tháng không giao nhau vẫn được giữ nguyên.
                      </Alert>
                    )}
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => setMonthPickerOpen(false)}>Xong</Button>
                  </DialogActions>
                </Dialog>

                <Dialog
                  open={showReferenceDetails}
                  onClose={() => setShowReferenceDetails(false)}
                  fullWidth
                  maxWidth="sm"
                >
                  <DialogTitle sx={{ pr: 7 }}>
                    <Typography variant="h6">Thay đổi tham chiếu</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Thiết lập cột và thời điểm cho trường dữ liệu được chèn tiếp theo.
                    </Typography>
                    <IconButton
                      aria-label="Đóng thay đổi tham chiếu"
                      onClick={() => setShowReferenceDetails(false)}
                      sx={{ position: "absolute", right: 12, top: 12 }}
                    >
                      <CloseRounded />
                    </IconButton>
                  </DialogTitle>
                  <DialogContent dividers>
                    <Stack spacing={2}>
                      <TextField
                        select
                        fullWidth
                        label="Cột tham chiếu"
                        value={
                          targetField?.scope === "monthly" && referenceColumn === resultColumn
                            ? SAME_RESULT_COLUMN
                            : referenceColumn
                        }
                        helperText={
                          referenceColumn === SAME_RESULT_COLUMN
                            ? `Mặc định theo cột nhận kết quả: ${resolvedReferenceColumnLabel}.`
                            : "Trường tháng được chèn tiếp theo sẽ đọc từ cột này."
                        }
                        onChange={(event) => setReferenceColumn(event.target.value)}
                      >
                        {targetField?.scope === "monthly" && (
                          <MenuItem value={SAME_RESULT_COLUMN}>
                            {resolvedReferenceColumnLabel} (mặc định)
                          </MenuItem>
                        )}
                        {state.monthlyColumns
                          .filter(
                            (item) => targetField?.scope !== "monthly" || item.id !== resultColumn,
                          )
                          .map((item) => (
                            <MenuItem key={item.id} value={item.id}>
                              {advanced ? `${item.label} · ${item.code}` : item.label}
                            </MenuItem>
                          ))}
                      </TextField>

                      <TextField
                        select
                        fullWidth
                        label="Thời điểm tham chiếu"
                        value={periodKind}
                        onChange={(event) =>
                          setPeriodKind(event.target.value as PeriodSelector["kind"])
                        }
                      >
                        {[
                          { value: "current", label: "Tháng hiện tại" },
                          { value: "previous", label: "Tháng trước" },
                          { value: "next", label: "Tháng sau" },
                          { value: "offset", label: "N tháng trước/sau" },
                          { value: "specific", label: "Một tháng cụ thể" },
                          { value: "range", label: "Khoảng tháng" },
                          { value: "selected", label: "Danh sách tháng" },
                          { value: "even", label: "Các tháng chẵn" },
                          { value: "odd", label: "Các tháng lẻ" },
                          { value: "ytd", label: "Từ đầu năm đến tháng hiện tại" },
                        ].map((item) => (
                          <MenuItem key={item.value} value={item.value}>
                            {advanced ? `${item.label} · ${item.value}` : item.label}
                          </MenuItem>
                        ))}
                      </TextField>

                      {periodKind === "offset" && (
                        <TextField
                          fullWidth
                          type="number"
                          label="Khoảng cách tháng (âm = trước)"
                          value={periodA}
                          onChange={(event) => setPeriodA(Number(event.target.value))}
                        />
                      )}

                      {periodKind === "specific" && (
                        <TextField
                          select
                          fullWidth
                          label="Tháng tham chiếu"
                          value={periodA}
                          onChange={(event) => setPeriodA(Number(event.target.value))}
                        >
                          {state.periods.map((period) => (
                            <MenuItem key={period.month} value={period.month}>
                              {period.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}

                      {periodKind === "range" && (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <TextField
                            select
                            fullWidth
                            label="Từ tháng"
                            value={periodA}
                            onChange={(event) => setPeriodA(Number(event.target.value))}
                          >
                            {state.periods.map((period) => (
                              <MenuItem key={period.month} value={period.month}>
                                T{period.month}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            select
                            fullWidth
                            label="Đến tháng"
                            value={periodB}
                            onChange={(event) => setPeriodB(Number(event.target.value))}
                          >
                            {state.periods.map((period) => (
                              <MenuItem key={period.month} value={period.month}>
                                T{period.month}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Stack>
                      )}

                      {periodKind === "selected" && (
                        <FormControl fullWidth>
                          <InputLabel>Danh sách tháng tham chiếu</InputLabel>
                          <Select
                            multiple
                            label="Danh sách tháng tham chiếu"
                            value={selectedMonths}
                            onChange={(event) => setSelectedMonths(event.target.value as number[])}
                            renderValue={(items) => formatMonthRange(items, allPeriodMonths)}
                          >
                            {state.periods.map((period) => (
                              <MenuItem key={period.month} value={period.month}>
                                {period.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </Stack>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => setShowReferenceDetails(false)}>Xong</Button>
                  </DialogActions>
                </Dialog>

                {
                  <>
                    <Box
                      sx={{
                        display: "contents",
                      }}
                    >
                      <Card
                        variant="outlined"
                        sx={{
                          gridArea: "data",
                          minWidth: 0,
                          minHeight: 0,
                          maxHeight: { lg: "100%" },
                          overflowY: { lg: "auto" },
                        }}
                      >
                        <CardContent sx={{ minHeight: 0 }}>
                          <Typography variant="overline" color="primary">
                            2 · Chọn dữ liệu
                          </Typography>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            sx={{
                              mt: 0.75,
                              gap: 0.75,
                              alignItems: { sm: "center" },
                              flexWrap: "wrap",
                            }}
                          >
                            {(targetField?.scope === "monthly" || showMonthlySources) && (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => setShowReferenceDetails(true)}
                              >
                                Thay đổi
                              </Button>
                            )}
                            {targetField?.scope === "project" && (
                              <Button
                                size="small"
                                variant={showMonthlySources ? "outlined" : "text"}
                                onClick={() => setShowMonthlySources((current) => !current)}
                              >
                                {showMonthlySources
                                  ? "Chỉ hiện thông tin dự án"
                                  : "Dùng thêm dữ liệu theo tháng"}
                              </Button>
                            )}
                          </Stack>
                          <TextField
                            fullWidth
                            size="small"
                            label="Tìm trường dữ liệu"
                            placeholder="Nhập tên, mã hoặc hậu tố"
                            value={fieldSearch}
                            onChange={(event) => setFieldSearch(event.target.value)}
                            sx={{ mt: 1.25 }}
                          />
                          {visibleGroups.length === 0 && (
                            <Alert severity="info" sx={{ mt: 1.25 }}>
                              Không tìm thấy trường phù hợp với “{fieldSearch}”.
                            </Alert>
                          )}
                          {visibleGroups.map((group) => (
                            <Box key={group.title} sx={{ mt: 1.5 }}>
                              <Typography variant="subtitle2" gutterBottom>
                                {group.title}
                              </Typography>
                              <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
                                {group.fields.map((field) => {
                                  const baseField = fieldDefinitionForProject(
                                    state,
                                    projectId,
                                    field.id,
                                  );
                                  const availableColumns =
                                    field.scope === "monthly"
                                      ? state.monthlyColumns
                                          .filter((column) =>
                                            monthlyFieldAllowsColumn(
                                              state,
                                              projectId,
                                              field.id,
                                              column.id,
                                            ),
                                          )
                                          .map((column) => column.label)
                                          .join(", ")
                                      : "";
                                  const sourceFormula = baseFormulaForProject(
                                    state,
                                    projectId,
                                    baseField,
                                    resolvedReferenceColumn,
                                  );
                                  return (
                                    <Tooltip
                                      key={field.id}
                                      arrow
                                      title={
                                        <Stack spacing={0.35} sx={{ py: 0.25 }}>
                                          <Typography variant="body2" sx={{ fontWeight: 750 }}>
                                            {field.label}
                                          </Typography>
                                          {baseField && baseField.label !== field.label && (
                                            <Typography variant="caption">
                                              Trường chung: {baseField.label}
                                            </Typography>
                                          )}
                                          <Typography variant="caption">
                                            Phạm vi: {fieldScopeLabel(field.scope)}
                                            {field.suffix ? ` · Hậu tố: ${field.suffix}` : ""}
                                          </Typography>
                                          {availableColumns && (
                                            <Typography variant="caption">
                                              Có dữ liệu tại: {availableColumns}
                                            </Typography>
                                          )}
                                          {sourceFormula && (
                                            <Typography variant="caption">
                                              Công thức:{" "}
                                              {astToBusinessExpression(
                                                sourceFormula.ast,
                                                state,
                                                projectId,
                                              )}
                                            </Typography>
                                          )}
                                        </Stack>
                                      }
                                    >
                                      <Chip
                                        clickable
                                        color={field.id === target ? "secondary" : "default"}
                                        variant="outlined"
                                        label={`${field.label}${field.suffix ? ` · ${field.suffix}` : ""}`}
                                        onClick={() => addReference(field.id)}
                                      />
                                    </Tooltip>
                                  );
                                })}
                              </Stack>
                            </Box>
                          ))}
                        </CardContent>
                      </Card>
                      <Card
                        variant="outlined"
                        sx={{
                          gridArea: "functions",
                          minWidth: 0,
                          minHeight: 0,
                          maxHeight: { lg: "100%" },
                          overflowY: { lg: "auto" },
                        }}
                      >
                        <CardContent>
                          <Typography variant="overline" color="primary">
                            3 · Hàm và toán tử
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Gõ trực tiếp số, dấu <strong>+ − * / ^ ( )</strong>, phép so sánh hoặc
                            tên hàm trong ô công thức. Có thể bắt đầu bằng dấu = như Excel.
                          </Typography>
                          <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 1.5 }}>
                            {functionCatalog.map((item) => (
                              <Chip
                                key={item.code}
                                clickable
                                label={advanced ? item.syntax : item.label}
                                title={item.description}
                                onClick={() => editorRef.current?.insertFunction(item.code)}
                              />
                            ))}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Box>
                  </>
                }

                <Card
                  variant="outlined"
                  sx={{
                    gridArea: "formula",
                    minWidth: 0,
                    minHeight: 0,
                    maxHeight: { lg: "100%" },
                    overflowY: { lg: "auto" },
                    boxShadow: { lg: "0 8px 20px rgba(23,43,48,.06)" },
                  }}
                >
                  <CardContent>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
                    >
                      <Box>
                        <Typography variant="overline" color="primary">
                          {editorMode === "template" ? "1 · Công thức mẫu" : "Công thức riêng"}
                        </Typography>
                        <Typography variant="h6">
                          {editorMode === "project"
                            ? "Soạn biểu thức"
                            : `${targetDisplayField?.label ?? ""}${advanced && targetField?.code ? ` · ${targetField.id}` : ""}`}
                        </Typography>
                      </Box>
                      {quickEditor && editingOverrideId && (
                        <Button
                          color="inherit"
                          variant="outlined"
                          onClick={() => setReturnToTemplateOverrideId(editingOverrideId)}
                        >
                          {targetColumnFormula ? "Quay lại công thức mẫu…" : "Xóa công thức riêng…"}
                        </Button>
                      )}
                    </Stack>
                    {/(^|\W)ROUND(?:UP|DOWN)?\s*\(/i.test(internal) && (
                      <Alert severity="warning" sx={{ mt: 1.5 }}>
                        ROUND, ROUNDUP và ROUNDDOWN thay đổi giá trị tính toán thật nên các công
                        thức phụ thuộc cũng nhận giá trị đã làm tròn. Nếu chỉ muốn giao diện bớt số
                        lẻ, hãy cấu hình “Số lẻ khi hiển thị” của trường.
                      </Alert>
                    )}
                    <FormulaExpressionEditor
                      ref={editorRef}
                      tokens={tokens}
                      revision={editorRevision}
                      onChange={setExpression}
                    />
                    {parenthesisAnalysis.missingClosingCount > 0 &&
                      parenthesisAnalysis.unexpectedClosingIndexes.length === 0 && (
                        <Alert
                          severity="warning"
                          sx={{ mt: 1 }}
                          action={
                            <Button
                              color="inherit"
                              size="small"
                              onClick={() =>
                                editorRef.current?.appendClosingParentheses(
                                  parenthesisAnalysis.missingClosingCount,
                                )
                              }
                            >
                              Bổ sung ngay
                            </Button>
                          }
                        >
                          Thiếu {parenthesisAnalysis.missingClosingCount} dấu ) ở cuối công thức.
                          Nếu bấm lưu, hệ thống sẽ tự bổ sung.
                        </Alert>
                      )}
                    {parenthesisAnalysis.unexpectedClosingIndexes.length > 0 && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        Dấu ) tại vị trí {parenthesisAnalysis.unexpectedClosingIndexes[0] + 1} không
                        có dấu ( tương ứng. Dấu lỗi đã được đánh dấu trong công thức.
                      </Alert>
                    )}
                    {
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 0.75 }}
                      >
                        Ctrl+Z để hoàn tác. Bấm vào một trường tham chiếu rồi nhấn Backspace hoặc
                        Delete để xóa trường tham chiếu đó.
                      </Typography>
                    }
                    <PreviewPanel
                      state={state}
                      targetField={targetField ? forProject(targetField) : undefined}
                      projectId={projectId}
                      month={month}
                      setMonth={setMonth}
                      advanced={advanced}
                      preview={preview}
                      showMonthContext={targetField?.scope === "monthly" || showMonthlySources}
                      templateMode={editorMode === "template"}
                      previewProjects={templatePreviewProjects}
                      onProject={selectProject}
                    />
                    <Paper
                      variant="outlined"
                      sx={{
                        mt: 1.5,
                        p: 1.25,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        sx={{
                          gap: 1.25,
                          justifyContent: "space-between",
                          alignItems: { md: "center" },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          {editorMode === "template" && (
                            <>
                              <Typography variant="caption" color="text.secondary">
                                SẼ LƯU CHO
                              </Typography>
                              <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap", mt: 0.35 }}>
                                {saveContextLabels.map((label) => (
                                  <Chip key={label} size="small" variant="outlined" label={label} />
                                ))}
                              </Stack>
                            </>
                          )}
                          {!canSave && saveDisabledReason && (
                            <Typography
                              variant="caption"
                              color="warning.main"
                              sx={{ display: "block", mt: 0.5 }}
                            >
                              Chưa thể lưu: {saveDisabledReason}
                            </Typography>
                          )}
                        </Box>
                        <Tooltip title={!canSave ? saveDisabledReason : ""} arrow>
                          <span>
                            <Button
                              variant="contained"
                              startIcon={<SaveRounded />}
                              disabled={!canSave}
                              onClick={save}
                              sx={{ whiteSpace: "nowrap" }}
                            >
                              {editingOverrideId ? "Cập nhật ghi đè" : "Lưu công thức"}
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    </Paper>
                    {advanced && (
                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        label="Biểu thức nội bộ"
                        value={internal}
                        sx={{ mt: 1 }}
                        slotProps={{ input: { readOnly: true } }}
                      />
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </Box>
        </Box>
      </FormulaEditorSurface>

      <Dialog open={discardEditorOpen} onClose={() => setDiscardEditorOpen(false)} maxWidth="sm">
        <DialogTitle>Bỏ các thay đổi chưa lưu?</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Công thức hoặc phạm vi áp dụng đã được thay đổi. Nếu đóng trình soạn, các thay đổi này
            sẽ không được lưu.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button color="inherit" onClick={() => setDiscardEditorOpen(false)}>
            Tiếp tục chỉnh sửa
          </Button>
          <Button color="error" variant="contained" onClick={closeActiveEditor}>
            Bỏ thay đổi
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function PreviewPanel({
  state,
  targetField,
  projectId,
  month,
  setMonth,
  advanced,
  preview,
  showMonthContext,
  templateMode,
  previewProjects,
  onProject,
}: {
  state: ReturnType<typeof useKkv>["state"];
  targetField: ReturnType<typeof useKkv>["state"]["fieldDefinitions"][number] | undefined;
  projectId: string;
  month: number;
  setMonth: (value: number) => void;
  advanced: boolean;
  preview: ReturnType<FormulaEngine["evaluate"]> | null;
  showMonthContext: boolean;
  templateMode: boolean;
  previewProjects: ReturnType<typeof projectsForYear>;
  onProject: (projectId: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const displayValue = preview?.value.kind === "scalar" ? preview.value.value : null;
  const rawState = preview?.state;
  const stateLabels: Record<string, string> = {
    Value: "Có kết quả",
    Null: "Chưa có dữ liệu",
    Error: "Có lỗi",
    ErrorFallback: "Dùng giá trị thay thế",
  };
  const stateLabel = advanced
    ? (rawState ?? "Chưa có")
    : (stateLabels[rawState ?? ""] ?? "Chưa có");
  const errorLabel = preview?.errorCode ? formulaErrorLabel(preview.errorCode) : "";
  const contextLabel = (columnId?: string) =>
    state.monthlyColumns.find((item) => item.id === columnId)?.label ?? "Thông tin dự án";
  const missingInputs = Array.from(
    new Map(
      (preview?.trace ?? [])
        .filter((entry) => entry.value == null)
        .map((entry) => [
          `${entry.fieldId}|${entry.month ?? "project"}|${entry.columnId ?? "project"}`,
          entry,
        ]),
    ).values(),
  );

  const resultDisplay =
    preview?.state === "Error" ? (
      <Typography variant="subtitle1" color="error" sx={{ fontWeight: 750 }}>
        {advanced ? `${errorLabel} · ${preview.errorCode}` : errorLabel}
      </Typography>
    ) : targetField ? (
      <FieldValueDisplay field={targetField} value={displayValue} strong />
    ) : (
      <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
        —
      </Typography>
    );

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 1,
          mt: 1.25,
          bgcolor: preview?.state === "Error" ? "error.50" : "primary.50",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ gap: 1, alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Stack
            direction="row"
            sx={{ gap: 1, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}
          >
            <Typography variant="subtitle2">Kết quả xem thử</Typography>
            {resultDisplay}
            <Chip
              size="small"
              label={stateLabel}
              color={
                preview?.state === "Error" ? "error" : rawState === "Value" ? "success" : "warning"
              }
            />
          </Stack>
          <Stack direction="row" sx={{ gap: 0.75, alignItems: "center", flexShrink: 0 }}>
            {showMonthContext && (
              <TextField
                select
                size="small"
                label="Tháng"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                sx={{ minWidth: 118 }}
              >
                {state.periods.map((period) => (
                  <MenuItem key={period.month} value={period.month}>
                    {period.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button size="small" variant="outlined" onClick={() => setShowDetails(true)}>
              Xem chi tiết
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Dialog open={showDetails} onClose={() => setShowDetails(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 7 }}>
          <Typography variant="h6">Chi tiết kết quả xem thử</Typography>
          <Typography variant="body2" color="text.secondary">
            Kiểm tra dữ liệu đầu vào và ngữ cảnh được dùng trong phép tính.
          </Typography>
          <IconButton
            aria-label="Đóng chi tiết kết quả"
            onClick={() => setShowDetails(false)}
            sx={{ position: "absolute", right: 12, top: 12 }}
          >
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 1.5 }}>
            {templateMode &&
              (previewProjects.length ? (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Dữ liệu dự án dùng để xem thử"
                  value={previewProjects.some((item) => item.id === projectId) ? projectId : ""}
                  onChange={(event) => onProject(event.target.value)}
                >
                  {previewProjects.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Alert severity="info" sx={{ flex: 1 }}>
                  Chưa có dự án dùng mẫu này để xem thử.
                </Alert>
              ))}
            {showMonthContext && (
              <TextField
                select
                size="small"
                label="Tháng xem thử"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                sx={{ minWidth: 170 }}
              >
                {state.periods.map((period) => (
                  <MenuItem key={period.month} value={period.month}>
                    {period.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>

          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              mt: 1.5,
              bgcolor: preview?.state === "Error" ? "error.50" : "primary.50",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              KẾT QUẢ
            </Typography>
            {resultDisplay}
            <Stack direction="row" sx={{ gap: 0.75, mt: 1, flexWrap: "wrap" }}>
              <Chip
                size="small"
                label={stateLabel}
                color={
                  preview?.state === "Error"
                    ? "error"
                    : rawState === "Value"
                      ? "success"
                      : "warning"
                }
              />
              {preview?.usedFallback && (
                <Chip size="small" variant="outlined" label="Đã dùng giá trị thay thế" />
              )}
            </Stack>
          </Paper>

          {missingInputs.length > 0 && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Thiếu {missingInputs.length} dữ liệu để tính:
              </Typography>
              <Box component="ul" sx={{ mt: 0.75, mb: 0, pl: 2.25 }}>
                {missingInputs.map((entry) => (
                  <li key={`${entry.fieldId}-${entry.month}-${entry.columnId}`}>
                    <Typography variant="body2">
                      {entry.label}
                      {entry.month ? ` · ${contextLabel(entry.columnId)} · T${entry.month}` : ""}
                    </Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          <Typography variant="h6" sx={{ mt: 2 }}>
            Dữ liệu tham gia ({preview?.trace.length ?? 0})
          </Typography>
          <Box sx={{ mt: 1, maxHeight: 360, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Trường</TableCell>
                  <TableCell>Ngữ cảnh</TableCell>
                  <TableCell align="right">Giá trị</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview?.trace.map((entry, index) => (
                  <TableRow key={`${entry.fieldId}-${entry.month}-${index}`}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>
                        {entry.label}
                      </Typography>
                      {advanced && (
                        <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                          {entry.fieldId}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.month ? `T${entry.month}` : "Dự án"}
                      <Typography sx={{ display: "block" }} variant="caption">
                        {advanced
                          ? `${contextLabel(entry.columnId)}${entry.columnId ? ` · ${entry.columnId}` : ` · ${entry.semanticType}`}`
                          : contextLabel(entry.columnId)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {entry.value == null ? "—" : String(entry.value)}
                    </TableCell>
                  </TableRow>
                ))}
                {!preview?.trace.length && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography color="text.secondary" align="center">
                        Chưa có dữ liệu tham chiếu
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDetails(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
