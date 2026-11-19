import { useState, type DragEvent } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import DragIndicatorRounded from "@mui/icons-material/DragIndicatorRounded";
import FullscreenRounded from "@mui/icons-material/FullscreenRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import type { KkvState, ProjectFieldDefinition } from "../../domain/types";
import {
  monthlyFieldColumns,
  monthlyFieldsForProject,
  monthlyLayoutForProject,
} from "../../domain/metadata";
import { sourceLabel } from "./project-field-presets";

interface MonthlyLayoutPreviewProps {
  state: KkvState;
  projectId: string;
  onMoveField: (fieldId: string, rowId: string, beforeFieldId?: string) => void;
  onMoveRow: (rowId: string, beforeRowId: string) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onResetLayout: () => void;
}

export function MonthlyLayoutPreview({
  state,
  projectId,
  onMoveField,
  onMoveRow,
  onAddRow,
  onDeleteRow,
  onResetLayout,
}: MonthlyLayoutPreviewProps) {
  const [fullScreen, setFullScreen] = useState(false);
  const fields = monthlyFieldsForProject(state, projectId);
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const layout = monthlyLayoutForProject(state, projectId);
  const hasCustomLayout = state.projectMonthlyLayouts.some((item) => item.projectId === projectId);
  const rows = [...layout.rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const placements = [...layout.placements].sort((a, b) => a.sortOrder - b.sortOrder);

  const startDragging = (event: DragEvent, fieldId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-kkv-field", fieldId);
  };

  const startDraggingRow = (event: DragEvent, rowId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-kkv-row", rowId);
  };

  const dropOnRow = (event: DragEvent, rowId: string) => {
    event.preventDefault();
    const fieldId = event.dataTransfer.getData("application/x-kkv-field");
    if (fieldId) {
      onMoveField(fieldId, rowId);
      return;
    }
    const draggedRowId = event.dataTransfer.getData("application/x-kkv-row");
    if (draggedRowId && draggedRowId !== rowId) onMoveRow(draggedRowId, rowId);
  };

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}
      >
        <Box>
          <Typography variant="h6">Xem trước</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Kéo chỉ tiêu để đổi hàng, kéo tay nắm của hàng để sắp xếp toàn bộ bố cục.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          {hasCustomLayout ? (
            <Button
              size="small"
              color="inherit"
              startIcon={<RestartAltRounded />}
              onClick={onResetLayout}
            >
              Khôi phục bố cục mẫu
            </Button>
          ) : null}
          <Button size="small" variant="outlined" startIcon={<AddRounded />} onClick={onAddRow}>
            Thêm hàng
          </Button>
          <Tooltip title="Xem bảng 12 tháng toàn màn hình">
            <IconButton onClick={() => setFullScreen(true)}>
              <FullscreenRounded />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 1,
        }}
      >
        {rows.map((row, rowPosition) => (
          <PreviewRowCard
            key={row.id}
            state={state}
            projectId={projectId}
            rowId={row.id}
            rowNumber={rowPosition + 1}
            fields={placements
              .filter((placement) => placement.rowId === row.id)
              .map((placement) => fieldsById.get(placement.fieldId))
              .filter((field): field is ProjectFieldDefinition => Boolean(field))}
            onDragStart={startDragging}
            onRowDragStart={startDraggingRow}
            onDrop={dropOnRow}
            onMoveField={onMoveField}
            onDelete={onDeleteRow}
            canDelete={rows.length > 1}
          />
        ))}
      </Box>

      <Dialog fullScreen open={fullScreen} onClose={() => setFullScreen(false)}>
        <DialogTitle>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="h6">Xem trước bảng dữ liệu 12 tháng</Typography>
              <Typography variant="body2" color="text.secondary">
                Ô hiển thị “Nhập” hoặc “Tự tính” theo cấu hình hiện tại.
              </Typography>
            </Box>
            <IconButton aria-label="Đóng phần xem trước" onClick={() => setFullScreen(false)}>
              <CloseRounded />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          <TwelveMonthPreviewTable state={state} projectId={projectId} fields={fields} />
        </DialogContent>
      </Dialog>
    </Box>
  );
}

interface PreviewRowCardProps {
  state: KkvState;
  projectId: string;
  rowId: string;
  rowNumber: number;
  fields: ProjectFieldDefinition[];
  onDragStart: (event: DragEvent, fieldId: string) => void;
  onRowDragStart: (event: DragEvent, rowId: string) => void;
  onDrop: (event: DragEvent, rowId: string) => void;
  onMoveField: (fieldId: string, rowId: string, beforeFieldId?: string) => void;
  onDelete: (rowId: string) => void;
  canDelete: boolean;
}

function PreviewRowCard({
  state,
  projectId,
  rowId,
  rowNumber,
  fields,
  onDragStart,
  onRowDragStart,
  onDrop,
  onMoveField,
  onDelete,
  canDelete,
}: PreviewRowCardProps) {
  const deleteDisabled = fields.length > 0 || !canDelete;
  return (
    <Card
      variant="outlined"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, rowId)}
      sx={{ minHeight: 112, bgcolor: "background.default" }}
    >
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <Box
              draggable
              onDragStart={(event) => onRowDragStart(event, rowId)}
              sx={{ display: "flex", cursor: "grab" }}
            >
              <DragIndicatorRounded fontSize="small" color="disabled" />
            </Box>
            <Typography variant="overline" color="primary">
              Hàng {rowNumber}
            </Typography>
          </Stack>
          <Tooltip
            title={
              fields.length
                ? "Chuyển hết chỉ tiêu khỏi hàng trước khi xóa"
                : canDelete
                  ? "Xóa hàng"
                  : "Bảng phải có ít nhất một hàng"
            }
          >
            <span>
              <IconButton
                size="small"
                color="error"
                disabled={deleteDisabled}
                onClick={() => onDelete(rowId)}
              >
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Stack direction="row" sx={{ mt: 0.5, gap: 1, flexWrap: "wrap" }}>
          {fields.map((field) => (
            <Box
              key={field.id}
              draggable
              onDragStart={(event) => onDragStart(event, field.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const fieldId = event.dataTransfer.getData("application/x-kkv-field");
                if (!fieldId || fieldId === field.id) return;
                event.preventDefault();
                event.stopPropagation();
                onMoveField(fieldId, rowId, field.id);
              }}
              sx={{
                p: 1,
                border: 1,
                borderColor: "divider",
                borderRadius: 1.5,
                bgcolor: "background.paper",
                cursor: "grab",
                minWidth: 220,
                flex: "1 1 260px",
              }}
            >
              <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                <DragIndicatorRounded fontSize="small" color="disabled" />
                <Typography variant="body2" sx={{ fontWeight: 750 }}>
                  {field.label}
                  {field.suffix ? ` · ${field.suffix}` : ""}
                </Typography>
              </Stack>

              <Stack direction="row" sx={{ gap: 0.5, mt: 0.75, flexWrap: "wrap" }}>
                {monthlyFieldColumns(state, projectId, field.id).map((column) => (
                  <Chip
                    key={column.id}
                    size="small"
                    variant="outlined"
                    color={field.inputMode === "formula" ? "secondary" : "default"}
                    label={`${column.label} · ${sourceLabel(field).toLocaleLowerCase()}`}
                  />
                ))}
              </Stack>
            </Box>
          ))}

          {!fields.length && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              Thả chỉ tiêu vào đây
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function TwelveMonthPreviewTable({
  state,
  projectId,
  fields,
}: {
  state: KkvState;
  projectId: string;
  fields: ProjectFieldDefinition[];
}) {
  const sortedFields = [...fields].sort(
    (first, second) => first.rowIndex - second.rowIndex || first.sortOrder - second.sortOrder,
  );

  return (
    <Box sx={{ overflow: "auto", height: "100%" }}>
      <Table
        stickyHeader
        size="small"
        sx={{
          minWidth: 2500,
          "& td, & th": { borderRight: 1, borderColor: "divider", whiteSpace: "nowrap" },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 80 }}>Dòng</TableCell>
            <TableCell sx={{ minWidth: 220 }}>Chỉ tiêu</TableCell>
            {state.periods.map((period) => (
              <TableCell key={period.month} align="center" colSpan={state.monthlyColumns.length}>
                {period.label}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell />
            <TableCell />
            {state.periods.flatMap((period) =>
              state.monthlyColumns.map((column) => (
                <TableCell key={`${period.month}-${column.id}`} align="center">
                  {column.label}
                </TableCell>
              )),
            )}
          </TableRow>
        </TableHead>

        <TableBody>
          {sortedFields.map((field) => {
            const allowedCodes = monthlyFieldColumns(state, projectId, field.id).map(
              (column) => column.id,
            );

            return (
              <TableRow key={field.id}>
                <TableCell>{field.rowIndex}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 750 }}>
                    {field.label}
                  </Typography>
                  {field.suffix && (
                    <Typography variant="caption" color="text.secondary">
                      {field.suffix}
                    </Typography>
                  )}
                </TableCell>
                {state.periods.flatMap((period) =>
                  state.monthlyColumns.map((column) => (
                    <TableCell key={`${period.month}-${column.id}`} align="center">
                      {allowedCodes.includes(column.id) ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={field.inputMode === "formula" ? "secondary" : "default"}
                          label={sourceLabel(field)}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )),
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
