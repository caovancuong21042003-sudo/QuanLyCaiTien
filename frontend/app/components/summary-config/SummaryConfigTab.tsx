import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Tabs,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import SaveRounded from "@mui/icons-material/SaveRounded";
import type {
  KkvState,
  SummaryColumnDefinition,
  SummaryFormulaDefinition,
  SummaryRowDefinition,
} from "../../domain/types";
import { isNumericSemanticType } from "../../domain/field-behavior";
import { createClientId } from "../../utils/id";
import { createTechnicalCode } from "../../utils/technical-code";
import {
  FormulaExpressionEditor,
  type FormulaEditorHandle,
} from "../formula-builder/FormulaExpressionEditor";
import { FormulaEditorSurface } from "../formula-builder/FormulaEditorSurface";
import { functionCatalog } from "../../formula/function-catalog";
import { FormulaEngine } from "../../formula/formula-engine";
import { parseFormula } from "../../formula/parser";
import { typeCheck } from "../../formula/type-checker";
import {
  analyzeParentheses,
  completeMissingClosingParentheses,
} from "../../formula/formula-validation";
import {
  astToBusinessExpression,
  formulaToTokens,
  periodLabel,
  periodToSyntax,
  type DisplayToken,
} from "../../formula/ast-utils";
import type { FormulaAst, PeriodSelector, ProjectScope } from "../../formula/ast";
import type { CalculationResult, TraceEntry } from "../../domain/calculation-result";
import { useToast } from "../../context/toast-context";
import { FieldValueDisplay } from "../dynamic-fields/FieldValueDisplay";
import { fieldScopeLabel, formulaErrorLabel } from "../../domain/field-labels";
import { formatMonthRange, formatMonthSelectionSummary } from "../../utils/month-range";
import {
  defaultMonthlyColumnId,
  monthlyFieldForSummaryMetric,
  summaryMetricAsField,
} from "../../domain/metadata";

type UpdateState = (updater: (state: KkvState) => KkvState) => void;
type FormulaTarget = Pick<
  SummaryFormulaDefinition,
  "targetKind" | "summaryId" | "metricId" | "columnId"
>;
type SummarySelection = Pick<FormulaTarget, "targetKind" | "summaryId">;

function aggregateProjectScope(ast: FormulaAst): Exclude<ProjectScope, "current"> | undefined {
  if (
    ast.kind === "fieldReference" ||
    ast.kind === "metricReference" ||
    ast.kind === "summaryReference"
  )
    return ast.projectScope === "all" || ast.projectScope === "filtered"
      ? ast.projectScope
      : undefined;
  if (ast.kind === "binary")
    return aggregateProjectScope(ast.left) ?? aggregateProjectScope(ast.right);
  if (ast.kind === "function")
    return ast.args.map(aggregateProjectScope).find((scope) => Boolean(scope));
  return undefined;
}

function summaryFormulaKey(target: FormulaTarget): string {
  return `${target.targetKind}|${target.summaryId}|${target.metricId}|${target.columnId}`;
}

function summaryDependencies(ast: FormulaAst): string[] {
  if (ast.kind === "summaryReference")
    return [`${ast.summaryKind}|${ast.summaryId}|${ast.metricId}|${ast.columnId}`];
  if (ast.kind === "binary")
    return [...summaryDependencies(ast.left), ...summaryDependencies(ast.right)];
  if (ast.kind === "function") return ast.args.flatMap(summaryDependencies);
  return [];
}

function createsSummaryCycle(
  state: KkvState,
  target: FormulaTarget,
  candidate: FormulaAst,
): boolean {
  const targetKey = summaryFormulaKey(target);
  const dependencies = new Map(
    state.summaryFormulas.map((item) => [
      summaryFormulaKey(item),
      summaryDependencies(item.formula.ast),
    ]),
  );
  dependencies.set(targetKey, summaryDependencies(candidate));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const cyclic = (dependencies.get(key) ?? []).some(visit);
    visiting.delete(key);
    visited.add(key);
    return cyclic;
  };

  return visit(targetKey);
}

function firstReferencePeriodKind(ast: FormulaAst): PeriodSelector["kind"] | undefined {
  if (ast.kind === "fieldReference" || ast.kind === "metricReference")
    return ast.period?.kind ?? "current";
  if (ast.kind === "binary")
    return firstReferencePeriodKind(ast.left) ?? firstReferencePeriodKind(ast.right);
  if (ast.kind === "function")
    return ast.args.map(firstReferencePeriodKind).find((kind) => Boolean(kind));
  return undefined;
}

function summaryBusinessExpression(
  ast: FormulaAst,
  state: KkvState,
  targetKind: SummaryFormulaDefinition["targetKind"],
): string {
  const expression = astToBusinessExpression(ast, state);
  if (targetKind !== "row") return expression;
  return expression
    .replaceAll("Từ đầu năm đến tháng này", "Từ đầu năm đến cột hiện tại")
    .replaceAll("Tháng hiện tại", "Cột hiện tại");
}

export function SummaryConfigTab({
  state,
  updateState,
}: {
  state: KkvState;
  updateState: UpdateState;
}) {
  const [columnDraft, setColumnDraft] = useState<SummaryColumnDefinition | null>(null);
  const [rowDraft, setRowDraft] = useState<SummaryRowDefinition | null>(null);
  const [formulaTarget, setFormulaTarget] = useState<FormulaTarget | null>(null);
  const [summarySelection, setSummarySelection] = useState<SummarySelection>(() => ({
    targetKind: state.summaryColumns.length ? "column" : "row",
    summaryId: state.summaryColumns[0]?.id ?? state.summaryRows[0]?.id ?? "",
  }));
  const [error, setError] = useState<string | null>(null);

  const summaryColumns = [...state.summaryColumns].sort((a, b) => a.sortOrder - b.sortOrder);
  const summaryRows = [...state.summaryRows].sort((a, b) => a.sortOrder - b.sortOrder);

  const openNewColumn = () => {
    setError(null);
    setColumnDraft({
      id: "",
      code: "",
      label: "",
      months: state.periods.map((period) => period.month),
      columnIds: state.monthlyColumns.map((column) => column.id),
      sortOrder: Math.max(0, ...state.summaryColumns.map((item) => item.sortOrder)) + 10,
      enabled: true,
    });
  };

  const saveColumn = () => {
    if (!columnDraft) return;
    if (!columnDraft.label.trim()) return setError("Tên cột tổng hợp không được để trống.");
    if (!columnDraft.columnIds.length) return setError("Hãy chọn ít nhất một cột kết quả.");
    const existingCodes = state.summaryColumns
      .filter((item) => item.id !== columnDraft.id)
      .map((item) => item.code);
    const saved = {
      ...columnDraft,
      id: columnDraft.id || createClientId("summary-column"),
      code: columnDraft.id
        ? columnDraft.code
        : createTechnicalCode(columnDraft.label, existingCodes, columnDraft.code),
      label: columnDraft.label.trim(),
      months: [...new Set(columnDraft.months)].sort((a, b) => a - b),
    };
    updateState((current) => ({
      ...current,
      summaryColumns: current.summaryColumns.some((item) => item.id === saved.id)
        ? current.summaryColumns.map((item) =>
            item.id === saved.id
              ? saved
              : saved.role === "annual"
                ? { ...item, role: undefined }
                : item,
          )
        : [
            ...current.summaryColumns.map((item) =>
              saved.role === "annual" ? { ...item, role: undefined } : item,
            ),
            saved,
          ],
      summaryFormulas: current.summaryFormulas.filter(
        (formula) =>
          formula.targetKind !== "column" ||
          formula.summaryId !== saved.id ||
          saved.columnIds.includes(
            current.monthlyColumns.find((column) => column.id === formula.columnId)?.id ?? "",
          ),
      ),
    }));
    setSummarySelection({ targetKind: "column", summaryId: saved.id });
    setFormulaTarget(null);
    setColumnDraft(null);
    setError(null);
  };

  const removeColumn = (column: SummaryColumnDefinition) => {
    updateState((current) => ({
      ...current,
      summaryColumns: current.summaryColumns.filter((item) => item.id !== column.id),
      summaryRows: current.summaryRows.map((row) => ({
        ...row,
        summaryColumnIds: row.summaryColumnIds.filter((id) => id !== column.id),
      })),
      summaryFormulas: current.summaryFormulas.filter(
        (formula) => !(formula.targetKind === "column" && formula.summaryId === column.id),
      ),
    }));
    if (formulaTarget?.summaryId === column.id) setFormulaTarget(null);
  };

  const openNewRow = () => {
    setError(null);
    setRowDraft({
      id: "",
      code: "",
      label: "",
      showInMonthlyColumns: true,
      summaryColumnIds: state.summaryColumns
        .filter((column) => column.enabled)
        .map((column) => column.id),
      sortOrder: Math.max(0, ...state.summaryRows.map((item) => item.sortOrder)) + 10,
      enabled: true,
    });
  };

  const saveRow = () => {
    if (!rowDraft) return;
    if (!rowDraft.label.trim()) return setError("Tên dòng tổng hợp không được để trống.");
    if (!rowDraft.showInMonthlyColumns && !rowDraft.summaryColumnIds.length)
      return setError("Hãy chọn ít nhất cột tháng hoặc một cột tổng hợp để áp dụng.");
    const existingCodes = state.summaryRows
      .filter((item) => item.id !== rowDraft.id)
      .map((item) => item.code);
    const saved = {
      ...rowDraft,
      id: rowDraft.id || createClientId("summary-row"),
      code: rowDraft.id
        ? rowDraft.code
        : createTechnicalCode(rowDraft.label, existingCodes, rowDraft.code),
      label: rowDraft.label.trim(),
    };
    updateState((current) => ({
      ...current,
      summaryRows: current.summaryRows.some((item) => item.id === saved.id)
        ? current.summaryRows.map((item) => (item.id === saved.id ? saved : item))
        : [...current.summaryRows, saved],
    }));
    setSummarySelection({ targetKind: "row", summaryId: saved.id });
    setFormulaTarget(null);
    setRowDraft(null);
    setError(null);
  };

  const removeRow = (row: SummaryRowDefinition) => {
    updateState((current) => ({
      ...current,
      summaryRows: current.summaryRows.filter((item) => item.id !== row.id),
      summaryFormulas: current.summaryFormulas.filter(
        (formula) => !(formula.targetKind === "row" && formula.summaryId === row.id),
      ),
    }));
    if (formulaTarget?.summaryId === row.id) setFormulaTarget(null);
  };

  const selectedColumn =
    summarySelection.targetKind === "column"
      ? summaryColumns.find((item) => item.id === summarySelection.summaryId)
      : undefined;
  const selectedRow =
    summarySelection.targetKind === "row"
      ? summaryRows.find((item) => item.id === summarySelection.summaryId)
      : undefined;
  const activeSelection: SummarySelection | null = selectedColumn
    ? { targetKind: "column", summaryId: selectedColumn.id }
    : selectedRow
      ? { targetKind: "row", summaryId: selectedRow.id }
      : summaryColumns[0]
        ? { targetKind: "column", summaryId: summaryColumns[0].id }
        : summaryRows[0]
          ? { targetKind: "row", summaryId: summaryRows[0].id }
          : null;
  const activeColumn =
    activeSelection?.targetKind === "column"
      ? summaryColumns.find((item) => item.id === activeSelection.summaryId)
      : undefined;
  const activeRow =
    activeSelection?.targetKind === "row"
      ? summaryRows.find((item) => item.id === activeSelection.summaryId)
      : undefined;
  const activeColumnIds = activeColumn
    ? state.monthlyColumns
        .filter((column) => activeColumn.columnIds.includes(column.id))
        .map((column) => column.id)
    : activeRow
      ? state.monthlyColumns.map((column) => column.id)
      : [];
  const matrixFields = state.monthlySummaryMetrics
    .filter((metric) => metric.enabled && isNumericSemanticType(metric.semanticType))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(summaryMetricAsField);
  const selectSummary = (selection: SummarySelection) => {
    setSummarySelection(selection);
    setFormulaTarget(null);
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Chọn một cột hoặc dòng tổng hợp, sau đó bấm vào ô cần cấu hình. Mỗi trường và cột kết quả có
        một công thức riêng.
      </Alert>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            md: "260px minmax(0, 1fr)",
          },
          alignItems: "start",
          gap: 2,
        }}
      >
        <SummaryNavigator
          state={state}
          columns={summaryColumns}
          rows={summaryRows}
          selection={activeSelection}
          onSelect={selectSummary}
          onAddColumn={openNewColumn}
          onAddRow={openNewRow}
          onEditColumn={(column) => setColumnDraft(structuredClone(column))}
          onEditRow={(row) => setRowDraft(structuredClone(row))}
          onRemoveColumn={removeColumn}
          onRemoveRow={removeRow}
        />

        <SummaryFormulaMatrix
          state={state}
          selection={activeSelection}
          column={activeColumn}
          row={activeRow}
          fields={matrixFields}
          columnIds={activeColumnIds}
          selectedTarget={formulaTarget}
          onSelectTarget={setFormulaTarget}
        />

        {formulaTarget && (
          <SummaryFormulaEditor
            state={state}
            target={formulaTarget}
            updateState={updateState}
            onClose={() => setFormulaTarget(null)}
          />
        )}
      </Box>

      <ColumnDialog
        state={state}
        draft={columnDraft}
        error={error}
        onChange={setColumnDraft}
        onClose={() => setColumnDraft(null)}
        onSave={saveColumn}
      />
      <RowDialog
        state={state}
        draft={rowDraft}
        error={error}
        onChange={setRowDraft}
        onClose={() => setRowDraft(null)}
        onSave={saveRow}
      />
    </Stack>
  );
}

function SummaryNavigator({
  state,
  columns,
  rows,
  selection,
  onSelect,
  onAddColumn,
  onAddRow,
  onEditColumn,
  onEditRow,
  onRemoveColumn,
  onRemoveRow,
}: {
  state: KkvState;
  columns: SummaryColumnDefinition[];
  rows: SummaryRowDefinition[];
  selection: SummarySelection | null;
  onSelect: (selection: SummarySelection) => void;
  onAddColumn: () => void;
  onAddRow: () => void;
  onEditColumn: (column: SummaryColumnDefinition) => void;
  onEditRow: (row: SummaryRowDefinition) => void;
  onRemoveColumn: (column: SummaryColumnDefinition) => void;
  onRemoveRow: (row: SummaryRowDefinition) => void;
}) {
  const [activeKind, setActiveKind] = useState<"column" | "row">(selection?.targetKind ?? "column");
  useEffect(() => {
    if (selection?.targetKind) setActiveKind(selection.targetKind);
  }, [selection?.targetKind]);
  const countFormulas = (targetKind: "column" | "row", summaryId: string) =>
    state.summaryFormulas.filter(
      (formula) => formula.targetKind === targetKind && formula.summaryId === summaryId,
    ).length;

  const summaryItem = (
    targetKind: "column" | "row",
    item: SummaryColumnDefinition | SummaryRowDefinition,
    onEdit: () => void,
    onRemove: () => void,
  ) => {
    const selected = selection?.targetKind === targetKind && selection.summaryId === item.id;
    return (
      <Box
        key={item.id}
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto auto",
          alignItems: "center",
          gap: 0.25,
          p: 0.5,
          border: 1,
          borderColor: selected ? "primary.main" : "divider",
          bgcolor: selected ? "action.selected" : "transparent",
          borderRadius: 1,
        }}
      >
        <Button
          color="inherit"
          onClick={() => onSelect({ targetKind, summaryId: item.id })}
          sx={{ justifyContent: "flex-start", minWidth: 0, textAlign: "left", px: 0.75 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
              <Typography
                variant="body2"
                noWrap
                sx={{ fontWeight: selected ? 700 : 600, minWidth: 0 }}
              >
                {item.label}
              </Typography>
              {targetKind === "column" && "role" in item && item.role === "annual" && (
                <Chip size="small" label="Kết quả năm" sx={{ height: 20, flexShrink: 0 }} />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {countFormulas(targetKind, item.id)} ô đã cấu hình
            </Typography>
          </Box>
        </Button>
        <IconButton size="small" aria-label={`Sửa ${item.label}`} onClick={onEdit}>
          <EditOutlined fontSize="small" />
        </IconButton>
        <IconButton size="small" color="error" aria-label={`Xóa ${item.label}`} onClick={onRemove}>
          <DeleteOutlineRounded fontSize="small" />
        </IconButton>
      </Box>
    );
  };

  return (
    <Card variant="outlined" sx={{ position: { md: "sticky" }, top: { md: 16 } }}>
      <CardContent sx={{ p: 1.5 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Tabs
              value={activeKind}
              onChange={(_, value: "column" | "row") => {
                setActiveKind(value);
                const first = value === "column" ? columns[0] : rows[0];
                if (first) onSelect({ targetKind: value, summaryId: first.id });
              }}
              variant="fullWidth"
              sx={{ flex: 1, minWidth: 0 }}
            >
              <Tab value="column" label={`Cột (${columns.length})`} />
              <Tab value="row" label={`Dòng (${rows.length})`} />
            </Tabs>
            <IconButton
              size="small"
              aria-label={activeKind === "column" ? "Thêm cột tổng hợp" : "Thêm dòng tổng hợp"}
              onClick={activeKind === "column" ? onAddColumn : onAddRow}
              sx={{ ml: 0.5 }}
            >
              <AddRounded fontSize="small" />
            </IconButton>
          </Stack>

          <Stack spacing={0.75}>
            {activeKind === "column"
              ? columns.map((column) =>
                  summaryItem(
                    "column",
                    column,
                    () => onEditColumn(column),
                    () => onRemoveColumn(column),
                  ),
                )
              : rows.map((row) =>
                  summaryItem(
                    "row",
                    row,
                    () => onEditRow(row),
                    () => onRemoveRow(row),
                  ),
                )}
            {activeKind === "column" && !columns.length && (
              <Typography variant="caption" color="text.secondary">
                Chưa có cột tổng hợp.
              </Typography>
            )}
            {activeKind === "row" && !rows.length && (
              <Typography variant="caption" color="text.secondary">
                Chưa có dòng tổng hợp.
              </Typography>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SummaryFormulaMatrix({
  state,
  selection,
  column,
  row,
  fields,
  columnIds,
  selectedTarget,
  onSelectTarget,
}: {
  state: KkvState;
  selection: SummarySelection | null;
  column?: SummaryColumnDefinition;
  row?: SummaryRowDefinition;
  fields: KkvState["fieldDefinitions"];
  columnIds: string[];
  selectedTarget: FormulaTarget | null;
  onSelectTarget: (target: FormulaTarget) => void;
}) {
  if (!selection) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Alert severity="info">Hãy thêm một cột hoặc dòng tổng hợp để bắt đầu.</Alert>
        </CardContent>
      </Card>
    );
  }

  const label = column?.label ?? row?.label ?? "Vùng tổng hợp";
  const description = column
    ? `Phạm vi mặc định: ${formatMonthRange(
        column.months,
        state.periods.map((period) => period.month),
      )}`
    : `Dùng cùng công thức cho ${[
        row?.showInMonthlyColumns ? "các cột tháng" : "",
        ...(row?.summaryColumnIds.map(
          (id) => state.summaryColumns.find((item) => item.id === id)?.label ?? id,
        ) ?? []),
      ]
        .filter(Boolean)
        .join(" và ")}.`;

  return (
    <Card variant="outlined" sx={{ minWidth: 0 }}>
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ p: 2, pb: 1.5 }}>
          <Typography variant="h6">{label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Bấm trực tiếp vào một ô để xem hoặc chỉnh công thức của đúng ô đó.
          </Typography>
        </Box>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 180 }}>Trường dữ liệu</TableCell>
                {columnIds.map((columnId) => (
                  <TableCell key={columnId} sx={{ minWidth: 180 }}>
                    {state.monthlyColumns.find((item) => item.id === columnId)?.label ?? columnId}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {field.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {
                        state.projects.filter((project) =>
                          monthlyFieldForSummaryMetric(state, project.id, field.id),
                        ).length
                      }{" "}
                      dự án đã ánh xạ
                    </Typography>
                    {field.suffix && (
                      <Typography variant="caption" color="text.secondary">
                        {field.suffix}
                      </Typography>
                    )}
                  </TableCell>
                  {columnIds.map((columnId) => {
                    const target: FormulaTarget = {
                      ...selection,
                      metricId: field.id,
                      columnId,
                    };
                    const configured = state.summaryFormulas.find(
                      (formula) =>
                        formula.targetKind === target.targetKind &&
                        formula.summaryId === target.summaryId &&
                        formula.metricId === target.metricId &&
                        formula.columnId === target.columnId,
                    );
                    const selected =
                      selectedTarget?.targetKind === target.targetKind &&
                      selectedTarget.summaryId === target.summaryId &&
                      selectedTarget.metricId === target.metricId &&
                      selectedTarget.columnId === target.columnId;
                    return (
                      <TableCell key={columnId} sx={{ p: 0.75 }}>
                        <Button
                          fullWidth
                          color={configured ? "primary" : "inherit"}
                          variant={selected ? "contained" : configured ? "outlined" : "text"}
                          onClick={() => onSelectTarget(target)}
                          sx={{
                            minHeight: 52,
                            justifyContent: "flex-start",
                            textAlign: "left",
                            textTransform: "none",
                          }}
                        >
                          <Box sx={{ minWidth: 0, width: "100%" }}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              {configured ? "Đã cấu hình" : "Chưa cấu hình"}
                            </Typography>
                            {configured && (
                              <Typography
                                variant="caption"
                                noWrap
                                sx={{ display: "block", opacity: 0.8 }}
                              >
                                {summaryBusinessExpression(
                                  configured.formula.ast,
                                  state,
                                  selection.targetKind,
                                )}
                              </Typography>
                            )}
                          </Box>
                        </Button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

function ColumnDialog({
  state,
  draft,
  error,
  onChange,
  onClose,
  onSave,
}: {
  state: KkvState;
  draft: SummaryColumnDefinition | null;
  error: string | null;
  onChange: (value: SummaryColumnDefinition) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={Boolean(draft)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{draft?.id ? "Sửa cột tổng hợp" : "Thêm cột tổng hợp"}</DialogTitle>
      {draft && (
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="warning">{error}</Alert>}
            <TextField
              autoFocus
              label="Tên cột"
              value={draft.label}
              onChange={(event) => onChange({ ...draft, label: event.target.value })}
            />
            <MultiColumnSelect
              state={state}
              label="Cột kết quả bên trong"
              value={draft.columnIds}
              onChange={(columnIds) => onChange({ ...draft, columnIds })}
            />
            <FormControl fullWidth>
              <InputLabel>Phạm vi tháng mặc định khi chèn field</InputLabel>
              <Select
                multiple
                label="Phạm vi tháng mặc định khi chèn field"
                value={draft.months}
                onChange={(event) => onChange({ ...draft, months: event.target.value as number[] })}
                renderValue={(items) =>
                  formatMonthRange(
                    items,
                    state.periods.map((period) => period.month),
                  )
                }
              >
                {state.periods.map((period) => (
                  <MenuItem key={period.month} value={period.month}>
                    <Checkbox checked={draft.months.includes(period.month)} />
                    <ListItemText primary={period.label} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              Đây chỉ là giá trị gợi ý khi tạo công thức mới. Công thức của từng field vẫn có thể
              chọn khoảng tháng khác.
            </Typography>
            <TextField
              type="number"
              label="Thứ tự"
              value={draft.sortOrder}
              onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft.role === "annual"}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      role: event.target.checked ? "annual" : undefined,
                    })
                  }
                />
              }
              label="Dùng làm cột kết quả năm trên trang dự án"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft.enabled}
                  onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
                />
              }
              label="Hiển thị trên bảng tổng hợp"
            />
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={onSave}>
          Lưu cột
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RowDialog({
  state,
  draft,
  error,
  onChange,
  onClose,
  onSave,
}: {
  state: KkvState;
  draft: SummaryRowDefinition | null;
  error: string | null;
  onChange: (value: SummaryRowDefinition) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={Boolean(draft)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{draft?.id ? "Sửa dòng tổng hợp" : "Thêm dòng tổng hợp"}</DialogTitle>
      {draft && (
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="warning">{error}</Alert>}
            <TextField
              autoFocus
              label="Tên dòng"
              value={draft.label}
              onChange={(event) => onChange({ ...draft, label: event.target.value })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft.showInMonthlyColumns}
                  onChange={(event) =>
                    onChange({ ...draft, showInMonthlyColumns: event.target.checked })
                  }
                />
              }
              label="Hiển thị dưới các cột tháng"
            />
            <FormControl fullWidth>
              <InputLabel>Áp dụng cho cột tổng hợp</InputLabel>
              <Select
                multiple
                label="Áp dụng cho cột tổng hợp"
                value={draft.summaryColumnIds}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    summaryColumnIds: event.target.value as string[],
                  })
                }
                renderValue={(items) =>
                  items
                    .map(
                      (id) => state.summaryColumns.find((column) => column.id === id)?.label ?? id,
                    )
                    .join(", ")
                }
              >
                {state.summaryColumns.map((column) => (
                  <MenuItem key={column.id} value={column.id}>
                    <Checkbox checked={draft.summaryColumnIds.includes(column.id)} />
                    <ListItemText primary={column.label} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              Công thức của dòng sẽ dùng lại cho các cột đã chọn. Ở ô giao, hệ thống tổng hợp kết
              quả cột của từng dự án thay vì tính lại trực tiếp từ dữ liệu tháng.
            </Typography>
            <TextField
              type="number"
              label="Thứ tự"
              value={draft.sortOrder}
              onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft.enabled}
                  onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
                />
              }
              label="Hiển thị trên bảng tổng hợp"
            />
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={onSave}>
          Lưu dòng
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MultiColumnSelect({
  state,
  label,
  value,
  onChange,
}: {
  state: KkvState;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <FormControl fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select
        multiple
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as string[])}
        renderValue={(items) =>
          items
            .map((id) => state.monthlyColumns.find((column) => column.id === id)?.label ?? id)
            .join(", ")
        }
      >
        {state.monthlyColumns.map((column) => (
          <MenuItem key={column.id} value={column.id}>
            <Checkbox checked={value.includes(column.id)} />
            <ListItemText primary={column.label} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function SummaryFormulaEditor({
  state,
  target,
  updateState,
  onClose,
}: {
  state: KkvState;
  target: FormulaTarget;
  updateState: UpdateState;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const editorRef = useRef<FormulaEditorHandle>(null);
  const [tokens, setTokens] = useState<DisplayToken[]>([]);
  const [revision, setRevision] = useState(0);
  const [expression, setExpression] = useState({ internal: "", business: "" });
  const [referenceColumn, setReferenceColumn] = useState(defaultMonthlyColumnId(state));
  const [periodKind, setPeriodKind] = useState<"current" | "range" | "selected" | "ytd">("range");
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [referenceProjectScope, setReferenceProjectScope] = useState<"all" | "filtered">(
    "filtered",
  );
  const [fieldSearch, setFieldSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const formulaFields = state.monthlySummaryMetrics
    .filter((metric) => metric.enabled && isNumericSemanticType(metric.semanticType))
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map(summaryMetricAsField);
  const normalizedFieldSearch = fieldSearch.trim().toLocaleLowerCase("vi");
  const referenceFields = formulaFields.filter((field) =>
    normalizedFieldSearch
      ? `${field.label} ${field.id} ${field.suffix ?? ""}`
          .toLocaleLowerCase("vi")
          .includes(normalizedFieldSearch)
      : true,
  );
  const referenceFieldGroups = ["project", "calendar", "monthly"]
    .map((scope) => ({
      scope,
      fields: referenceFields.filter((field) => field.scope === scope),
    }))
    .filter((group) => group.fields.length);
  const targetField = formulaFields.find((field) => field.id === target.metricId);
  const summaryColumn = state.summaryColumns.find((item) => item.id === target.summaryId);
  const summaryRow = state.summaryRows.find((item) => item.id === target.summaryId);
  const targetColumn = state.monthlyColumns.find((item) => item.id === target.columnId);
  const existing = state.summaryFormulas.find(
    (formula) =>
      formula.targetKind === target.targetKind &&
      formula.summaryId === target.summaryId &&
      formula.metricId === target.metricId &&
      formula.columnId === target.columnId,
  );
  const availableSummaryRows = state.summaryRows.filter(
    (row) =>
      row.enabled &&
      state.summaryFormulas.some(
        (formula) =>
          formula.targetKind === "row" &&
          formula.summaryId === row.id &&
          formula.metricId === target.metricId &&
          formula.columnId === referenceColumn,
      ),
  );
  const availableSummaryColumns = state.summaryColumns.filter(
    (column) =>
      column.enabled &&
      state.summaryFormulas.some(
        (formula) =>
          formula.targetKind === "column" &&
          formula.summaryId === column.id &&
          formula.metricId === target.metricId &&
          formula.columnId === referenceColumn,
      ),
  );

  const loadTargetEditor = (next: FormulaTarget) => {
    const found = state.summaryFormulas.find(
      (formula) =>
        formula.targetKind === next.targetKind &&
        formula.summaryId === next.summaryId &&
        formula.metricId === next.metricId &&
        formula.columnId === next.columnId,
    );
    setTokens(
      found
        ? formulaToTokens(found.formula, state).map((token) => ({
            ...token,
            label:
              next.targetKind === "row"
                ? token.label
                    .replaceAll("Từ đầu năm đến tháng này", "Từ đầu năm đến cột hiện tại")
                    .replaceAll("Tháng hiện tại", "Cột hiện tại")
                : token.label,
          }))
        : [],
    );
    setRevision((value) => value + 1);
    setExpression({ internal: "", business: "" });
    setReferenceColumn(next.columnId);
    setReferenceProjectScope((found && aggregateProjectScope(found.formula.ast)) || "filtered");
    const column = state.summaryColumns.find((item) => item.id === next.summaryId);
    if (next.targetKind === "column" && column?.months.length) {
      setPeriodKind("selected");
      setSelectedMonths(column.months);
    } else {
      setPeriodKind(
        firstReferencePeriodKind(found?.formula.ast ?? { kind: "literal", value: 0 }) === "ytd"
          ? "ytd"
          : "current",
      );
    }
    setMessage(null);
  };

  const dialogKey = `${target.targetKind}|${target.summaryId}|${target.metricId}|${target.columnId}`;
  useEffect(() => {
    loadTargetEditor(target);
  }, [dialogKey]);

  const period = (): PeriodSelector => {
    if (periodKind === "range")
      return {
        kind: "range",
        from: Math.min(fromMonth, toMonth),
        to: Math.max(fromMonth, toMonth),
      };
    if (periodKind === "selected") return { kind: "selected", months: selectedMonths };
    return { kind: periodKind };
  };

  const addReference = (fieldId: string) => {
    const field = formulaFields.find((item) => item.id === fieldId);
    if (!field) return;
    const referencePeriod = field.scope === "project" ? undefined : period();
    const projectScope = target.targetKind === "row" ? referenceProjectScope : undefined;
    editorRef.current?.insertReference({
      fieldId,
      rawReference: `metric:${fieldId}|${referenceColumn}|${periodToSyntax(referencePeriod)}${
        projectScope ? `|${projectScope}` : ""
      }`,
      columnId: field.scope === "project" && !projectScope ? undefined : referenceColumn,
      period: referencePeriod ? periodToSyntax(referencePeriod) : undefined,
      projectScope,
      label:
        field.scope === "project" && !projectScope
          ? `[${field.label}]`
          : `[${field.label} · ${
              state.monthlyColumns.find((column) => column.id === referenceColumn)?.label ??
              referenceColumn
            }${
              referencePeriod
                ? ` · ${
                    target.targetKind === "row"
                      ? referencePeriod.kind === "ytd"
                        ? "Từ đầu năm đến cột hiện tại"
                        : "Cột hiện tại"
                      : periodLabel(referencePeriod)
                  }`
                : ""
            }${
              projectScope === "filtered"
                ? " · Các dự án theo bộ lọc"
                : projectScope === "all"
                  ? " · Tất cả dự án"
                  : ""
            }]`,
    });
  };

  const addSummaryReference = (summaryKind: "row" | "column", summaryId: string) => {
    const summary =
      summaryKind === "row"
        ? state.summaryRows.find((item) => item.id === summaryId)
        : state.summaryColumns.find((item) => item.id === summaryId);
    if (!summary || !targetField) return;
    const projectScope =
      summaryKind === "column" && target.targetKind === "row" ? referenceProjectScope : undefined;
    const columnLabel =
      state.monthlyColumns.find((column) => column.id === referenceColumn)?.label ??
      referenceColumn;
    editorRef.current?.insertReference({
      fieldId: target.metricId,
      rawReference: `summary:${summaryKind}|${summaryId}|${target.metricId}|${referenceColumn}${
        projectScope ? `|${projectScope}` : ""
      }`,
      label: `[${summary.label} · ${targetField.label} · ${columnLabel} · ${
        summaryKind === "row" ? "Cột hiện tại" : "Kết quả cột"
      }${
        projectScope === "filtered"
          ? " · Các dự án theo bộ lọc"
          : projectScope === "all"
            ? " · Tất cả dự án"
            : ""
      }]`,
    });
  };

  const save = () => {
    if (!targetField) return;
    try {
      const analysis = analyzeParentheses(expression.internal);
      if (analysis.unexpectedClosingIndexes.length) throw new Error("Ngoặc đóng không hợp lệ.");
      const completed = completeMissingClosingParentheses(expression.internal);
      const ast = parseFormula(completed.source);
      if (createsSummaryCycle(state, target, ast))
        throw new Error("Công thức tạo vòng lặp giữa các kết quả tổng hợp.");
      const resultType = typeCheck(ast, formulaFields);
      if (String(resultType).startsWith("Series<"))
        throw new Error("Công thức tổng hợp phải trả về một giá trị, hãy dùng SUM, AVG, LAST…");
      const saved: SummaryFormulaDefinition = {
        id: existing?.id ?? createClientId("summary-formula"),
        ...target,
        formula: {
          id: existing?.formula.id ?? createClientId("formula"),
          ast,
          internalExpression: completed.source,
          businessExpression: `${expression.business}${")".repeat(completed.addedCount)}`,
          preserveUserParentheses: true,
        },
      };
      updateState((current) => ({
        ...current,
        summaryFormulas: current.summaryFormulas.some((item) => item.id === saved.id)
          ? current.summaryFormulas.map((item) => (item.id === saved.id ? saved : item))
          : [...current.summaryFormulas, saved],
      }));
      setMessage(null);
      showToast("Đã lưu công thức tổng hợp.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Công thức không hợp lệ.");
    }
  };

  const previewAst = useMemo(() => {
    if (!expression.internal.trim()) return existing?.formula.ast;
    try {
      const ast = parseFormula(completeMissingClosingParentheses(expression.internal).source);
      return String(typeCheck(ast, formulaFields)).startsWith("Series<") ? undefined : ast;
    } catch {
      return undefined;
    }
  }, [existing?.formula.ast, expression.internal, state.monthlySummaryMetrics]);

  const parenthesisAnalysis = analyzeParentheses(expression.internal);
  const summaryLabel = summaryColumn?.label ?? summaryRow?.label ?? "Vùng tổng hợp";
  const targetColumnLabel = targetColumn?.label ?? target.columnId;
  const referenceColumnLabel =
    state.monthlyColumns.find((column) => column.id === referenceColumn)?.label ?? referenceColumn;
  const periodSummary =
    target.targetKind === "row"
      ? periodKind === "ytd"
        ? "Từ đầu năm đến cột hiện tại"
        : "Cột hiện tại"
      : periodKind === "current"
        ? "Tháng hiện tại"
        : periodKind === "ytd"
          ? "Từ đầu năm đến tháng hiện tại"
          : formatMonthSelectionSummary(
              periodKind === "range"
                ? Array.from(
                    { length: Math.abs(toMonth - fromMonth) + 1 },
                    (_, index) => Math.min(fromMonth, toMonth) + index,
                  )
                : selectedMonths,
              state.periods.map((item) => item.month),
            );

  const removeFormula = () => {
    if (!existing) return;
    updateState((current) => ({
      ...current,
      summaryFormulas: current.summaryFormulas.filter((item) => item.id !== existing.id),
    }));
    setDeleteConfirmOpen(false);
    showToast("Đã xóa công thức tổng hợp.");
    onClose();
  };

  return (
    <>
      <FormulaEditorSurface
        open
        title={existing ? "Sửa công thức tổng hợp" : "Tạo công thức tổng hợp"}
        context={`${summaryLabel} / ${targetField?.label ?? target.metricId} / ${targetColumnLabel}`}
        actions={
          <Button size="small" variant="outlined" onClick={() => setAdvancedOpen(true)}>
            Tùy chọn nâng cao
          </Button>
        }
        onClose={onClose}
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
            gridTemplateRows: { lg: message ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)" },
            gap: 2,
            height: { lg: "100%" },
            minHeight: 0,
            alignItems: "start",
          }}
        >
          {message && (
            <Alert severity="warning" onClose={() => setMessage(null)} sx={{ gridArea: "message" }}>
              {message}
            </Alert>
          )}

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
                    1 · Công thức tổng hợp
                  </Typography>
                  <Typography variant="h6">Soạn biểu thức</Typography>
                </Box>
                {existing && (
                  <Button color="error" onClick={() => setDeleteConfirmOpen(true)}>
                    Xóa công thức
                  </Button>
                )}
              </Stack>

              <FormulaExpressionEditor
                ref={editorRef}
                tokens={tokens}
                revision={revision}
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
                    Thiếu {parenthesisAnalysis.missingClosingCount} dấu ) ở cuối công thức. Khi lưu,
                    hệ thống sẽ tự bổ sung.
                  </Alert>
                )}
              {parenthesisAnalysis.unexpectedClosingIndexes.length > 0 && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  Dấu ) tại vị trí {parenthesisAnalysis.unexpectedClosingIndexes[0] + 1} không có
                  dấu ( tương ứng.
                </Alert>
              )}

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.75 }}
              >
                Ctrl+Z để hoàn tác. Bấm vào một trường tham chiếu rồi nhấn Backspace hoặc Delete để
                xóa.
              </Typography>

              {previewAst && targetField && (
                <SummaryFormulaPreview
                  key={dialogKey}
                  state={state}
                  target={target}
                  targetField={targetField}
                  ast={previewAst}
                />
              )}

              <Paper variant="outlined" sx={{ mt: 1.5, p: 1.25 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  sx={{ justifyContent: "flex-end", alignItems: { sm: "center" }, gap: 1 }}
                >
                  <Button variant="contained" startIcon={<SaveRounded />} onClick={save}>
                    Lưu công thức
                  </Button>
                </Stack>
              </Paper>
            </CardContent>
          </Card>

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
            <CardContent>
              <Typography variant="overline" color="primary">
                2 · Chọn dữ liệu
              </Typography>
              <Stack
                direction="row"
                sx={{ mt: 0.75, gap: 0.75, alignItems: "center", flexWrap: "wrap" }}
              >
                <Chip size="small" variant="outlined" label={`Cột: ${referenceColumnLabel}`} />
                <Chip size="small" variant="outlined" label={`Thời điểm: ${periodSummary}`} />
                {target.targetKind === "row" && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={
                      referenceProjectScope === "filtered" ? "Dự án theo bộ lọc" : "Tất cả dự án"
                    }
                  />
                )}
                <Button size="small" onClick={() => setAdvancedOpen(true)}>
                  Thay đổi
                </Button>
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

              <Box sx={{ mt: 1.5 }}>
                <Stack spacing={1.5}>
                  {referenceFieldGroups.map((group) => (
                    <Box key={group.scope}>
                      <Typography variant="subtitle2">
                        {fieldScopeLabel(group.fields[0].scope)}
                      </Typography>
                      <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 0.75 }}>
                        {group.fields.map((field) => (
                          <Tooltip
                            key={field.id}
                            arrow
                            title={`${field.label}${field.suffix ? ` · ${field.suffix}` : ""}`}
                          >
                            <Chip
                              clickable
                              variant="outlined"
                              label={`${field.label}${field.suffix ? ` · ${field.suffix}` : ""}`}
                              onClick={() => addReference(field.id)}
                            />
                          </Tooltip>
                        ))}
                      </Stack>
                    </Box>
                  ))}
                  {!referenceFieldGroups.length && (
                    <Alert severity="info">Không tìm thấy trường phù hợp.</Alert>
                  )}
                </Stack>
              </Box>

              {(availableSummaryRows.length > 0 || availableSummaryColumns.length > 0) && (
                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
                  <Typography variant="subtitle2">Kết quả tổng hợp</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Chèn kết quả đã tính của một dòng hoặc cột tổng hợp khác.
                  </Typography>
                  {availableSummaryRows.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Dòng tổng hợp
                      </Typography>
                      <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
                        {availableSummaryRows.map((row) => (
                          <Chip
                            key={row.id}
                            clickable
                            variant="outlined"
                            disabled={
                              target.targetKind === "row" &&
                              target.summaryId === row.id &&
                              target.columnId === referenceColumn
                            }
                            label={row.label}
                            onClick={() => addSummaryReference("row", row.id)}
                          />
                        ))}
                      </Stack>
                    </Box>
                  )}
                  {availableSummaryColumns.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Cột tổng hợp
                      </Typography>
                      <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
                        {availableSummaryColumns.map((column) => (
                          <Chip
                            key={column.id}
                            clickable
                            variant="outlined"
                            disabled={
                              target.targetKind === "column" &&
                              target.summaryId === column.id &&
                              target.columnId === referenceColumn
                            }
                            label={column.label}
                            onClick={() => addSummaryReference("column", column.id)}
                          />
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}
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
                Gõ trực tiếp số, dấu <strong>+ − * / ^ ( )</strong> hoặc tên hàm. Có thể bắt đầu
                bằng dấu = như Excel.
              </Typography>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 1.5 }}>
                {functionCatalog.map((item) => (
                  <Chip
                    key={item.code}
                    clickable
                    label={item.label}
                    title={item.description}
                    onClick={() => editorRef.current?.insertFunction(item.code)}
                  />
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </FormulaEditorSurface>

      <Dialog open={advancedOpen} onClose={() => setAdvancedOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Tùy chọn nâng cao</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              select
              fullWidth
              label="Cột cho trường chèn tiếp theo"
              value={referenceColumn}
              onChange={(event) => setReferenceColumn(event.target.value)}
              helperText={`Mặc định theo cột nhận kết quả: ${targetColumnLabel}. Chỉ đổi khi cần tham chiếu chéo.`}
            >
              {state.monthlyColumns.map((column) => (
                <MenuItem key={column.id} value={column.id}>
                  {column.label}
                </MenuItem>
              ))}
            </TextField>

            {target.targetKind === "row" ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 1.5,
                }}
              >
                <TextField
                  select
                  label="Phạm vi cột khi chèn trường"
                  value={periodKind === "ytd" ? "ytd" : "current"}
                  onChange={(event) => setPeriodKind(event.target.value as "current" | "ytd")}
                  helperText="Lũy kế lấy dữ liệu từ T1 đến cột tháng đang được tính."
                >
                  <MenuItem value="current">Chỉ cột hiện tại</MenuItem>
                  <MenuItem value="ytd">Từ đầu năm đến cột hiện tại</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Phạm vi dự án khi chèn trường"
                  value={referenceProjectScope}
                  onChange={(event) =>
                    setReferenceProjectScope(event.target.value as "all" | "filtered")
                  }
                  helperText="Theo bộ lọc không phụ thuộc cuộn hoặc phân trang."
                >
                  <MenuItem value="filtered">Các dự án theo bộ lọc</MenuItem>
                  <MenuItem value="all">Tất cả dự án trong năm</MenuItem>
                </TextField>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
                  gap: 1.5,
                }}
              >
                <TextField
                  select
                  label="Phạm vi tháng khi chèn trường"
                  value={periodKind}
                  onChange={(event) => setPeriodKind(event.target.value as typeof periodKind)}
                >
                  <MenuItem value="current">Tháng hiện tại</MenuItem>
                  <MenuItem value="range">Khoảng tháng</MenuItem>
                  <MenuItem value="selected">Các tháng đã chọn</MenuItem>
                  <MenuItem value="ytd">Từ đầu năm đến hiện tại</MenuItem>
                </TextField>
                {periodKind === "range" && (
                  <>
                    <TextField
                      select
                      label="Từ tháng"
                      value={fromMonth}
                      onChange={(event) => setFromMonth(Number(event.target.value))}
                    >
                      {state.periods.map((item) => (
                        <MenuItem key={item.month} value={item.month}>
                          {item.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Đến tháng"
                      value={toMonth}
                      onChange={(event) => setToMonth(Number(event.target.value))}
                    >
                      {state.periods.map((item) => (
                        <MenuItem key={item.month} value={item.month}>
                          {item.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </>
                )}
                {periodKind === "selected" && (
                  <FormControl fullWidth sx={{ gridColumn: { md: "span 2" } }}>
                    <InputLabel>Tháng được chọn</InputLabel>
                    <Select
                      multiple
                      label="Tháng được chọn"
                      value={selectedMonths}
                      onChange={(event) => setSelectedMonths(event.target.value as number[])}
                      renderValue={(items) =>
                        formatMonthRange(
                          items,
                          state.periods.map((period) => period.month),
                        )
                      }
                    >
                      {state.periods.map((item) => (
                        <MenuItem key={item.month} value={item.month}>
                          <Checkbox checked={selectedMonths.includes(item.month)} />
                          <ListItemText primary={item.label} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdvancedOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Xóa công thức tổng hợp?</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>Bạn sắp xóa công thức đã lưu tại:</Typography>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
              <Typography sx={{ fontWeight: 700 }}>
                {summaryLabel} → {targetField?.label ?? target.metricId} → {targetColumnLabel}
              </Typography>
            </Paper>
            <Typography variant="body2" color="text.secondary">
              Sau khi xóa, ô này sẽ chuyển thành “Chưa cấu hình” và không còn được tính trong vùng
              tổng hợp. Thao tác này không xóa trường dữ liệu nguồn.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDeleteConfirmOpen(false)}>
            Hủy
          </Button>
          <Button color="error" variant="contained" onClick={removeFormula}>
            Xóa công thức
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

interface TraceMatrixRow {
  key: string;
  field: KkvState["fieldDefinitions"][number];
  columnLabel: string;
  commonValue?: unknown;
  monthlyValues: Map<number, unknown>;
}

function formulaUsesDynamicMonth(ast: FormulaAst, state: KkvState): boolean {
  if (ast.kind === "summaryReference") return ast.summaryKind === "row";
  if (ast.kind === "fieldReference" || ast.kind === "metricReference") {
    if (ast.kind === "fieldReference") {
      const field = state.fieldDefinitions.find((item) => item.id === ast.fieldId);
      if (field?.scope === "project") return false;
    }
    const kind = ast.period?.kind ?? "current";
    return ["current", "previous", "next", "offset", "ytd"].includes(kind);
  }
  if (ast.kind === "binary") {
    return formulaUsesDynamicMonth(ast.left, state) || formulaUsesDynamicMonth(ast.right, state);
  }
  if (ast.kind === "function") {
    return ast.args.some((argument) => formulaUsesDynamicMonth(argument, state));
  }
  return false;
}

function createTraceMatrix(trace: TraceEntry[], state: KkvState): TraceMatrixRow[] {
  const rows = new Map<string, TraceMatrixRow>();
  trace.forEach((entry) => {
    const field = state.fieldDefinitions.find((item) => item.id === entry.fieldId);
    if (!field) return;
    const key = `${entry.fieldId}|${entry.columnId ?? "project"}`;
    const row = rows.get(key) ?? {
      key,
      field,
      columnLabel: entry.columnId
        ? (state.monthlyColumns.find((column) => column.id === entry.columnId)?.label ??
          entry.columnId)
        : "Thông tin dự án",
      monthlyValues: new Map<number, unknown>(),
    };
    if (entry.month == null) row.commonValue = entry.value;
    else row.monthlyValues.set(entry.month, entry.value);
    rows.set(key, row);
  });
  return [...rows.values()];
}

function scalarValue(result: CalculationResult | null) {
  return result?.value.kind === "scalar" ? result.value.value : null;
}

function previewStatus(result: CalculationResult) {
  if (result.state === "Error") return formulaErrorLabel(result.errorCode);
  if (result.state === "Null") return "Chưa có kết quả";
  if (result.state === "ErrorFallback") return "Đang dùng giá trị thay thế";
  return "Hợp lệ";
}

function TraceValue({ row, value }: { row: TraceMatrixRow; value: unknown }) {
  if (value == null) {
    return (
      <Typography variant="caption" color="text.secondary">
        Chưa nhập
      </Typography>
    );
  }
  return <FieldValueDisplay field={row.field} value={value} />;
}

function SummaryFormulaPreview({
  state,
  target,
  targetField,
  ast,
}: {
  state: KkvState;
  target: FormulaTarget;
  targetField: KkvState["fieldDefinitions"][number];
  ast: FormulaAst;
}) {
  const projects = useMemo(
    () => state.projects.filter((project) => project.year === state.selectedYear),
    [state.projects, state.selectedYear],
  );
  const summaryColumn = state.summaryColumns.find((item) => item.id === target.summaryId);
  const summaryRow = state.summaryRows.find((item) => item.id === target.summaryId);
  const defaultMonth =
    target.targetKind === "column" && summaryColumn?.months.length
      ? Math.max(...summaryColumn.months)
      : (state.periods.at(-1)?.month ?? 12);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [contextMonth, setContextMonth] = useState(defaultMonth);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const engine = useMemo(() => new FormulaEngine(state), [state]);
  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  const usesDynamicMonth = formulaUsesDynamicMonth(ast, state);
  const projectScope = aggregateProjectScope(ast);
  const preview = project
    ? engine.evaluate(project.id, ast, state.selectedYear, contextMonth, target.columnId)
    : null;
  const traceRows = preview ? createTraceMatrix(preview.trace, state) : [];
  const traceValues = traceRows.flatMap((row) => [
    ...(row.commonValue === undefined ? [] : [row.commonValue]),
    ...row.monthlyValues.values(),
  ]);
  const missingCount = traceValues.filter((value) => value == null).length;
  const zeroCount = traceValues.filter((value) => Number(value) === 0 && value != null).length;
  const columnLabel =
    state.monthlyColumns.find((item) => item.id === target.columnId)?.label ?? target.columnId;
  const summaryLabel =
    target.targetKind === "column"
      ? (summaryColumn?.label ?? "Cột tổng hợp")
      : (summaryRow?.label ?? "Dòng tổng hợp");
  const projectResults = showAllProjects
    ? projects.map((item) => ({
        project: item,
        result: engine.evaluate(item.id, ast, state.selectedYear, contextMonth, target.columnId),
      }))
    : [];

  const compactResult =
    preview?.state === "Error" ? (
      <Typography color="error" sx={{ fontWeight: 700 }}>
        {formulaErrorLabel(preview.errorCode)}
      </Typography>
    ) : (
      <FieldValueDisplay field={targetField} value={scalarValue(preview)} strong />
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
          <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="subtitle2">Kết quả xem thử</Typography>
            {compactResult}
            <Chip
              size="small"
              color={
                preview?.state === "Error"
                  ? "error"
                  : preview?.state === "Value"
                    ? "success"
                    : "warning"
              }
              label={preview ? previewStatus(preview) : "Chưa có dữ liệu"}
            />
          </Stack>
          <Button size="small" variant="outlined" onClick={() => setShowDetails(true)}>
            Xem chi tiết
          </Button>
        </Stack>
      </Paper>

      <Dialog open={showDetails} onClose={() => setShowDetails(false)} fullWidth maxWidth="lg">
        <DialogTitle>
          <Typography variant="h6">Chi tiết kết quả xem thử</Typography>
          <Typography variant="body2" color="text.secondary">
            {summaryLabel} → {targetField.label} → {columnLabel}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">Kiểm tra với dữ liệu thật</Typography>
              <Typography variant="body2" color="text.secondary">
                Vị trí nhận kết quả: {summaryLabel} → {targetField.label} → {columnLabel}
              </Typography>
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: usesDynamicMonth ? "2fr 1fr" : "1fr" },
                gap: 1.5,
              }}
            >
              {target.targetKind === "column" ? (
                <TextField
                  select
                  size="small"
                  label="Dự án kiểm tra"
                  value={project?.id ?? ""}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  {projects.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Alert severity="info">
                  {projectScope === "filtered"
                    ? "Ở bảng tổng hợp, công thức chỉ dùng các dự án theo bộ lọc. Trang cấu hình chưa áp dụng bộ lọc nên phần xem trước dùng toàn bộ dự án trong năm."
                    : "Công thức này tổng hợp dữ liệu của tất cả dự án trong năm."}
                </Alert>
              )}
              {usesDynamicMonth && (
                <TextField
                  select
                  size="small"
                  label="Tháng ngữ cảnh"
                  value={contextMonth}
                  onChange={(event) => setContextMonth(Number(event.target.value))}
                  helperText="Dùng cho Tháng hiện tại, Tháng trước hoặc Từ đầu năm đến tháng này."
                >
                  {state.periods.map((item) => (
                    <MenuItem key={item.month} value={item.month}>
                      {item.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>

            <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Công thức đang kiểm tra
              </Typography>
              <Typography variant="body2">
                {summaryBusinessExpression(ast, state, target.targetKind)}
              </Typography>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1, mt: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Kết quả:
                </Typography>
                {preview?.state === "Error" ? (
                  <Typography color="error">{formulaErrorLabel(preview.errorCode)}</Typography>
                ) : (
                  <FieldValueDisplay field={targetField} value={scalarValue(preview)} strong />
                )}
              </Stack>
            </Box>

            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              {preview?.state !== "Error" && (
                <Chip size="small" color="success" label="Công thức hợp lệ" />
              )}
              <Chip
                size="small"
                color={missingCount ? "warning" : "default"}
                label={`${missingCount} giá trị chưa nhập`}
              />
              <Chip size="small" label={`${zeroCount} giá trị bằng 0`} />
            </Stack>

            {target.targetKind === "column" && traceRows.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Dữ liệu thực tế tham gia phép tính
                </Typography>
                <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Table size="small" sx={{ minWidth: 1050 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ minWidth: 190 }}>Trường dữ liệu</TableCell>
                        <TableCell sx={{ minWidth: 110 }}>Cột</TableCell>
                        <TableCell align="right">Giá trị chung</TableCell>
                        {state.periods.map((item) => (
                          <TableCell key={item.month} align="right" sx={{ minWidth: 76 }}>
                            T{item.month}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {traceRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell>{row.field.label}</TableCell>
                          <TableCell>{row.columnLabel}</TableCell>
                          <TableCell align="right">
                            {row.commonValue === undefined ? (
                              "—"
                            ) : (
                              <TraceValue row={row} value={row.commonValue} />
                            )}
                          </TableCell>
                          {state.periods.map((item) => (
                            <TableCell key={item.month} align="right">
                              {row.monthlyValues.has(item.month) ? (
                                <TraceValue row={row} value={row.monthlyValues.get(item.month)} />
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {target.targetKind === "column" && (
              <Box>
                <Button size="small" onClick={() => setShowAllProjects((value) => !value)}>
                  {showAllProjects ? "Ẩn kết quả các dự án" : "Kiểm tra tất cả dự án"}
                </Button>
                {showAllProjects && (
                  <TableContainer
                    sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 1 }}
                  >
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Dự án</TableCell>
                          <TableCell align="right">Kết quả</TableCell>
                          <TableCell>Trạng thái</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {projectResults.map(({ project: item, result }) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {item.code} · {item.name}
                            </TableCell>
                            <TableCell align="right">
                              <FieldValueDisplay field={targetField} value={scalarValue(result)} />
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                color={result.state === "Error" ? "error" : "text.primary"}
                              >
                                {previewStatus(result)}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDetails(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
