import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
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
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useKkv } from "../context/kkv-context";
import type {
  ColumnGroupDefinition,
  MonthlyColumnDefinition,
  SummaryProjectColumnDefinition,
} from "../domain/types";
import type { FormulaAst } from "../formula/ast";
import { createClientId } from "../utils/id";
import { createTechnicalCode } from "../utils/technical-code";
import { ConfigTemplatesTab } from "../components/project-field-config/ConfigTemplatesTab";
import { MonthlySummaryMetricsTab } from "../components/project-field-config/MonthlySummaryMetricsTab";
import {
  ProjectFieldOrderEditor,
  type ProjectFieldRootOrderItem,
} from "../components/project-field-config/ProjectFieldOrderEditor";
import { calendarFields } from "../domain/metadata";
import { TypedFieldInput } from "../components/dynamic-fields/TypedFieldInput";

export function StructureConfigPage() {
  const { state, updateState } = useKkv();
  const [tab, setTab] = useState(0);
  const [summaryColumnDraft, setSummaryColumnDraft] =
    useState<SummaryProjectColumnDefinition | null>(null);
  const [deleteSummaryColumn, setDeleteSummaryColumn] =
    useState<SummaryProjectColumnDefinition | null>(null);
  const [summaryColumnError, setSummaryColumnError] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<ColumnGroupDefinition | null>(null);
  const [columnDraft, setColumnDraft] = useState<MonthlyColumnDefinition | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [columnError, setColumnError] = useState<string | null>(null);
  const reorderSummaryColumnRoots = (items: ProjectFieldRootOrderItem[]) => {
    const fieldOrderById = new Map<string, number>();
    const groupOrderById = new Map<string, number>();
    items.forEach((item, index) => {
      const target = item.kind === "field" ? fieldOrderById : groupOrderById;
      target.set(item.id, (index + 1) * 10);
    });
    updateState((current) => ({
      ...current,
      summaryProjectColumns: current.summaryProjectColumns.map((column) => {
        const sortOrder = fieldOrderById.get(column.id);
        return sortOrder === undefined ? column : { ...column, sortOrder };
      }),
      columnGroups: current.columnGroups.map((group) => {
        const sortOrder = groupOrderById.get(group.id);
        return sortOrder === undefined ? group : { ...group, sortOrder };
      }),
    }));
  };

  const reorderSummaryGroupColumns = (groupId: string, fieldIds: string[]) => {
    const orderById = new Map(fieldIds.map((id, index) => [id, (index + 1) * 10]));
    updateState((current) => ({
      ...current,
      summaryProjectColumns: current.summaryProjectColumns.map((column) => {
        if (column.parentId !== groupId) return column;
        const sortOrder = orderById.get(column.id);
        return sortOrder === undefined ? column : { ...column, sortOrder };
      }),
    }));
  };

  const openNewSummaryColumn = () => {
    setSummaryColumnError(null);
    setSummaryColumnDraft({
      id: "",
      code: "",
      label: "",
      columnType: "standalone",
      sortOrder: Math.max(0, ...state.summaryProjectColumns.map((item) => item.sortOrder)) + 10,
      enabled: true,
    });
  };

  const saveSummaryColumn = () => {
    if (!summaryColumnDraft) return;
    if (!summaryColumnDraft.label.trim()) {
      setSummaryColumnError("Tên cột không được để trống.");
      return;
    }
    if (summaryColumnDraft.columnType === "child" && !summaryColumnDraft.parentId) {
      setSummaryColumnError("Cột con phải thuộc một nhóm cha.");
      return;
    }
    const existingCodes = state.summaryProjectColumns
      .filter((item) => item.id !== summaryColumnDraft.id)
      .map((item) => item.code);
    const code = summaryColumnDraft.id
      ? summaryColumnDraft.code
      : createTechnicalCode(summaryColumnDraft.label, existingCodes, summaryColumnDraft.code);
    const saved = {
      ...summaryColumnDraft,
      id: summaryColumnDraft.id || createClientId("summary-project-column"),
      code,
      label: summaryColumnDraft.label.trim(),
      parentId: summaryColumnDraft.columnType === "child" ? summaryColumnDraft.parentId : undefined,
    };
    updateState((current) => ({
      ...current,
      summaryProjectColumns: current.summaryProjectColumns.some((item) => item.id === saved.id)
        ? current.summaryProjectColumns.map((item) => (item.id === saved.id ? saved : item))
        : [...current.summaryProjectColumns, saved],
    }));
    setSummaryColumnDraft(null);
    setSummaryColumnError(null);
  };

  const confirmDeleteSummaryColumn = () => {
    if (!deleteSummaryColumn) return;
    updateState((current) => ({
      ...current,
      summaryProjectColumns: current.summaryProjectColumns.filter(
        (column) => column.id !== deleteSummaryColumn.id,
      ),
      projectFieldConfigs: current.projectFieldConfigs.map((config) =>
        config.summaryProjectColumnId === deleteSummaryColumn.id
          ? { ...config, summaryProjectColumnId: undefined }
          : config,
      ),
      projectFieldTemplates: current.projectFieldTemplates.map((template) => ({
        ...template,
        projectFields: (template.projectFields ?? []).map((item) =>
          item.summaryProjectColumnId === deleteSummaryColumn.id
            ? { ...item, summaryProjectColumnId: undefined }
            : item,
        ),
      })),
    }));
    setDeleteSummaryColumn(null);
  };

  const saveGroup = () => {
    if (!groupDraft) return;
    if (!groupDraft.label.trim()) {
      setGroupError("Tên hiển thị không được để trống.");
      return;
    }
    const existingCodes = state.columnGroups
      .filter((item) => item.id !== groupDraft.id)
      .map((item) => item.code);
    const code = groupDraft.id
      ? groupDraft.code
      : createTechnicalCode(groupDraft.label, existingCodes, groupDraft.code);
    if (existingCodes.some((item) => item.toLowerCase() === code.toLowerCase())) {
      setGroupError("Mã kỹ thuật của nhóm cha đã tồn tại.");
      return;
    }
    const saved = { ...groupDraft, code, label: groupDraft.label.trim() };
    updateState((current) => ({
      ...current,
      columnGroups: current.columnGroups.some((item) => item.id === saved.id)
        ? current.columnGroups.map((item) => (item.id === saved.id ? saved : item))
        : [...current.columnGroups, { ...saved, id: createClientId("group") }],
    }));
    setGroupDraft(null);
    setGroupError(null);
  };

  const saveColumn = () => {
    if (!columnDraft) return;
    if (!columnDraft.label.trim()) {
      setColumnError("Tên hiển thị không được để trống.");
      return;
    }
    const existingCodes = state.monthlyColumns
      .filter((item) => item.id !== columnDraft.id)
      .map((item) => item.code);
    const code = columnDraft.id
      ? columnDraft.code
      : createTechnicalCode(columnDraft.label, existingCodes, columnDraft.code);
    if (existingCodes.some((item) => item.toLowerCase() === code.toLowerCase())) {
      setColumnError("Mã kỹ thuật của cột tháng đã tồn tại.");
      return;
    }
    const saved = { ...columnDraft, code, label: columnDraft.label.trim() };
    updateState((current) => ({
      ...current,
      monthlyColumns: current.monthlyColumns.some((item) => item.id === saved.id)
        ? current.monthlyColumns.map((item) => (item.id === saved.id ? saved : item))
        : [...current.monthlyColumns, { ...saved, id: createClientId("column") }],
    }));
    setColumnDraft(null);
    setColumnError(null);
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ justifyContent: "space-between", gap: 1 }}
      >
        <Box>
          <Typography variant="h4">Cấu hình dữ liệu</Typography>
        </Box>
      </Stack>
      <Card variant="outlined">
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label={`Mẫu cấu hình (${state.projectFieldTemplates.length})`} />
          <Tab label={`Cột thông tin tổng hợp (${state.summaryProjectColumns.length})`} />
          <Tab label={`Chỉ tiêu bảng tổng hợp (${state.monthlySummaryMetrics.length})`} />
          <Tab label={`Nhóm cột tổng hợp (${state.columnGroups.length})`} />
          <Tab label={`Cột tháng (${state.monthlyColumns.length})`} />
          <Tab label="Lịch làm việc" />
        </Tabs>
        <CardContent>
          {tab === 0 && <ConfigTemplatesTab state={state} updateState={updateState} />}
          {tab === 1 && (
            <SummaryProjectColumnsTab
              columns={state.summaryProjectColumns}
              groups={state.columnGroups}
              onAdd={openNewSummaryColumn}
              onEdit={(column) => {
                setSummaryColumnError(null);
                setSummaryColumnDraft(structuredClone(column));
              }}
              onDelete={setDeleteSummaryColumn}
              onReorderRoot={reorderSummaryColumnRoots}
              onReorderChildren={reorderSummaryGroupColumns}
            />
          )}
          {tab === 2 && <MonthlySummaryMetricsTab state={state} updateState={updateState} />}
          {tab === 3 && (
            <GroupsTab
              state={state}
              onEdit={(group) => {
                setGroupError(null);
                setGroupDraft(group);
              }}
              onAdd={() => {
                setGroupError(null);
                setGroupDraft({
                  id: "",
                  code: "",
                  label: "",
                  sortOrder: state.columnGroups.length * 10 + 10,
                });
              }}
              updateState={updateState}
            />
          )}
          {tab === 4 && (
            <ColumnsTab
              state={state}
              onEdit={(column) => {
                setColumnError(null);
                setColumnDraft(column);
              }}
              onAdd={() => {
                setColumnError(null);
                setColumnDraft({
                  id: "",
                  code: "",
                  label: "",
                  sortOrder: state.monthlyColumns.length * 10 + 10,
                });
              }}
              updateState={updateState}
            />
          )}
          {tab === 5 && <CalendarTab state={state} updateState={updateState} />}
        </CardContent>
      </Card>

      <SimpleMetadataDialog
        title="nhóm cột tổng hợp"
        draft={groupDraft}
        error={groupError}
        existingCodes={state.columnGroups
          .filter((item) => item.id !== groupDraft?.id)
          .map((item) => item.code)}
        onChange={setGroupDraft}
        onClose={() => {
          setGroupDraft(null);
          setGroupError(null);
        }}
        onSave={saveGroup}
      />
      <SimpleMetadataDialog
        title="cột tháng"
        draft={columnDraft}
        error={columnError}
        existingCodes={state.monthlyColumns
          .filter((item) => item.id !== columnDraft?.id)
          .map((item) => item.code)}
        onChange={setColumnDraft}
        onClose={() => {
          setColumnDraft(null);
          setColumnError(null);
        }}
        onSave={saveColumn}
      />
      <SummaryProjectColumnDialog
        draft={summaryColumnDraft}
        error={summaryColumnError}
        groups={state.columnGroups}
        existingCodes={state.summaryProjectColumns
          .filter((item) => item.id !== summaryColumnDraft?.id)
          .map((item) => item.code)}
        onChange={setSummaryColumnDraft}
        onClose={() => {
          setSummaryColumnDraft(null);
          setSummaryColumnError(null);
        }}
        onSave={saveSummaryColumn}
      />
      <Dialog
        open={Boolean(deleteSummaryColumn)}
        onClose={() => setDeleteSummaryColumn(null)}
        maxWidth="xs"
      >
        <DialogTitle>Xóa cột thông tin tổng hợp?</DialogTitle>
        <DialogContent>
          <Typography>
            Cột “{deleteSummaryColumn?.label}” sẽ bị xóa khỏi bảng tổng hợp. Chỉ tiêu và dữ liệu của
            từng dự án vẫn được giữ nguyên.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSummaryColumn(null)}>Hủy</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteSummaryColumn}>
            Xóa cột
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

type State = ReturnType<typeof useKkv>["state"];
type UpdateState = ReturnType<typeof useKkv>["updateState"];

function SummaryProjectColumnsTab({
  columns,
  groups,
  onAdd,
  onEdit,
  onDelete,
  onReorderRoot,
  onReorderChildren,
}: {
  columns: SummaryProjectColumnDefinition[];
  groups: ColumnGroupDefinition[];
  onAdd: () => void;
  onEdit: (column: SummaryProjectColumnDefinition) => void;
  onDelete: (column: SummaryProjectColumnDefinition) => void;
  onReorderRoot: (items: ProjectFieldRootOrderItem[]) => void;
  onReorderChildren: (groupId: string, columnIds: string[]) => void;
}) {
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Đây chỉ là các vị trí hiển thị chung trên bảng tổng hợp. Cột không lưu giá trị và không xuất
        hiện trong Trình tạo công thức; mỗi dự án tự gán chỉ tiêu của mình vào một cột phù hợp.
      </Alert>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Box>
          <Typography variant="h6">Bố cục thông tin tổng hợp</Typography>
          <Typography variant="body2" color="text.secondary">
            Sắp xếp theo nhóm cha, sau đó gán chỉ tiêu tại màn Quản lý dự án.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddRounded />} onClick={onAdd}>
          Thêm cột
        </Button>
      </Stack>
      <ProjectFieldOrderEditor
        fields={columns}
        groups={groups}
        onReorderRoot={onReorderRoot}
        onReorderChildren={onReorderChildren}
        onEdit={onEdit}
      />
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell>Tên cột</TableCell>
              <TableCell>Mã ổn định</TableCell>
              <TableCell>Nhóm</TableCell>
              <TableCell>Độ rộng</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...columns]
              .sort((first, second) => first.sortOrder - second.sortOrder)
              .map((column) => (
                <TableRow hover key={column.id}>
                  <TableCell>
                    <Button color="inherit" onClick={() => onEdit(column)}>
                      {column.label}
                    </Button>
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace" }}>{column.code}</TableCell>
                  <TableCell>
                    {groups.find((group) => group.id === column.parentId)?.label ?? "Cột độc lập"}
                  </TableCell>
                  <TableCell>{column.width ? `${column.width}px` : "Mặc định"}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={column.enabled ? "success" : "default"}
                      label={column.enabled ? "Đang hiển thị" : "Đang ẩn"}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Sửa cột">
                      <IconButton size="small" onClick={() => onEdit(column)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Xóa cột (không xóa dữ liệu dự án)">
                      <IconButton size="small" color="error" onClick={() => onDelete(column)}>
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}

function SummaryProjectColumnDialog({
  draft,
  error,
  groups,
  existingCodes,
  onChange,
  onClose,
  onSave,
}: {
  draft: SummaryProjectColumnDefinition | null;
  error: string | null;
  groups: ColumnGroupDefinition[];
  existingCodes: string[];
  onChange: (draft: SummaryProjectColumnDefinition | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  const suggestedCode = createTechnicalCode(draft.label, existingCodes, draft.code);
  return (
    <Dialog open maxWidth="sm" fullWidth onClose={onClose}>
      <DialogTitle>
        {draft.id ? "Sửa cột thông tin tổng hợp" : "Thêm cột thông tin tổng hợp"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="warning">{error}</Alert>}
          <Alert severity="info">
            Cột này chỉ định vị trí trên bảng tổng hợp. Sau khi lưu, vào Quản lý dự án để gán chỉ
            tiêu thật vào cột.
          </Alert>
          <TextField
            autoFocus
            required
            label="Tên cột"
            value={draft.label}
            onChange={(event) => onChange({ ...draft, label: event.target.value })}
          />
          <TextField
            label="Mã ổn định"
            value={draft.id ? draft.code : suggestedCode}
            disabled={Boolean(draft.id)}
            helperText={draft.id ? "Mã không đổi sau khi đã tạo." : "Được tự sinh từ tên cột."}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField
              select
              label="Kiểu bố cục"
              value={draft.columnType}
              onChange={(event) => {
                const columnType = event.target
                  .value as SummaryProjectColumnDefinition["columnType"];
                onChange({
                  ...draft,
                  columnType,
                  parentId: columnType === "child" ? draft.parentId : undefined,
                });
              }}
            >
              <MenuItem value="standalone">Cột độc lập</MenuItem>
              <MenuItem value="child">Cột con trong nhóm</MenuItem>
            </TextField>
            <TextField
              select
              label="Nhóm cha"
              value={draft.parentId ?? ""}
              disabled={draft.columnType !== "child"}
              onChange={(event) =>
                onChange({ ...draft, parentId: event.target.value || undefined })
              }
            >
              <MenuItem value="">Chọn nhóm</MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="number"
              label="Độ rộng (px)"
              value={draft.width ?? ""}
              onChange={(event) =>
                onChange({
                  ...draft,
                  width: event.target.value ? Math.max(96, Number(event.target.value)) : undefined,
                })
              }
              helperText="Để trống để dùng độ rộng mặc định."
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
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={onSave}>
          Lưu cột
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function GroupsTab({
  state,
  onEdit,
  onAdd,
  updateState,
}: {
  state: State;
  onEdit: (value: ColumnGroupDefinition) => void;
  onAdd: () => void;
  updateState: UpdateState;
}) {
  return (
    <Stack spacing={2}>
      <Box>
        <Button variant="outlined" startIcon={<AddRounded />} onClick={onAdd}>
          Thêm nhóm cột
        </Button>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Mã</TableCell>
            <TableCell>Tên hiển thị</TableCell>
            <TableCell>Cột con</TableCell>
            <TableCell>Thứ tự</TableCell>
            <TableCell align="right">Thao tác</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...state.columnGroups]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((group) => (
              <TableRow key={group.id}>
                <TableCell sx={{ fontFamily: "monospace" }}>{group.code}</TableCell>
                <TableCell>{group.label}</TableCell>
                <TableCell>
                  {state.summaryProjectColumns.filter((item) => item.parentId === group.id).length}
                </TableCell>
                <TableCell>{group.sortOrder}</TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => onEdit({ ...group })}>
                    <EditOutlined />
                  </IconButton>
                  <IconButton
                    color="error"
                    onClick={() =>
                      updateState((current) => ({
                        ...current,
                        columnGroups: current.columnGroups.filter((item) => item.id !== group.id),
                        summaryProjectColumns: current.summaryProjectColumns.map((column) =>
                          column.parentId === group.id
                            ? { ...column, parentId: undefined, columnType: "standalone" }
                            : column,
                        ),
                      }))
                    }
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

function ColumnsTab({
  state,
  onEdit,
  onAdd,
  updateState,
}: {
  state: State;
  onEdit: (value: MonthlyColumnDefinition) => void;
  onAdd: () => void;
  updateState: UpdateState;
}) {
  const columnReferenceReasons = (columnId: string) => {
    const astUsesColumn = (ast: FormulaAst): boolean => {
      if (
        (ast.kind === "fieldReference" ||
          ast.kind === "metricReference" ||
          ast.kind === "summaryReference") &&
        ast.columnId === columnId
      )
        return true;
      if (ast.kind === "binary") return astUsesColumn(ast.left) || astUsesColumn(ast.right);
      if (ast.kind === "function") return ast.args.some(astUsesColumn);
      return false;
    };
    const formulaUsesColumn = (formula: { columnId?: string; ast: FormulaAst }) =>
      formula.columnId === columnId || astUsesColumn(formula.ast);
    const reasons: string[] = [];
    if (state.monthlyValues.some((item) => item.columnId === columnId))
      reasons.push("dữ liệu 12 tháng");
    if (
      state.formulaOverrides.some(
        (item) => item.columnId === columnId || formulaUsesColumn(item.formula),
      ) ||
      state.projectFormulaOverrides.some((item) => formulaUsesColumn(item.formula)) ||
      state.fieldDefinitions.some((field) =>
        [field.formula, ...(field.columnFormulas ?? [])].some(
          (formula) => formula && formulaUsesColumn(formula),
        ),
      )
    )
      reasons.push("công thức");
    if (
      state.projectMonthlyFieldConfigs.some((config) =>
        config.allowedColumnIds?.includes(columnId),
      ) ||
      state.projectFieldTemplates.some(
        (template) =>
          template.fields.some((field) => field.allowedColumnIds.includes(columnId)) ||
          template.formulas?.some(
            (item) => item.columnId === columnId || formulaUsesColumn(item.formula),
          ),
      )
    )
      reasons.push("cấu hình dự án hoặc mẫu");
    if (
      state.summaryColumns.some((summary) => summary.columnIds.includes(columnId)) ||
      state.summaryFormulas.some(
        (item) => item.columnId === columnId || formulaUsesColumn(item.formula),
      )
    )
      reasons.push("cấu hình tổng hợp");
    if (
      state.chartDefinitions.some((chart) =>
        chart.series.some((series) => series.columnId === columnId),
      )
    )
      reasons.push("biểu đồ");
    return reasons;
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Button variant="outlined" startIcon={<AddRounded />} onClick={onAdd}>
          Thêm cột tháng
        </Button>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Mã</TableCell>
            <TableCell>Tên hiển thị</TableCell>
            <TableCell>Thứ tự</TableCell>
            <TableCell align="right">Thao tác</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...state.monthlyColumns]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((column) => {
              const referenceReasons = columnReferenceReasons(column.id);
              const referenced = referenceReasons.length > 0;
              return (
                <TableRow key={column.id}>
                  <TableCell sx={{ fontFamily: "monospace" }}>{column.code}</TableCell>
                  <TableCell>{column.label}</TableCell>
                  <TableCell>{column.sortOrder}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => onEdit({ ...column })}>
                      <EditOutlined />
                    </IconButton>
                    <Tooltip
                      title={
                        referenced
                          ? `Không thể xóa vì cột đang được dùng trong: ${referenceReasons.join(", ")}.`
                          : "Xóa cột"
                      }
                    >
                      <span>
                        <IconButton
                          color="error"
                          disabled={state.monthlyColumns.length <= 1 || referenced}
                          onClick={() =>
                            updateState((current) => ({
                              ...current,
                              monthlyColumns: current.monthlyColumns.filter(
                                (item) => item.id !== column.id,
                              ),
                              monthlyValues: current.monthlyValues.filter(
                                (item) => item.columnId !== column.id,
                              ),
                              formulaOverrides: current.formulaOverrides.filter(
                                (item) => item.columnId !== column.id,
                              ),
                              projectMonthlyFieldConfigs: current.projectMonthlyFieldConfigs.map(
                                (config) => ({
                                  ...config,
                                  allowedColumnIds: config.allowedColumnIds?.filter(
                                    (id) => id !== column.id,
                                  ),
                                }),
                              ),
                              projectFieldTemplates: current.projectFieldTemplates.map(
                                (template) => ({
                                  ...template,
                                  fields: template.fields.map((field) => ({
                                    ...field,
                                    allowedColumnIds: field.allowedColumnIds.filter(
                                      (id) => id !== column.id,
                                    ),
                                  })),
                                }),
                              ),
                              summaryColumns: current.summaryColumns.map((summary) => ({
                                ...summary,
                                columnIds: summary.columnIds.filter((id) => id !== column.id),
                              })),
                              summaryFormulas: current.summaryFormulas.filter(
                                (formula) => formula.columnId !== column.id,
                              ),
                            }))
                          }
                        >
                          <DeleteOutlineRounded />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    </Stack>
  );
}

function CalendarTab({ state, updateState }: { state: State; updateState: UpdateState }) {
  const fields = calendarFields(state);
  const updateCalendar = (fieldId: string, month: number, value: unknown) =>
    updateState((current) => {
      const exists = current.calendarValues.some(
        (item) =>
          item.fieldId === fieldId && item.year === current.selectedYear && item.month === month,
      );
      const calendarValues = exists
        ? current.calendarValues.map((item) =>
            item.fieldId === fieldId && item.year === current.selectedYear && item.month === month
              ? { ...item, value }
              : item,
          )
        : [...current.calendarValues, { fieldId, year: current.selectedYear, month, value }];
      return { ...current, calendarValues };
    });
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="h6">Lịch làm việc năm {state.selectedYear}</Typography>
        <Typography variant="body2" color="text.secondary">
          Nhập số ngày làm việc dùng chung cho mọi dự án. Mỗi năm có một bộ 12 tháng độc lập.
        </Typography>
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tháng</TableCell>
              {fields.map((field) => (
                <TableCell key={field.id}>
                  {field.label}
                  {field.suffix ? ` (${field.suffix})` : ""}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {state.periods.map((period) => (
              <TableRow key={period.month}>
                <TableCell>{period.label}</TableCell>
                {fields.map((field) => {
                  const stored = state.calendarValues.find(
                    (item) =>
                      item.fieldId === field.id &&
                      item.year === state.selectedYear &&
                      item.month === period.month,
                  )?.value;
                  return (
                    <TableCell key={field.id}>
                      <TypedFieldInput
                        field={field}
                        value={stored}
                        ariaLabel={`${field.label} ${period.label}`}
                        min={field.id === "workingDays" ? 0 : undefined}
                        max={field.id === "workingDays" ? 31 : undefined}
                        step={field.id === "workingDays" ? 1 : "any"}
                        onCommit={(value) => updateCalendar(field.id, period.month, value)}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}

function SimpleMetadataDialog<T extends ColumnGroupDefinition | MonthlyColumnDefinition>({
  title,
  draft,
  error,
  existingCodes,
  onChange,
  onClose,
  onSave,
}: {
  title: string;
  draft: T | null;
  error: string | null;
  existingCodes: string[];
  onChange: (value: T | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={Boolean(draft)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{draft?.id ? `Sửa ${title}` : `Thêm ${title}`}</DialogTitle>
      {draft && (
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="warning">{error}</Alert>}
            <TextField
              label="Tên hiển thị"
              value={draft.label}
              onChange={(event) => {
                const label = event.target.value;
                onChange({
                  ...draft,
                  label,
                  code: draft.id
                    ? draft.code
                    : createTechnicalCode(label, existingCodes, draft.code),
                });
              }}
            />
            <TextField
              label="Mã kỹ thuật"
              value={draft.code}
              helperText={
                draft.id
                  ? "Mã hệ thống đã khóa để các cấu hình liên quan không bị thay đổi"
                  : "Tự sinh từ tên hiển thị; không cần nhập"
              }
              slotProps={{ input: { readOnly: true } }}
            />
            <TextField
              type="number"
              label="Thứ tự"
              value={draft.sortOrder}
              onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })}
            />
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={onSave}>
          Lưu
        </Button>
      </DialogActions>
    </Dialog>
  );
}
