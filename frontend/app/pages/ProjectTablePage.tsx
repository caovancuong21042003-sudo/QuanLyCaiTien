import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import { useKkv } from "../context/kkv-context";
import {
  buildProjectFieldColumns,
  calendarValue,
  defaultMonthlyColumnId,
  monthlyFieldsForProject,
  monthlyFieldAllowsColumn,
  effectiveMonthlySummaryMetricId,
  numericValueNotes,
  projectFieldForSummaryColumn,
  projectMonthlyFieldConfig,
  projectsForYear,
  summaryMetricAsField,
} from "../domain/metadata";
import { FormulaEngine } from "../formula/formula-engine";
import { TableWorkspace } from "../components/table-workspace/TableWorkspace";
import {
  buildFormulaHoverContent,
  useFormulaHoverCard,
} from "../components/formula-hover/useFormulaHoverCard";
import type {
  ProjectFieldDefinition,
  SummaryColumnDefinition,
  SummaryProjectColumnDefinition,
} from "../domain/types";
import { formulaErrorLabel } from "../domain/field-labels";
import { FieldValueDisplay } from "../components/dynamic-fields/FieldValueDisplay";
import { astToBusinessExpression } from "../formula/ast-utils";

interface ProjectTableModel {
  rows: number[];
  monthlyFields: ProjectFieldDefinition[];
  monthlyFieldsByRow: Map<number, ProjectFieldDefinition[]>;
  monthlyFieldsByRowAndColumn: Map<string, ProjectFieldDefinition[]>;
  projectFieldsByColumnId: Map<string, ProjectFieldDefinition>;
}

const rowColors = ["#FFFFFF", "#FAFCFC", "#F5F9F9"];
const projectCodeWidth = 120;
const projectNameWidth = 260;
const projectFieldWidth = 156;
const monthlyMetricWidth = 210;
const frozenProjectWidth = projectCodeWidth + projectNameWidth;
const primaryHeaderHeight = 46;
const filterOptions = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "vi"));

function DebouncedProjectSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [, startTransition] = useTransition();

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timeout = window.setTimeout(() => {
      startTransition(() => onChange(draft));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [draft, onChange, startTransition, value]);

  return (
    <TextField
      size="small"
      label="Tìm dự án"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Mã, tên, sản phẩm hoặc phụ trách"
    />
  );
}

export function ProjectTablePage({
  onOpenProject,
  onManageProjects,
}: {
  onOpenProject: (projectId: string) => void;
  onManageProjects: () => void;
}) {
  const { state } = useKkv();
  const { formulaHoverProps, formulaHoverCard } = useFormulaHoverCard();
  const allProjects = useMemo(() => projectsForYear(state), [state.projects, state.selectedYear]);
  const [searchText, setSearchText] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const departments = useMemo(
    () => filterOptions(allProjects.map((project) => project.department)),
    [allProjects],
  );
  const categories = useMemo(
    () => filterOptions(allProjects.map((project) => project.category)),
    [allProjects],
  );
  const owners = useMemo(
    () => filterOptions(allProjects.map((project) => project.owner)),
    [allProjects],
  );
  const projects = useMemo(() => {
    const keyword = searchText.trim().toLocaleLowerCase("vi");
    return allProjects.filter((project) => {
      const matchesKeyword =
        !keyword ||
        [project.code, project.name, project.product, project.owner]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(keyword);
      return (
        matchesKeyword &&
        (!departmentFilter || project.department === departmentFilter) &&
        (!categoryFilter || project.category === categoryFilter) &&
        (!ownerFilter || project.owner === ownerFilter)
      );
    });
  }, [allProjects, categoryFilter, departmentFilter, ownerFilter, searchText]);
  const filteredProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const engine = useMemo(
    () => new FormulaEngine(state, { filteredProjectIds }),
    [filteredProjectIds, state],
  );
  const hasActiveFilters = Boolean(searchText || departmentFilter || categoryFilter || ownerFilter);
  const summaryProjectColumns = useMemo(
    () => state.summaryProjectColumns.filter((column) => column.enabled),
    [state.summaryProjectColumns],
  );
  const projectFieldColumns = useMemo(
    () => buildProjectFieldColumns(summaryProjectColumns, state.columnGroups),
    [state.columnGroups, summaryProjectColumns],
  );
  const orderedProjectColumns = useMemo(
    () =>
      projectFieldColumns.flatMap((column) =>
        column.kind === "field" ? [column.field] : column.children,
      ),
    [projectFieldColumns],
  );
  const summaryColumnsById = useMemo(
    () =>
      new Map(
        state.summaryColumns.map((summary) => [
          summary.id,
          state.monthlyColumns.filter((column) => summary.columnIds.includes(column.id)),
        ]),
      ),
    [state.monthlyColumns, state.summaryColumns],
  );
  const columnsForSummary = (summary: SummaryColumnDefinition) =>
    summaryColumnsById.get(summary.id) ?? [];
  const summaryColumns = useMemo(
    () =>
      state.summaryColumns
        .filter((item) => item.enabled && (summaryColumnsById.get(item.id)?.length ?? 0) > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [state.summaryColumns, summaryColumnsById],
  );
  const summaryRows = useMemo(
    () =>
      state.summaryRows.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    [state.summaryRows],
  );
  const valueNotesByProjectField = useMemo(
    () =>
      new Map(
        state.fieldValues.map((item) => [
          `${item.projectId}|${item.fieldId}`,
          numericValueNotes(item.value),
        ]),
      ),
    [state.fieldValues],
  );
  const projectTableModels = useMemo(() => {
    const models = new Map<string, ProjectTableModel>();
    allProjects.forEach((project) => {
      const monthlyFields = monthlyFieldsForProject(state, project.id);
      const projectFieldsByColumnId = new Map<string, ProjectFieldDefinition>();
      orderedProjectColumns.forEach((column) => {
        const field = projectFieldForSummaryColumn(state, project.id, column.id);
        if (field) projectFieldsByColumnId.set(column.id, field);
      });

      const monthlyFieldsByRow = new Map<number, ProjectFieldDefinition[]>();
      const monthlyFieldsByRowAndColumn = new Map<string, ProjectFieldDefinition[]>();
      monthlyFields.forEach((field) => {
        const rowFields = monthlyFieldsByRow.get(field.rowIndex) ?? [];
        rowFields.push(field);
        monthlyFieldsByRow.set(field.rowIndex, rowFields);
        state.monthlyColumns.forEach((column) => {
          if (!monthlyFieldAllowsColumn(state, project.id, field.id, column.id)) return;
          const key = `${field.rowIndex}|${column.id}`;
          const columnFields = monthlyFieldsByRowAndColumn.get(key) ?? [];
          columnFields.push(field);
          monthlyFieldsByRowAndColumn.set(key, columnFields);
        });
      });

      const rows = [...new Set(monthlyFields.map((field) => field.rowIndex))].sort((a, b) => a - b);

      models.set(project.id, {
        rows: rows.length ? rows : [1],
        monthlyFields,
        monthlyFieldsByRow,
        monthlyFieldsByRowAndColumn,
        projectFieldsByColumnId,
      });
    });
    return models;
  }, [allProjects, orderedProjectColumns, state]);
  const notesFor = (projectId: string, fieldId: string) =>
    valueNotesByProjectField.get(`${projectId}|${fieldId}`);
  const projectCell = (projectId: string, summaryColumn: SummaryProjectColumnDefinition) => {
    const field = projectTableModels.get(projectId)?.projectFieldsByColumnId.get(summaryColumn.id);
    if (!field) {
      return (
        <Typography variant="caption" color="text.disabled">
          Chưa gán
        </Typography>
      );
    }
    const evaluationMonth = state.periods.at(-1)?.month ?? 12;
    const evaluationColumn = field.formula?.columnId ?? defaultMonthlyColumnId(state);
    const expression = engine.formulaExpression(
      projectId,
      field.id,
      state.selectedYear,
      evaluationMonth,
      evaluationColumn,
    );
    const result = engine.calculate(
      projectId,
      field.id,
      state.selectedYear,
      evaluationMonth,
      evaluationColumn,
    );
    const value = result.value.kind === "scalar" ? result.value.value : null;
    return (
      <Stack
        spacing={0.25}
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
          <FieldValueDisplay
            field={field}
            value={value}
            notes={notesFor(projectId, field.id)}
            compactRichText
          />
        )}
        {field.label !== summaryColumn.label ? (
          <Typography
            variant="caption"
            color="text.secondary"
            title={`Trường riêng của dự án: ${field.label}`}
            sx={{ display: "block", whiteSpace: "normal", lineHeight: 1.25 }}
          >
            {field.label}
          </Typography>
        ) : null}
      </Stack>
    );
  };
  const metricsForRow = (projectId: string, rowIndex: number, columnId?: string) => {
    const model = projectTableModels.get(projectId);
    if (!model) return [];
    return columnId
      ? (model.monthlyFieldsByRowAndColumn.get(`${rowIndex}|${columnId}`) ?? [])
      : (model.monthlyFieldsByRow.get(rowIndex) ?? []);
  };
  const rowsForProject = (projectId: string) => projectTableModels.get(projectId)?.rows ?? [1];
  const calculatedValue = (projectId: string, fieldId: string, month: number, columnId: string) =>
    engine.calculate(projectId, fieldId, state.selectedYear, month, columnId);
  const monthCell = (projectId: string, month: number, columnId: string, rowIndex: number) => (
    <Stack spacing={0.75}>
      {metricsForRow(projectId, rowIndex, columnId).map((field) => {
        const result = calculatedValue(projectId, field.id, month, columnId);
        const value = result.value.kind === "scalar" ? result.value.value : null;
        const expression = engine.formulaExpression(
          projectId,
          field.id,
          state.selectedYear,
          month,
          columnId,
        );
        return (
          <Box
            key={field.id}
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
        );
      })}
    </Stack>
  );
  const summaryCell = (
    projectId: string,
    summary: SummaryColumnDefinition,
    columnId: string,
    rowIndex: number,
  ) => (
    <Stack spacing={0.75}>
      {metricsForRow(projectId, rowIndex, columnId).map((field) => {
        const metricId = effectiveMonthlySummaryMetricId(state, projectId, field.id);
        if (!metricId) return <Box key={field.id} sx={{ minHeight: 20 }} />;
        const definition = state.summaryFormulas.find(
          (item) =>
            item.targetKind === "column" &&
            item.summaryId === summary.id &&
            item.metricId === metricId &&
            item.columnId === columnId,
        );
        if (!definition) return <Box key={field.id} sx={{ minHeight: 20 }} />;
        const result = engine.calculateSummaryColumn(
          projectId,
          summary.id,
          metricId,
          state.selectedYear,
          columnId,
        );
        const value = result.value.kind === "scalar" ? result.value.value : null;
        const expression = astToBusinessExpression(definition.formula.ast, state, projectId);
        return (
          <Box
            key={field.id}
            {...formulaHoverProps(() =>
              buildFormulaHoverContent({
                formula: expression,
                result,
                state,
                projectId,
                resultField: field,
              }),
            )}
            sx={{ cursor: "help" }}
          >
            {result.state === "Error" ? (
              <Typography variant="body2" color="error">
                {formulaErrorLabel(result.errorCode)}
              </Typography>
            ) : (
              <FieldValueDisplay field={field} value={value} strong />
            )}
          </Box>
        );
      })}
    </Stack>
  );

  const monthlyFooterCell = (summaryRowId: string, month: number, columnId: string) => (
    <Stack spacing={0.4}>
      {state.summaryFormulas
        .filter(
          (item) =>
            item.targetKind === "row" &&
            item.summaryId === summaryRowId &&
            item.columnId === columnId,
        )
        .map((definition) => {
          const metric = state.monthlySummaryMetrics.find(
            (item) => item.id === definition.metricId,
          );
          if (!metric) return null;
          const field = summaryMetricAsField(metric);
          const result = engine.calculateSummaryRowAtMonth(
            projects[0]?.id ?? "",
            summaryRowId,
            definition.metricId,
            state.selectedYear,
            month,
            columnId,
          );
          const value = result.value.kind === "scalar" ? result.value.value : null;
          const expression = astToBusinessExpression(definition.formula.ast, state)
            .replaceAll("Từ đầu năm đến tháng này", "Từ đầu năm đến cột hiện tại")
            .replaceAll("Tháng hiện tại", "Cột hiện tại");
          return (
            <Box
              key={definition.id}
              {...formulaHoverProps(() =>
                buildFormulaHoverContent({
                  formula: expression,
                  result,
                  state,
                  projectId: projects[0]?.id,
                  resultField: field,
                }),
              )}
              sx={{ cursor: "help" }}
            >
              <Typography variant="caption">{field.label}</Typography>
              {result.state === "Error" ? (
                <Typography variant="body2" color="error">
                  {formulaErrorLabel(result.errorCode)}
                </Typography>
              ) : (
                <FieldValueDisplay field={field} value={value} strong />
              )}
            </Box>
          );
        })}
    </Stack>
  );

  const summaryFooterCell = (
    summaryRowId: string,
    summary: SummaryColumnDefinition,
    columnId: string,
  ) => (
    <Stack spacing={0.4}>
      {state.summaryFormulas
        .filter(
          (item) =>
            item.targetKind === "row" &&
            item.summaryId === summaryRowId &&
            item.columnId === columnId,
        )
        .map((definition) => {
          const metric = state.monthlySummaryMetrics.find(
            (item) => item.id === definition.metricId,
          );
          if (!metric) return null;
          const field = summaryMetricAsField(metric);
          const result = engine.calculateSummaryRowAtSummaryColumn(
            projects[0]?.id ?? "",
            summaryRowId,
            definition.metricId,
            state.selectedYear,
            summary.id,
            columnId,
          );
          const value = result.value.kind === "scalar" ? result.value.value : null;
          const expression = astToBusinessExpression(definition.formula.ast, state)
            .replaceAll("Từ đầu năm đến tháng này", `Cột ${summary.label}`)
            .replaceAll("Tháng hiện tại", `Cột ${summary.label}`);
          return (
            <Box
              key={`${definition.id}-${summary.id}`}
              {...formulaHoverProps(() =>
                buildFormulaHoverContent({
                  formula: expression,
                  result,
                  state,
                  projectId: projects[0]?.id,
                  resultField: field,
                }),
              )}
              sx={{ cursor: "help" }}
            >
              <Typography variant="caption">{field.label}</Typography>
              {result.state === "Error" ? (
                <Typography variant="body2" color="error">
                  {formulaErrorLabel(result.errorCode)}
                </Typography>
              ) : (
                <FieldValueDisplay field={field} value={value} strong />
              )}
            </Box>
          );
        })}
    </Stack>
  );
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ justifyContent: "space-between", gap: 1 }}
      >
        <Box>
          <Typography variant="h4">Bảng tổng hợp KKV</Typography>
          <Typography color="text.secondary">
            {hasActiveFilters
              ? `${projects.length}/${allProjects.length} dự án theo bộ lọc`
              : `${allProjects.length} dự án`}{" "}
            · Năm {state.selectedYear} · Số dòng theo cấu hình từng dự án
          </Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <Button variant="contained" onClick={onManageProjects}>
            Quản lý dự án
          </Button>
        </Stack>
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "minmax(220px, 1.6fr) repeat(3, minmax(150px, 1fr)) auto",
          },
          gap: 1,
          alignItems: "start",
        }}
      >
        <DebouncedProjectSearch value={searchText} onChange={setSearchText} />
        <TextField
          select
          size="small"
          label="Bộ phận"
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
        >
          <MenuItem value="">Tất cả</MenuItem>
          {departments.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Phân loại"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <MenuItem value="">Tất cả</MenuItem>
          {categories.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Phụ trách"
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
        >
          <MenuItem value="">Tất cả</MenuItem>
          {owners.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
        <Button
          size="small"
          disabled={!hasActiveFilters}
          onClick={() => {
            setSearchText("");
            setDepartmentFilter("");
            setCategoryFilter("");
            setOwnerFilter("");
          }}
          sx={{ minHeight: 40, whiteSpace: "nowrap" }}
        >
          Xóa bộ lọc
        </Button>
      </Box>
      <TableWorkspace
        title="Dữ liệu tổng hợp"
        subtitle="Kéo trực tiếp trên vùng bảng để di chuyển ngang và dọc"
        height="calc(100vh - 300px)"
      >
        <Table
          stickyHeader
          size="small"
          sx={{
            minWidth: 2800,
            "& td, & th": { borderRight: 1, borderColor: "divider" },
            "& thead th": {
              color: "#274247",
              bgcolor: "#EAF1F2",
              whiteSpace: "normal",
              overflowWrap: "break-word",
              wordBreak: "normal",
              lineHeight: 1.3,
            },
            // MUI tự đặt header thường ở z-index 2. Chỉ thay đổi khoảng cách top của
            // hai hàng; không đặt z-index tại đây để tránh ghi đè các ô vừa ghim ngang vừa ghim dọc.
            "& thead tr:first-of-type > th": { top: 0 },
            "& thead tr:nth-of-type(2) > th": { top: primaryHeaderHeight },
            "& tbody td": { py: 0.75, whiteSpace: "nowrap" },
          }}
        >
          <TableHead>
            <TableRow sx={{ height: primaryHeaderHeight }}>
              <TableCell
                rowSpan={2}
                sx={{
                  position: "sticky",
                  left: 0,
                  zIndex: 4,
                  width: projectCodeWidth,
                  minWidth: projectCodeWidth,
                  maxWidth: projectCodeWidth,
                  bgcolor: "#DDEBEC",
                }}
              >
                Mã dự án
              </TableCell>
              <TableCell
                rowSpan={2}
                sx={{
                  position: "sticky",
                  left: projectCodeWidth,
                  zIndex: 4,
                  width: projectNameWidth,
                  minWidth: projectNameWidth,
                  maxWidth: projectNameWidth,
                  bgcolor: "#DDEBEC",
                  boxShadow: "2px 0 4px rgba(23,43,48,.08)",
                }}
              >
                Dự án
              </TableCell>
              {projectFieldColumns.map((column) =>
                column.kind === "field" ? (
                  <TableCell
                    key={column.field.id}
                    rowSpan={2}
                    align="center"
                    sx={{
                      width: column.field.width ?? projectFieldWidth,
                      minWidth: column.field.width ?? projectFieldWidth,
                      maxWidth: column.field.width,
                    }}
                  >
                    {column.field.label}
                  </TableCell>
                ) : (
                  <TableCell
                    key={column.group.id}
                    colSpan={column.children.length}
                    align="center"
                    sx={{ bgcolor: "primary.50" }}
                  >
                    {column.group.label}
                  </TableCell>
                ),
              )}
              <TableCell
                rowSpan={2}
                sx={{
                  position: "sticky",
                  left: frozenProjectWidth,
                  zIndex: 4,
                  width: monthlyMetricWidth,
                  minWidth: monthlyMetricWidth,
                  maxWidth: monthlyMetricWidth,
                  bgcolor: "#DDEBEC",
                  boxShadow: "2px 0 4px rgba(23,43,48,.08)",
                }}
              >
                Chỉ tiêu tháng
              </TableCell>
              {state.periods.map((period) => (
                <TableCell
                  key={period.month}
                  colSpan={state.monthlyColumns.length}
                  align="center"
                  sx={{
                    bgcolor:
                      state.selectedYear === new Date().getFullYear() &&
                      period.month === new Date().getMonth() + 1
                        ? "primary.light"
                        : undefined,
                  }}
                >
                  T{period.month}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.5, color: "text.secondary" }}
                  >
                    ({String(calendarValue(state, "workingDays", period.month) ?? "—")} ngày)
                  </Typography>
                </TableCell>
              ))}
              {summaryColumns.map((summary) => (
                <TableCell
                  key={summary.id}
                  colSpan={columnsForSummary(summary).length}
                  align="center"
                >
                  {summary.label}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              {projectFieldColumns.flatMap((column) =>
                column.kind === "group"
                  ? column.children.map((field) => (
                      <TableCell
                        key={field.id}
                        align="center"
                        sx={{
                          width: field.width ?? projectFieldWidth,
                          minWidth: field.width ?? projectFieldWidth,
                          maxWidth: field.width,
                        }}
                      >
                        {field.label}
                      </TableCell>
                    ))
                  : [],
              )}
              {state.periods.flatMap((period) =>
                state.monthlyColumns.map((column) => (
                  <TableCell
                    key={`${period.month}-${column.id}`}
                    align="right"
                    sx={{
                      minWidth: 112,
                      bgcolor: column.role === "actual" ? "#E8F4F0" : "#EEF3FA",
                      color: column.role === "actual" ? "#1F6A57" : "#315A8A",
                    }}
                  >
                    {column.label}
                  </TableCell>
                )),
              )}
              {summaryColumns.flatMap((summary) =>
                columnsForSummary(summary).map((column) => (
                  <TableCell key={`${summary.code}-${column.id}`} align="right">
                    {column.label}
                  </TableCell>
                )),
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((project) => {
              const rows = rowsForProject(project.id);
              return rows.map((rowIndex, rowPosition) => (
                <TableRow
                  key={`${project.id}-${rowIndex}`}
                  sx={{
                    bgcolor: rowColors[rowPosition % rowColors.length],
                    "& > td": {
                      borderTop: rowPosition === 0 ? "2px solid" : undefined,
                      borderTopColor: rowPosition === 0 ? "primary.light" : undefined,
                    },
                  }}
                >
                  {rowPosition === 0 && (
                    <TableCell
                      rowSpan={rows.length}
                      sx={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        width: projectCodeWidth,
                        minWidth: projectCodeWidth,
                        maxWidth: projectCodeWidth,
                        verticalAlign: "middle",
                        bgcolor: "#FFFFFF",
                        px: 0.75,
                        overflow: "hidden",
                      }}
                    >
                      <Button
                        size="small"
                        endIcon={<OpenInNewRounded />}
                        onClick={() => onOpenProject(project.id)}
                        title={project.code}
                        sx={{
                          width: "100%",
                          minWidth: 0,
                          px: 0.5,
                          justifyContent: "space-between",
                          overflow: "hidden",
                          "& .MuiButton-endIcon": { ml: 0.25, flexShrink: 0 },
                        }}
                      >
                        <Typography
                          component="span"
                          variant="caption"
                          noWrap
                          sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          {project.code}
                        </Typography>
                      </Button>
                    </TableCell>
                  )}
                  {rowPosition === 0 && (
                    <TableCell
                      rowSpan={rows.length}
                      sx={{
                        position: "sticky",
                        left: projectCodeWidth,
                        zIndex: 1,
                        width: projectNameWidth,
                        minWidth: projectNameWidth,
                        maxWidth: projectNameWidth,
                        verticalAlign: "middle",
                        bgcolor: "#FFFFFF",
                        boxShadow: "2px 0 4px rgba(23,43,48,.08)",
                        whiteSpace: "normal",
                        overflow: "hidden",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      <Typography
                        title={project.name}
                        sx={{
                          fontWeight: 700,
                          lineHeight: 1.35,
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                        variant="body2"
                      >
                        {project.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: "block",
                          mt: 0.25,
                          lineHeight: 1.3,
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {project.category} · {project.department}
                      </Typography>
                    </TableCell>
                  )}
                  {rowPosition === 0
                    ? orderedProjectColumns.map((column) => {
                        const mappedField = projectTableModels
                          .get(project.id)
                          ?.projectFieldsByColumnId.get(column.id);
                        return (
                          <TableCell
                            key={column.id}
                            rowSpan={rows.length}
                            align={mappedField?.semanticType === "Number" ? "right" : "left"}
                            sx={{
                              width: column.width ?? projectFieldWidth,
                              minWidth: column.width ?? projectFieldWidth,
                              maxWidth: column.width,
                              overflow: "hidden",
                              verticalAlign: "middle",
                            }}
                          >
                            {projectCell(project.id, column)}
                          </TableCell>
                        );
                      })
                    : null}
                  <TableCell
                    sx={{
                      position: "sticky",
                      left: frozenProjectWidth,
                      zIndex: 1,
                      width: monthlyMetricWidth,
                      minWidth: monthlyMetricWidth,
                      maxWidth: monthlyMetricWidth,
                      bgcolor: rowColors[rowPosition % rowColors.length],
                      boxShadow: "2px 0 4px rgba(23,43,48,.08)",
                      verticalAlign: "middle",
                      whiteSpace: "normal",
                      overflow: "hidden",
                    }}
                  >
                    <Stack spacing={0.75}>
                      {metricsForRow(project.id, rowIndex).map((field) => (
                        <Box key={field.id}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 650,
                              lineHeight: 1.3,
                              whiteSpace: "normal",
                              overflowWrap: "break-word",
                              wordBreak: "normal",
                            }}
                          >
                            {field.label}
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                              sx={{ whiteSpace: "normal" }}
                            >
                              {field.suffix ? ` · ${field.suffix}` : ""}
                            </Typography>
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </TableCell>
                  {state.periods.flatMap((period) =>
                    state.monthlyColumns.map((column) => (
                      <TableCell key={`${period.month}-${column.id}`} align="right">
                        {monthCell(project.id, period.month, column.id, rowIndex)}
                      </TableCell>
                    )),
                  )}
                  {summaryColumns.flatMap((summary) =>
                    columnsForSummary(summary).map((column) => (
                      <TableCell key={`${summary.code}-${column.id}`} align="right">
                        {summaryCell(project.id, summary, column.id, rowIndex)}
                      </TableCell>
                    )),
                  )}
                </TableRow>
              ));
            })}
            {!projects.length && (
              <TableRow>
                <TableCell colSpan={99} sx={{ py: 8, textAlign: "center" }}>
                  <Typography variant="h6">Năm {state.selectedYear} chưa có dự án</Typography>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    Đây là bộ dữ liệu độc lập, không sao chép dự án từ năm khác.
                  </Typography>
                  <Button variant="contained" onClick={onManageProjects}>
                    Mở quản lý dự án
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            {summaryRows.map((summaryRow) => (
              <TableRow key={summaryRow.id}>
                <TableCell
                  sx={{
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    width: projectCodeWidth,
                    minWidth: projectCodeWidth,
                    maxWidth: projectCodeWidth,
                    bgcolor: "#DDEBEC",
                  }}
                />
                <TableCell
                  sx={{
                    position: "sticky",
                    left: projectCodeWidth,
                    zIndex: 1,
                    width: projectNameWidth,
                    minWidth: projectNameWidth,
                    maxWidth: projectNameWidth,
                    bgcolor: "#DDEBEC",
                    boxShadow: "2px 0 4px rgba(23,43,48,.08)",
                  }}
                />
                {orderedProjectColumns.map((column) => (
                  <TableCell
                    key={`${summaryRow.id}-${column.id}-project-placeholder`}
                    sx={{
                      width: column.width ?? projectFieldWidth,
                      minWidth: column.width ?? projectFieldWidth,
                      maxWidth: column.width,
                      bgcolor: "#DDEBEC",
                    }}
                  />
                ))}
                <TableCell
                  sx={{
                    position: "sticky",
                    left: frozenProjectWidth,
                    zIndex: 1,
                    width: monthlyMetricWidth,
                    minWidth: monthlyMetricWidth,
                    maxWidth: monthlyMetricWidth,
                    bgcolor: "#DDEBEC",
                    color: "text.primary",
                    fontWeight: 800,
                    boxShadow: "2px 0 4px rgba(23,43,48,.08)",
                  }}
                >
                  {summaryRow.label}
                </TableCell>
                {state.periods.flatMap((period) =>
                  state.monthlyColumns.map((column) => (
                    <TableCell
                      key={`${summaryRow.code}-${period.month}-${column.id}`}
                      align="right"
                      sx={{ bgcolor: "#F0F6F6" }}
                    >
                      {summaryRow.showInMonthlyColumns
                        ? monthlyFooterCell(summaryRow.id, period.month, column.id)
                        : null}
                    </TableCell>
                  )),
                )}
                {summaryColumns.flatMap((summary) =>
                  columnsForSummary(summary).map((column) => (
                    <TableCell
                      key={`${summaryRow.code}-${summary.code}-${column.id}`}
                      align="right"
                      sx={{ bgcolor: "#F0F6F6" }}
                    >
                      {summaryRow.summaryColumnIds.includes(summary.id)
                        ? summaryFooterCell(summaryRow.id, summary, column.id)
                        : null}
                    </TableCell>
                  )),
                )}
              </TableRow>
            ))}
          </TableFooter>
        </Table>
      </TableWorkspace>
      {formulaHoverCard}
    </Stack>
  );
}
