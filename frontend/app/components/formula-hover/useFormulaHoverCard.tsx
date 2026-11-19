import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Box, Divider, Paper, Popper, Stack, Typography } from "@mui/material";
import type { CalculationResult, TraceEntry } from "../../domain/calculation-result";
import type { KkvState, NumericValue, ProjectFieldDefinition } from "../../domain/types";
import {
  effectiveProjectField,
  fieldDefinitionForProject,
  formatFieldValue,
  numericValueNotes,
} from "../../domain/metadata";

export interface FormulaHoverValue {
  key: string;
  label: string;
  context?: string;
  value: string;
}

export interface FormulaHoverContent {
  formula: string;
  inputs?: FormulaHoverValue[];
  result?: string;
}

type FormulaHoverSource = string | FormulaHoverContent | (() => FormulaHoverContent | undefined);

interface HoveredFormula {
  anchor: HTMLElement;
  content: FormulaHoverContent;
}

interface FormulaHoverCardHandle {
  schedule: (
    anchor: HTMLElement,
    content: FormulaHoverContent | (() => FormulaHoverContent | undefined),
  ) => void;
  hide: () => void;
  scheduleHide: () => void;
  suppressUntilPointerUp: () => void;
}

interface BuildFormulaHoverContentOptions {
  formula?: string;
  result?: CalculationResult;
  state: KkvState;
  projectId?: string;
  resultField?: ProjectFieldDefinition;
}

const HOVER_DELAY_MS = 350;
const HIDE_DELAY_MS = 200;

function fieldForProject(
  state: KkvState,
  field: ProjectFieldDefinition,
  projectId?: string,
): ProjectFieldDefinition {
  if (!projectId) return field;
  if (field.scope === "project") return effectiveProjectField(state, projectId, field);
  if (field.scope !== "monthly") return field;
  const config = state.projectMonthlyFieldConfigs.find(
    (item) => item.projectId === projectId && item.fieldId === field.id,
  );
  return config
    ? {
        ...field,
        label: config.displayLabel || field.label,
        suffix: config.displaySuffix || field.suffix,
      }
    : field;
}

function notesForProjectField(
  state: KkvState,
  field: ProjectFieldDefinition,
  projectId?: string,
): Pick<NumericValue, "leftNote" | "rightNote"> | undefined {
  if (!projectId || field.scope !== "project") return undefined;
  const stored = state.fieldValues.find(
    (item) => item.projectId === projectId && item.fieldId === field.id,
  )?.value;
  return numericValueNotes(stored);
}

function formulaValue(
  value: unknown,
  field: ProjectFieldDefinition,
  notes?: Pick<NumericValue, "leftNote" | "rightNote">,
) {
  return formatFieldValue(
    value,
    {
      ...field,
      // Hover hiển thị giá trị dùng để tính tiếp, không ép theo mức làm tròn của ô trên bảng.
      displayPrecision: Math.max(field.displayPrecision ?? 4, 4),
    },
    notes,
  );
}

function traceValue(
  entry: TraceEntry,
  state: KkvState,
  fallbackProjectId?: string,
  showProject: boolean = false,
): FormulaHoverValue | null {
  const projectId = entry.projectId ?? fallbackProjectId;
  const baseField = projectId
    ? fieldDefinitionForProject(state, projectId, entry.fieldId)
    : state.fieldDefinitions.find((field) => field.id === entry.fieldId);
  if (!baseField) return null;
  const field = fieldForProject(state, baseField, projectId);
  const project = state.projects.find((item) => item.id === projectId);
  const column = state.monthlyColumns.find((item) => item.id === entry.columnId);
  const context = [
    showProject ? project?.code : undefined,
    column?.label,
    entry.month ? `T${entry.month}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    key: `${projectId ?? "shared"}|${entry.fieldId}|${entry.columnId ?? "project"}|${entry.month ?? 0}`,
    label: field.label,
    context: context || undefined,
    value: formulaValue(entry.value, field, notesForProjectField(state, field, projectId)),
  };
}

export function buildFormulaHoverContent({
  formula,
  result,
  state,
  projectId,
  resultField,
}: BuildFormulaHoverContentOptions): FormulaHoverContent | undefined {
  if (!formula) return undefined;
  if (!result || !resultField) return { formula };

  const directTrace = result.trace.filter((entry) => entry.referenceDepth === 0);
  const traceProjectIds = new Set(directTrace.map((entry) => entry.projectId).filter(Boolean));
  const seen = new Set<string>();
  const inputs = directTrace
    .map((entry) => traceValue(entry, state, projectId, traceProjectIds.size > 1))
    .filter((item): item is FormulaHoverValue => Boolean(item))
    .filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
  const decoratedResultField = fieldForProject(state, resultField, projectId);
  const resultValue = result.value.kind === "scalar" ? result.value.value : null;

  return {
    formula,
    inputs,
    result:
      result.state === "Error"
        ? "Lỗi công thức"
        : formulaValue(
            resultValue,
            decoratedResultField,
            notesForProjectField(state, decoratedResultField, projectId),
          ),
  };
}

const FormulaHoverCard = forwardRef<FormulaHoverCardHandle>(function FormulaHoverCard(_, ref) {
  const [hovered, setHovered] = useState<HoveredFormula | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownRef = useRef(false);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setHovered((current) => (current ? null : current));
  }, [clearCloseTimer, clearOpenTimer]);

  const scheduleHide = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHovered((current) => (current ? null : current));
    }, HIDE_DELAY_MS);
  }, [clearCloseTimer, clearOpenTimer]);

  useImperativeHandle(
    ref,
    () => ({
      schedule: (anchor, content) => {
        clearOpenTimer();
        clearCloseTimer();
        if (pointerDownRef.current) return;
        openTimerRef.current = setTimeout(() => {
          openTimerRef.current = null;
          if (pointerDownRef.current) return;
          const resolved = typeof content === "function" ? content() : content;
          if (resolved) setHovered({ anchor, content: resolved });
        }, HOVER_DELAY_MS);
      },
      hide,
      scheduleHide,
      suppressUntilPointerUp: () => {
        pointerDownRef.current = true;
        hide();
      },
    }),
    [clearCloseTimer, clearOpenTimer, hide, scheduleHide],
  );

  useEffect(() => {
    // Kéo bảng được ưu tiên hơn hover; chỉ cho phép hover lại sau khi đã thả chuột.
    const releasePointer = () => {
      pointerDownRef.current = false;
    };
    window.addEventListener("pointerup", releasePointer, true);
    window.addEventListener("pointercancel", releasePointer, true);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      clearOpenTimer();
      clearCloseTimer();
      window.removeEventListener("pointerup", releasePointer, true);
      window.removeEventListener("pointercancel", releasePointer, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [clearCloseTimer, clearOpenTimer, hide]);

  return (
    <Popper
      open={Boolean(hovered)}
      anchorEl={hovered?.anchor}
      placement="top"
      modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
      sx={{ zIndex: 1500, pointerEvents: "none" }}
    >
      <Paper
        elevation={8}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleHide}
        sx={{
          width: 500,
          maxWidth: "calc(100vw - 24px)",
          maxHeight: 420,
          overflow: "auto",
          pointerEvents: "auto",
          px: 1.5,
          py: 1.25,
          border: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.35 }}>
          CÔNG THỨC
        </Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
          {hovered?.content.formula}
        </Typography>

        {Boolean(hovered?.content.inputs?.length) && (
          <Box sx={{ mt: 1.25 }}>
            <Typography variant="caption" color="text.secondary">
              DỮ LIỆU THAM GIA
            </Typography>
            <Stack spacing={0.65} sx={{ mt: 0.5 }}>
              {hovered?.content.inputs?.map((input) => (
                <Stack
                  key={input.key}
                  direction="row"
                  sx={{ justifyContent: "space-between", gap: 2, alignItems: "baseline" }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2">{input.label}</Typography>
                    {input.context && (
                      <Typography variant="caption" color="text.secondary">
                        {input.context}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                    {input.value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {hovered?.content.result !== undefined && (
          <>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Kết quả
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {hovered.content.result}
              </Typography>
            </Stack>
          </>
        )}
      </Paper>
    </Popper>
  );
});

export function useFormulaHoverCard() {
  const cardRef = useRef<FormulaHoverCardHandle>(null);

  const formulaHoverProps = useCallback((value?: FormulaHoverSource) => {
    const content = typeof value === "string" ? { formula: value } : value;
    return content
      ? {
          onMouseEnter: (event: MouseEvent<HTMLElement>) => {
            if (event.buttons !== 0) {
              cardRef.current?.hide();
              return;
            }
            cardRef.current?.schedule(event.currentTarget, content);
          },
          onMouseLeave: () => cardRef.current?.scheduleHide(),
          onPointerDown: (_event: PointerEvent<HTMLElement>) =>
            cardRef.current?.suppressUntilPointerUp(),
        }
      : {};
  }, []);

  return {
    formulaHoverProps,
    formulaHoverCard: <FormulaHoverCard ref={cardRef} />,
  };
}
