import { Fragment, type ReactNode } from "react";
import { Box, Tooltip } from "@mui/material";
import { richTextToPlainText } from "../../domain/metadata";

interface RichTextNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: RichTextNode[];
}

function applyMarks(node: RichTextNode, key: string): ReactNode {
  let content: ReactNode = node.text ?? "";
  for (const [index, mark] of (node.marks ?? []).entries()) {
    const markKey = `${key}-mark-${index}`;
    if (mark.type === "bold") content = <strong key={markKey}>{content}</strong>;
    else if (mark.type === "italic") content = <em key={markKey}>{content}</em>;
    else if (mark.type === "strike") content = <s key={markKey}>{content}</s>;
    else if (mark.type === "code") content = <code key={markKey}>{content}</code>;
  }
  return content;
}

function fullNode(node: RichTextNode, key: string): ReactNode {
  if (node.type === "text") return <Fragment key={key}>{applyMarks(node, key)}</Fragment>;
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} />;

  const children = (node.content ?? []).map((child, index) => fullNode(child, `${key}-${index}`));
  if (node.type === "paragraph") return <p key={key}>{children}</p>;
  if (node.type === "heading") {
    return Number(node.attrs?.level) === 2 ? (
      <h2 key={key}>{children}</h2>
    ) : (
      <h3 key={key}>{children}</h3>
    );
  }
  if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
  if (node.type === "orderedList") return <ol key={key}>{children}</ol>;
  if (node.type === "listItem") return <li key={key}>{children}</li>;
  if (node.type === "blockquote") return <blockquote key={key}>{children}</blockquote>;
  if (node.type === "codeBlock") return <pre key={key}>{children}</pre>;
  return <Fragment key={key}>{children}</Fragment>;
}

function joinCompact(nodes: RichTextNode[], key: string, separator = " · "): ReactNode[] {
  const visible = nodes.filter(
    (node) => node.type === "horizontalRule" || richTextToPlainText(node).length > 0,
  );
  return visible.flatMap((node, index) => [
    ...(index ? [<span key={`${key}-separator-${index}`}>{separator}</span>] : []),
    compactNode(node, `${key}-${index}`),
  ]);
}

function compactNode(node: RichTextNode, key: string): ReactNode {
  if (node.type === "text") return <Fragment key={key}>{applyMarks(node, key)}</Fragment>;
  if (node.type === "hardBreak") return <span key={key}> </span>;
  if (node.type === "horizontalRule") return <span key={key}>—</span>;
  if (node.type === "bulletList" || node.type === "orderedList") {
    return (
      <Fragment key={key}>
        {(node.content ?? []).flatMap((child, index) => [
          ...(index ? [<span key={`${key}-list-separator-${index}`}> · </span>] : []),
          <span key={`${key}-prefix-${index}`}>
            {node.type === "bulletList" ? "• " : `${index + 1}. `}
          </span>,
          compactNode(child, `${key}-${index}`),
        ])}
      </Fragment>
    );
  }
  const children = joinCompact(node.content ?? [], `${key}-children`);
  if (node.type === "heading") return <strong key={key}>{children}</strong>;
  if (node.type === "blockquote") return <em key={key}>“{children}”</em>;
  if (node.type === "codeBlock") return <code key={key}>{children}</code>;
  return <Fragment key={key}>{children}</Fragment>;
}

function RichTextContent({ value, compact }: { value: unknown; compact: boolean }) {
  if (typeof value === "string") return <>{value}</>;
  const root = value as RichTextNode;
  if (compact) return <>{compactNode(root, "compact-root")}</>;
  return (
    <Box
      sx={{
        overflowWrap: "anywhere",
        "& p": { my: 0.5 },
        "& p:first-of-type": { mt: 0 },
        "& p:last-of-type": { mb: 0 },
        "& h2": { fontSize: "1.15rem", mt: 1, mb: 0.5 },
        "& h3": { fontSize: "1rem", mt: 0.75, mb: 0.4 },
        "& ul, & ol": { my: 0.5, pl: 2.5 },
        "& blockquote": {
          my: 0.75,
          pl: 1.25,
          borderLeft: 3,
          borderColor: "primary.light",
          color: "text.secondary",
        },
        "& hr": { my: 1, border: 0, borderTop: 1, borderColor: "divider" },
        "& pre": { whiteSpace: "pre-wrap", bgcolor: "grey.100", p: 0.75, borderRadius: 1 },
      }}
    >
      {fullNode(root, "full-root")}
    </Box>
  );
}

export function RichTextDisplay({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const plainText = richTextToPlainText(value);
  if (!plainText) return <>—</>;
  if (!compact) return <RichTextContent value={value} compact={false} />;

  return (
    <Tooltip
      enterDelay={450}
      enterNextDelay={250}
      title={<RichTextContent value={value} compact={false} />}
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: 480,
            maxHeight: 360,
            overflowY: "auto",
            p: 1.5,
            bgcolor: "background.paper",
            color: "text.primary",
            border: 1,
            borderColor: "divider",
            boxShadow: 8,
          },
        },
      }}
    >
      <Box
        component="span"
        aria-label={plainText}
        sx={{
          display: "block",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: "help",
        }}
      >
        <RichTextContent value={value} compact />
      </Box>
    </Tooltip>
  );
}
