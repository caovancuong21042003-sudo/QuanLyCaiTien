import { forwardRef, useEffect, useImperativeHandle } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { Extension, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import type { DisplayToken } from "../../formula/ast-utils";
import { formulaFunctionNames } from "../../formula/function-catalog";

const functionNames = new Set(formulaFunctionNames());

const ParenthesisHighlight = Extension.create({
  name: "parenthesisHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const brackets: Array<{ character: "(" | ")"; position: number }> = [];
            let insideString = false;
            state.doc.descendants((node, position) => {
              if (!node.isText || !node.text) return;
              [...node.text].forEach((character, index) => {
                if (character === '"') {
                  insideString = !insideString;
                  return;
                }
                if (!insideString && (character === "(" || character === ")"))
                  brackets.push({ character, position: position + index });
              });
            });

            const pairs = new Map<number, number>();
            const openings: number[] = [];
            const unmatched = new Set<number>();
            for (const bracket of brackets) {
              if (bracket.character === "(") openings.push(bracket.position);
              else {
                const opening = openings.pop();
                if (opening == null) unmatched.add(bracket.position);
                else {
                  pairs.set(opening, bracket.position);
                  pairs.set(bracket.position, opening);
                }
              }
            }
            openings.forEach((position) => unmatched.add(position));

            const cursor = state.selection.from;
            const selectedBracket = brackets.find(
              (bracket) => bracket.position === cursor - 1 || bracket.position === cursor,
            );
            const matchingPosition = selectedBracket
              ? pairs.get(selectedBracket.position)
              : undefined;
            const decorations = brackets.flatMap((bracket) => {
              if (unmatched.has(bracket.position))
                return [
                  Decoration.inline(bracket.position, bracket.position + 1, {
                    class: "formula-parenthesis-error",
                  }),
                ];
              if (
                selectedBracket &&
                (bracket.position === selectedBracket.position ||
                  bracket.position === matchingPosition)
              )
                return [
                  Decoration.inline(bracket.position, bracket.position + 1, {
                    class: "formula-parenthesis-match",
                  }),
                ];
              return [];
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const FormulaReference = Node.create({
  name: "formulaReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      fieldId: { default: "" },
      columnId: { default: "" },
      period: { default: "" },
      projectScope: { default: "" },
      rawReference: { default: "" },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-formula-reference]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-formula-reference": "true",
        class: "formula-reference",
        title: HTMLAttributes.label,
      }),
      HTMLAttributes.label,
    ];
  },
});

export interface FormulaReferenceInput {
  fieldId: string;
  columnId?: string;
  period?: string;
  projectScope?: "all" | "filtered";
  rawReference?: string;
  label: string;
}

export interface FormulaEditorHandle {
  insertReference(reference: FormulaReferenceInput): void;
  insertText(value: string): void;
  insertFunction(name: string): void;
  appendClosingParentheses(count: number): void;
  focus(): void;
}

interface FormulaExpressionEditorProps {
  tokens: DisplayToken[];
  revision: number;
  onChange: (value: { internal: string; business: string }) => void;
}

export function tokenContent(tokens: DisplayToken[]) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: tokens.flatMap((token, index) => {
          const fieldMatch = token.raw.match(
            /^\[ref:([^|\]]+)(?:\|([^|\]]*)\|([^|\]]*)(?:\|([^\]]*))?)?\]$/,
          );
          const metricMatch = token.raw.match(/^\[metric:([^\]]+)\]$/);
          const summaryMatch = token.raw.match(/^\[summary:([^\]]+)\]$/);
          const spacer = index ? [{ type: "text", text: " " }] : [];
          if (!fieldMatch && !metricMatch && !summaryMatch)
            return [...spacer, { type: "text", text: token.raw }];
          const metricParts = metricMatch?.[1].split("|") ?? [];
          return [
            ...spacer,
            {
              type: "formulaReference",
              attrs: {
                fieldId: fieldMatch?.[1] ?? metricParts[0] ?? "",
                columnId: fieldMatch?.[2] ?? metricParts[1] ?? "",
                period: fieldMatch?.[3] ?? metricParts[2] ?? "",
                projectScope: fieldMatch?.[4] ?? metricParts[3] ?? "",
                rawReference: metricMatch?.[1]
                  ? `metric:${metricMatch[1]}`
                  : summaryMatch?.[1]
                    ? `summary:${summaryMatch[1]}`
                    : "",
                label: token.label,
              },
            },
          ];
        }),
      },
    ],
  };
}

function expressionFromJson(json: JSONContent) {
  const internal: string[] = [];
  const business: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "text" && node.text) {
      internal.push(node.text);
      business.push(node.text);
    }
    if (node.type === "formulaReference") {
      const attrs = node.attrs as Record<string, string>;
      if (attrs.rawReference) internal.push(`[${attrs.rawReference}]`);
      else
        internal.push(
          attrs.columnId || attrs.period || attrs.projectScope
            ? `[ref:${attrs.fieldId}|${attrs.columnId || ""}|${attrs.period || "current"}${
                attrs.projectScope === "all" || attrs.projectScope === "filtered"
                  ? `|${attrs.projectScope}`
                  : ""
              }]`
            : `[ref:${attrs.fieldId}]`,
        );
      business.push(attrs.label);
    }
    node.content?.forEach(visit);
  };
  visit(json);
  return { internal: internal.join("").trim(), business: business.join("").trim() };
}

export const FormulaExpressionEditor = forwardRef<
  FormulaEditorHandle,
  FormulaExpressionEditorProps
>(function FormulaExpressionEditor({ tokens, revision, onChange }, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      FormulaReference,
      ParenthesisHighlight,
    ],
    content: tokenContent(tokens),
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": "Biểu thức công thức", spellcheck: "false" },
      handleKeyDown(view, event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return false;
        const { from, to, empty } = view.state.selection;

        if (
          (event.key === " " || event.key === "Tab") &&
          empty &&
          view.state.selection.$from.parent.isTextblock
        ) {
          // Chỉ mở rộng tên hàm sau Space/Tab để không biến tiền tố `ROUND` thành ROUND()
          // trong lúc người dùng vẫn đang gõ ROUNDUP hoặc ROUNDDOWN.
          const textBefore = view.state.selection.$from.parent.textBetween(
            0,
            view.state.selection.$from.parentOffset,
            undefined,
            "\ufffc",
          );
          const match = textBefore.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
          const functionName = match?.[1].toUpperCase();
          if (functionName && functionNames.has(functionName)) {
            const start = from - match![1].length;
            let transaction = view.state.tr.insertText(`${functionName}()`, start, from);
            transaction = transaction.setSelection(
              TextSelection.create(transaction.doc, start + functionName.length + 1),
            );
            view.dispatch(transaction.scrollIntoView());
            return true;
          }
        }

        if (event.key === "(") {
          // Hoạt động giống code editor: tạo cặp ngoặc rỗng hoặc bọc phần đang được chọn.
          let transaction = view.state.tr;
          if (empty) {
            transaction = transaction.insertText("()", from, to);
            transaction = transaction.setSelection(TextSelection.create(transaction.doc, from + 1));
          } else {
            transaction = transaction.insertText(")", to).insertText("(", from);
            transaction = transaction.setSelection(
              TextSelection.create(transaction.doc, from + 1, to + 1),
            );
          }
          view.dispatch(transaction.scrollIntoView());
          return true;
        }

        if (event.key === ")" && empty && view.state.doc.textBetween(from, from + 1) === ")") {
          // Đi qua dấu ngoặc đóng đã được tự chèn thay vì tạo thêm một dấu trùng.
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.create(view.state.doc, from + 1))
              .scrollIntoView(),
          );
          return true;
        }

        if (
          event.key === "Backspace" &&
          empty &&
          from > 1 &&
          view.state.doc.textBetween(from - 1, from) === "(" &&
          view.state.doc.textBetween(from, from + 1) === ")"
        ) {
          // Khi cặp ngoặc vẫn rỗng, xóa ngoặc mở sẽ xóa luôn ngoặc đóng được tạo tự động.
          view.dispatch(view.state.tr.delete(from - 1, from + 1).scrollIntoView());
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: current }) => onChange(expressionFromJson(current.getJSON())),
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(tokenContent(tokens));
    onChange(expressionFromJson(editor.getJSON()));
  }, [editor, revision]);

  useImperativeHandle(
    ref,
    () => ({
      insertReference(reference) {
        editor
          ?.chain()
          .focus()
          .insertContent([
            {
              type: "formulaReference",
              attrs: {
                fieldId: reference.fieldId,
                columnId: reference.columnId ?? "",
                period: reference.period ?? "",
                projectScope: reference.projectScope ?? "",
                rawReference: reference.rawReference ?? "",
                label: reference.label,
              },
            },
            { type: "text", text: " " },
          ])
          .run();
      },
      insertText(value) {
        editor?.chain().focus().insertContent(value).run();
      },
      insertFunction(name) {
        if (!editor) return;
        const { from, to, empty } = editor.state.selection;
        const opening = `${name}(`;
        let transaction = editor.state.tr;
        // Nếu có vùng chọn thì nút hàm sẽ bọc vùng đó; nếu không, con trỏ nằm giữa `name()`.
        if (empty) {
          transaction = transaction.insertText(`${opening})`, from, to);
          transaction = transaction.setSelection(
            TextSelection.create(transaction.doc, from + opening.length),
          );
        } else {
          transaction = transaction.insertText(")", to).insertText(opening, from);
          transaction = transaction.setSelection(
            TextSelection.create(transaction.doc, from + opening.length, to + opening.length),
          );
        }
        editor.view.dispatch(transaction.scrollIntoView());
        editor.commands.focus();
      },
      appendClosingParentheses(count) {
        if (!editor || count <= 0) return;
        const end = editor.state.doc.content.size - 1;
        editor.view.dispatch(editor.state.tr.insertText(")".repeat(count), end).scrollIntoView());
      },
      focus() {
        editor?.chain().focus().run();
      },
    }),
    [editor],
  );

  return (
    <Paper variant="outlined" sx={{ mt: 1.5, bgcolor: "#F7FAFA", overflow: "hidden" }}>
      <Box sx={{ px: 1.75, py: 1, borderBottom: 1, borderColor: "divider", bgcolor: "#EDF4F4" }}>
        <Typography variant="caption" color="text.secondary">
          Gõ dấu ( để tự đóng ngoặc; hoặc gõ đúng tên hàm rồi nhấn phím cách hoặc Tab. Chọn hàm sẽ
          chèn đủ ().
        </Typography>
      </Box>
      <Box
        sx={{
          p: 1.75,
          minHeight: 116,
          cursor: "text",
          overflowX: "auto",
          "& .tiptap": {
            minHeight: 82,
            outline: 0,
            fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
            fontSize: "1rem",
            lineHeight: 2.25,
          },
          "& .tiptap p": { m: 0 },
          "& .formula-reference": {
            display: "inline-block",
            maxWidth: "100%",
            px: 1,
            py: 0.1,
            mx: 0.25,
            border: 1,
            borderColor: "primary.main",
            borderRadius: 5,
            bgcolor: "white",
            color: "primary.dark",
            fontFamily: "Inter, sans-serif",
            fontWeight: 650,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            verticalAlign: "middle",
          },
          "& .ProseMirror-selectednode": { outline: "2px solid", outlineColor: "secondary.main" },
          "& .formula-parenthesis-match": {
            bgcolor: "secondary.light",
            color: "secondary.contrastText",
            borderRadius: 0.5,
          },
          "& .formula-parenthesis-error": {
            bgcolor: "error.light",
            color: "error.contrastText",
            textDecoration: "underline wavy",
            textDecorationColor: "error.main",
          },
        }}
        onClick={() => editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </Box>
    </Paper>
  );
});
