import { useState, type MouseEvent } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { ChartDataSet } from "../../domain/chart-data";
import type { ChartDefinition } from "../../domain/types";

interface PieChartProps {
  definition: ChartDefinition;
  data: ChartDataSet;
}

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  startAngle: number;
  endAngle: number;
}

interface HoverSlice extends Slice {
  x: number;
  y: number;
  percent: number;
}

const sliceColors = [
  "#135D66",
  "#E97836",
  "#2E7D32",
  "#7B1FA2",
  "#0277BD",
  "#C62828",
  "#6D8B2D",
  "#AD6C22",
  "#546E7A",
  "#9C5A8F",
  "#00897B",
  "#5E35B1",
];

function fullNumber(value: number, prefix?: string, suffix?: string) {
  const formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(value);
  const prefixed = prefix ? `${prefix}${formatted}` : formatted;
  return suffix ? `${prefixed}${suffix === "%" ? "" : " "}${suffix}` : prefixed;
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function slicePath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const safeEnd = endAngle - startAngle >= Math.PI * 2 ? endAngle - 0.0001 : endAngle;
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, safeEnd);
  const largeArc = safeEnd - startAngle > Math.PI ? 1 : 0;
  if (innerRadius <= 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      "Z",
    ].join(" ");
  }
  const innerEnd = polarPoint(cx, cy, innerRadius, safeEnd);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function buildSlices(definition: ChartDefinition, data: ChartDataSet) {
  const series = data.series[0];
  if (!series) return { slices: [] as Slice[], total: 0, prefix: undefined, suffix: undefined };
  const items = data.categories
    .map((category, index) => ({
      key: category.key,
      label: category.label,
      value: series.values[index],
    }))
    .filter((item): item is { key: string; label: string; value: number } =>
      Boolean(item.value != null && item.value > 0),
    )
    .sort((left, right) => right.value - left.value);
  const topN = Math.max(2, Math.min(20, definition.topN ?? 8));
  const visible = items.slice(0, topN);
  const remainder = items.slice(topN);
  if (definition.groupRemainder !== false && remainder.length) {
    visible.push({
      key: "remainder",
      label: `Khác (${remainder.length} dự án)`,
      value: remainder.reduce((sum, item) => sum + item.value, 0),
    });
  }
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = -Math.PI / 2;
  const slices = visible.map((item, index) => {
    const angle = total > 0 ? (item.value / total) * Math.PI * 2 : 0;
    const slice = {
      ...item,
      color: sliceColors[index % sliceColors.length],
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
    };
    currentAngle += angle;
    return slice;
  });
  return { slices, total, prefix: series.prefix, suffix: series.suffix };
}

export function PieChart({ definition, data }: PieChartProps) {
  const [hover, setHover] = useState<HoverSlice | null>(null);
  const { slices, total, prefix, suffix } = buildSlices(definition, data);
  const width = 1000;
  const height = 430;
  const center = { x: 315, y: 210 };
  const outerRadius = 155;
  const innerRadius = definition.presentation === "donut" ? 91 : 0;
  const gap = slices.length > 1 ? 0.012 : 0;

  const showHover = (event: MouseEvent<SVGPathElement>, slice: Slice) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    setHover({
      ...slice,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      percent: total ? (slice.value / total) * 100 : 0,
    });
  };

  return (
    <Box sx={{ position: "relative", width: "100%" }} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={definition.name}
        style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
      >
        {slices.map((slice) => {
          const active = hover?.key === slice.key;
          const path = slicePath(
            center.x,
            center.y,
            outerRadius,
            innerRadius,
            slice.startAngle + gap,
            slice.endAngle - gap,
          );
          return (
            <path
              key={slice.key}
              d={path}
              fill={slice.color}
              stroke="#FFFFFF"
              strokeWidth="2"
              opacity={hover && !active ? 0.52 : 0.96}
              style={{
                cursor: "pointer",
                transition: "opacity 120ms ease",
              }}
              onMouseEnter={(event) => showHover(event, slice)}
              onMouseMove={(event) => showHover(event, slice)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {definition.presentation === "donut" && total > 0 && (
          <g>
            <text x={center.x} y={center.y - 8} textAnchor="middle" fontSize="14" fill="#617379">
              Tổng hiệu quả
            </text>
            <text
              x={center.x}
              y={center.y + 22}
              textAnchor="middle"
              fontSize="23"
              fontWeight="800"
              fill="#172B30"
            >
              {fullNumber(total, prefix, suffix)}
            </text>
          </g>
        )}

        {slices.map((slice, index) => {
          const percent = total ? (slice.value / total) * 100 : 0;
          const y = 52 + index * 38;
          return (
            <g key={`legend-${slice.key}`}>
              <rect x="545" y={y - 10} width="13" height="13" rx="3" fill={slice.color} />
              <text x="570" y={y} fontSize="13" fontWeight="650" fill="#263D42">
                {slice.label.length > 28 ? `${slice.label.slice(0, 26)}…` : slice.label}
                <title>{slice.label}</title>
              </text>
              <text x="930" y={y} textAnchor="end" fontSize="13" fontWeight="750" fill="#263D42">
                {percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
              </text>
              <text x="930" y={y + 16} textAnchor="end" fontSize="11" fill="#617379">
                {fullNumber(slice.value, prefix, suffix)}
              </text>
            </g>
          );
        })}

        {!slices.length && (
          <text x="500" y="215" textAnchor="middle" fontSize="16" fill="#617379">
            Biểu đồ tròn chỉ hiển thị các giá trị lớn hơn 0
          </text>
        )}
      </svg>

      {hover && (
        <Paper
          elevation={8}
          sx={{
            position: "absolute",
            left: hover.x,
            top: hover.y,
            transform: "translate(-50%, calc(-100% - 14px))",
            px: 1.5,
            py: 1.25,
            minWidth: 210,
            pointerEvents: "none",
            border: 1,
            borderColor: "divider",
            zIndex: 4,
          }}
        >
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: hover.color }} />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {hover.label}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2, mt: 0.75 }}>
            <Typography variant="caption" color="text.secondary">
              Giá trị
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800 }}>
              {fullNumber(hover.value, prefix, suffix)}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Tỷ trọng
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800 }}>
              {hover.percent.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%
            </Typography>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
