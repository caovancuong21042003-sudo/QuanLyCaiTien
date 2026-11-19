import { useCallback, useEffect, useRef } from "react";
import { Box, Button, Divider, IconButton, Paper, Tooltip } from "@mui/material";
import FormatBoldRounded from "@mui/icons-material/FormatBoldRounded";
import FormatItalicRounded from "@mui/icons-material/FormatItalicRounded";
import FormatStrikethroughRounded from "@mui/icons-material/FormatStrikethroughRounded";
import FormatListBulletedRounded from "@mui/icons-material/FormatListBulletedRounded";
import FormatListNumberedRounded from "@mui/icons-material/FormatListNumberedRounded";
import FormatQuoteRounded from "@mui/icons-material/FormatQuoteRounded";
import HorizontalRuleRounded from "@mui/icons-material/HorizontalRuleRounded";
import FormatClearRounded from "@mui/icons-material/FormatClearRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
import RedoRounded from "@mui/icons-material/RedoRounded";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export function RichTextEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const editingRef = useRef(false);
  onChangeRef.current = onChange;
  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onChangeRef.current(pending);
  }, []);
  const scheduleChange = useCallback(
    (nextValue: Record<string, unknown>) => {
      pendingRef.current = nextValue;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 500);
    },
    [flush],
  );
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => scheduleChange(current.getJSON()),
  });
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);
  useEffect(() => {
    if (!editor) return;
    const startEditing = () => {
      editingRef.current = true;
    };
    const stopEditing = () => {
      editingRef.current = false;
      flush();
    };
    editor.on("focus", startEditing);
    editor.on("blur", stopEditing);
    return () => {
      editor.off("focus", startEditing);
      editor.off("blur", stopEditing);
      flush();
    };
  }, [editor, flush]);
  useEffect(() => {
    // Tiptap chỉ coi `content` là dữ liệu khởi tạo nên phải đồng bộ khi đổi project.
    // Bỏ qua JSON giống nhau để không làm nhảy con trỏ sau mỗi lần người dùng gõ.
    if (
      !editor ||
      editingRef.current ||
      pendingRef.current ||
      JSON.stringify(editor.getJSON()) === JSON.stringify(value)
    )
      return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return null;
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      {!readOnly && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 0.5,
            p: 0.5,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "grey.50",
          }}
        >
          <Button
            size="small"
            variant={editor.isActive("paragraph") ? "contained" : "text"}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            P
          </Button>
          <Button
            size="small"
            variant={editor.isActive("heading", { level: 2 }) ? "contained" : "text"}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </Button>
          <Button
            size="small"
            variant={editor.isActive("heading", { level: 3 }) ? "contained" : "text"}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </Button>
          <Divider orientation="vertical" flexItem />
          <Tooltip title="In đậm">
            <IconButton
              size="small"
              color={editor.isActive("bold") ? "primary" : "default"}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <FormatBoldRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="In nghiêng">
            <IconButton
              size="small"
              color={editor.isActive("italic") ? "primary" : "default"}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <FormatItalicRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Gạch ngang">
            <IconButton
              size="small"
              color={editor.isActive("strike") ? "primary" : "default"}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <FormatStrikethroughRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem />
          <Tooltip title="Danh sách dấu chấm">
            <IconButton
              size="small"
              color={editor.isActive("bulletList") ? "primary" : "default"}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <FormatListBulletedRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Danh sách đánh số">
            <IconButton
              size="small"
              color={editor.isActive("orderedList") ? "primary" : "default"}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <FormatListNumberedRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Trích dẫn">
            <IconButton
              size="small"
              color={editor.isActive("blockquote") ? "primary" : "default"}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <FormatQuoteRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Đường phân cách">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <HorizontalRuleRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem />
          <Tooltip title="Xóa định dạng">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            >
              <FormatClearRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Hoàn tác">
            <span>
              <IconButton
                size="small"
                disabled={!editor.can().undo()}
                onClick={() => editor.chain().focus().undo().run()}
              >
                <UndoRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Làm lại">
            <span>
              <IconButton
                size="small"
                disabled={!editor.can().redo()}
                onClick={() => editor.chain().focus().redo().run()}
              >
                <RedoRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          minHeight: 120,
          "& .tiptap": { outline: 0, minHeight: 94 },
          "& p": { my: 0.5 },
          "& h2": { fontSize: "1.3rem", mt: 1.25, mb: 0.5 },
          "& h3": { fontSize: "1.1rem", mt: 1, mb: 0.5 },
          "& ul, & ol": { my: 0.5, pl: 3 },
          "& blockquote": {
            my: 1,
            pl: 1.5,
            borderLeft: 3,
            borderColor: "primary.light",
            color: "text.secondary",
          },
          "& hr": { my: 1.5, border: 0, borderTop: 1, borderColor: "divider" },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Paper>
  );
}
