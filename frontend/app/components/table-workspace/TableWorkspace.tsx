import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import FullscreenRounded from "@mui/icons-material/FullscreenRounded";
import FullscreenExitRounded from "@mui/icons-material/FullscreenExitRounded";
import PanToolAltRounded from "@mui/icons-material/PanToolAltRounded";
import VerticalAlignTopRounded from "@mui/icons-material/VerticalAlignTopRounded";

interface TableWorkspaceProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  height?: number | string;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

export function TableWorkspace({
  title,
  subtitle,
  actions,
  children,
  height = 560,
}: TableWorkspaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!fullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [fullScreen]);

  // Chỉ kéo để cuộn khi bắt đầu từ vùng trống, tránh chiếm thao tác của nút, ô nhập và editor.
  const isInteractive = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, input, textarea, select, a, [role='button'], [contenteditable='true']",
      ),
    );
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      isInteractive(event.target) ||
      !viewportRef.current
    )
      return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewportRef.current) return;
    viewportRef.current.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    viewportRef.current.scrollTop = drag.scrollTop - (event.clientY - drag.y);
  };
  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={
        fullScreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: (theme) => theme.zIndex.modal + 1,
              borderRadius: 0,
              display: "flex",
              flexDirection: "column",
              bgcolor: "background.default",
            }
          : { overflow: "hidden" }
      }
    >
      <Stack
        direction="row"
        sx={{
          minHeight: 52,
          px: 1.5,
          gap: 1,
          alignItems: "center",
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions}
        <Tooltip title="Giữ chuột và kéo để cuộn bảng">
          <PanToolAltRounded
            color="action"
            fontSize="small"
            sx={{ display: { xs: "none", sm: "block" } }}
          />
        </Tooltip>
        <Tooltip title="Về góc trên bên trái">
          <IconButton
            size="small"
            onClick={() => viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" })}
          >
            <VerticalAlignTopRounded />
          </IconButton>
        </Tooltip>
        <Tooltip title={fullScreen ? "Thoát toàn màn hình (Esc)" : "Chỉ xem bảng toàn màn hình"}>
          <IconButton color="primary" onClick={() => setFullScreen((value) => !value)}>
            {fullScreen ? <FullscreenExitRounded /> : <FullscreenRounded />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Box
        ref={viewportRef}
        role="region"
        aria-label={title}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        sx={{
          height: fullScreen ? "calc(100dvh - 53px)" : height,
          overflow: "auto",
          cursor: dragging ? "grabbing" : "grab",
          userSelect: dragging ? "none" : "auto",
          scrollbarWidth: "thin",
          bgcolor: "background.paper",
          "&:focus-visible": { outline: 2, outlineColor: "primary.main", outlineOffset: -2 },
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}
