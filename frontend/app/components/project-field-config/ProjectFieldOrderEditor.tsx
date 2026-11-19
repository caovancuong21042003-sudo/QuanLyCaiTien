import { useState, type DragEvent } from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import DragIndicatorRounded from "@mui/icons-material/DragIndicatorRounded";
import { buildProjectFieldColumns } from "../../domain/metadata";
import type { ColumnGroupDefinition, SummaryProjectColumnDefinition } from "../../domain/types";

export interface ProjectFieldRootOrderItem {
  kind: "field" | "group";
  id: string;
}

interface ProjectFieldOrderEditorProps {
  fields: SummaryProjectColumnDefinition[];
  groups: ColumnGroupDefinition[];
  onReorderRoot: (items: ProjectFieldRootOrderItem[]) => void;
  onReorderChildren: (groupId: string, fieldIds: string[]) => void;
  onEdit: (field: SummaryProjectColumnDefinition) => void;
}

const rootKey = (item: ProjectFieldRootOrderItem) => `${item.kind}:${item.id}`;

export function ProjectFieldOrderEditor({
  fields,
  groups,
  onReorderRoot,
  onReorderChildren,
  onEdit,
}: ProjectFieldOrderEditorProps) {
  const columns = buildProjectFieldColumns(fields, groups, { includeEmptyGroups: true });
  const [draggedRootKey, setDraggedRootKey] = useState<string | null>(null);
  const [dropRootKey, setDropRootKey] = useState<string | null>(null);
  const [draggedChildId, setDraggedChildId] = useState<string | null>(null);
  const [dropChildId, setDropChildId] = useState<string | null>(null);

  const rootItems = columns.map((column): ProjectFieldRootOrderItem =>
    column.kind === "field"
      ? { kind: "field", id: column.field.id }
      : { kind: "group", id: column.group.id },
  );

  const startDraggingRoot = (event: DragEvent, item: ProjectFieldRootOrderItem) => {
    const key = rootKey(item);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/project-root-item", key);
    setDraggedRootKey(key);
  };

  const dropRoot = (event: DragEvent, target: ProjectFieldRootOrderItem) => {
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData("text/project-root-item") || draggedRootKey;
    const targetKey = rootKey(target);
    setDraggedRootKey(null);
    setDropRootKey(null);
    if (!sourceKey || sourceKey === targetKey) return;

    const reordered = [...rootItems];
    const sourceIndex = reordered.findIndex((item) => rootKey(item) === sourceKey);
    const targetIndex = reordered.findIndex((item) => rootKey(item) === targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, source);
    onReorderRoot(reordered);
  };

  const startDraggingChild = (event: DragEvent, fieldId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/project-child-field-id", fieldId);
    setDraggedChildId(fieldId);
  };

  const dropChild = (
    event: DragEvent,
    groupId: string,
    targetId: string,
    orderedChildren: SummaryProjectColumnDefinition[],
  ) => {
    const sourceId = event.dataTransfer.getData("text/project-child-field-id") || draggedChildId;
    // Nếu đang kéo một mục cấp cha, để sự kiện nổi lên vùng thả của nhóm.
    if (!sourceId) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedChildId(null);
    setDropChildId(null);
    if (sourceId === targetId) return;

    const reorderedIds = orderedChildren.map((field) => field.id);
    const sourceIndex = reorderedIds.indexOf(sourceId);
    const targetIndex = reorderedIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    reorderedIds.splice(sourceIndex, 1);
    reorderedIds.splice(targetIndex, 0, sourceId);
    onReorderChildren(groupId, reorderedIds);
  };

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
        Thứ tự cột thông tin tổng hợp
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
        Kéo nhóm cha hoặc cột độc lập để đổi thứ tự. Trong mỗi nhóm, kéo riêng các cột con để sắp
        xếp từ trái sang phải.
      </Typography>

      <Stack spacing={1}>
        {columns.map((column, rootIndex) => {
          const item: ProjectFieldRootOrderItem =
            column.kind === "field"
              ? { kind: "field", id: column.field.id }
              : { kind: "group", id: column.group.id };
          const key = rootKey(item);

          if (column.kind === "field") {
            return (
              <Box
                key={key}
                draggable
                onDragStart={(event) => startDraggingRoot(event, item)}
                onDragEnd={() => {
                  setDraggedRootKey(null);
                  setDropRootKey(null);
                }}
                onDragOver={(event) => {
                  if (!draggedRootKey) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropRootKey(key);
                }}
                onDragLeave={() => setDropRootKey((current) => (current === key ? null : current))}
                onDrop={(event) => dropRoot(event, item)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: 1,
                  border: 1,
                  borderColor: dropRootKey === key ? "primary.main" : "divider",
                  borderRadius: 1.5,
                  bgcolor: draggedRootKey === key ? "action.selected" : "background.paper",
                  opacity: draggedRootKey === key ? 0.65 : 1,
                  cursor: "grab",
                }}
              >
                <DragIndicatorRounded color="disabled" />
                <Chip size="small" label={rootIndex + 1} sx={{ minWidth: 36 }} />
                <Chip size="small" variant="outlined" label="Cột độc lập" />
                <Button
                  color="inherit"
                  onClick={() => onEdit(column.field)}
                  sx={{ justifyContent: "flex-start", textAlign: "left" }}
                >
                  {column.field.label}
                </Button>
              </Box>
            );
          }

          return (
            <Box
              key={key}
              onDragOver={(event) => {
                if (!draggedRootKey) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropRootKey(key);
              }}
              onDragLeave={() => setDropRootKey((current) => (current === key ? null : current))}
              onDrop={(event) => dropRoot(event, item)}
              sx={{
                border: 1,
                borderColor: dropRootKey === key ? "primary.main" : "divider",
                borderRadius: 1.5,
                overflow: "hidden",
                bgcolor: "background.paper",
              }}
            >
              <Box
                draggable
                onDragStart={(event) => startDraggingRoot(event, item)}
                onDragEnd={() => {
                  setDraggedRootKey(null);
                  setDropRootKey(null);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: 1,
                  bgcolor: draggedRootKey === key ? "action.selected" : "action.hover",
                  opacity: draggedRootKey === key ? 0.65 : 1,
                  cursor: "grab",
                }}
              >
                <DragIndicatorRounded color="disabled" />
                <Chip size="small" label={rootIndex + 1} sx={{ minWidth: 36 }} />
                <Chip size="small" color="primary" label="Nhóm cha" />
                <Typography variant="body2" sx={{ fontWeight: 750 }}>
                  {column.group.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {column.children.length} cột con
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: "auto", fontFamily: "monospace" }}
                >
                  {column.group.code}
                </Typography>
              </Box>

              <Stack spacing={0.75} sx={{ p: 1, pl: 4.5 }}>
                {column.children.map((field, childIndex) => (
                  <Box
                    key={field.id}
                    draggable
                    onDragStart={(event) => startDraggingChild(event, field.id)}
                    onDragEnd={(event) => {
                      event.stopPropagation();
                      setDraggedChildId(null);
                      setDropChildId(null);
                    }}
                    onDragOver={(event) => {
                      if (!draggedChildId) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      setDropChildId(field.id);
                    }}
                    onDragLeave={(event) => {
                      event.stopPropagation();
                      setDropChildId((current) => (current === field.id ? null : current));
                    }}
                    onDrop={(event) => dropChild(event, column.group.id, field.id, column.children)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 1,
                      py: 0.75,
                      border: 1,
                      borderColor: dropChildId === field.id ? "primary.main" : "divider",
                      borderRadius: 1,
                      bgcolor: draggedChildId === field.id ? "action.selected" : "background.paper",
                      opacity: draggedChildId === field.id ? 0.65 : 1,
                      cursor: "grab",
                    }}
                  >
                    <DragIndicatorRounded color="disabled" fontSize="small" />
                    <Chip size="small" label={`${rootIndex + 1}.${childIndex + 1}`} />
                    <Button
                      color="inherit"
                      onClick={() => onEdit(field)}
                      sx={{ justifyContent: "flex-start", textAlign: "left" }}
                    >
                      {field.label}
                    </Button>
                  </Box>
                ))}
                {!column.children.length && (
                  <Typography variant="caption" color="text.secondary">
                    Nhóm này chưa có cột con.
                  </Typography>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
