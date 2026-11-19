import { useId, useState, type MouseEvent } from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { ChartDataSet, ChartDataSeries } from "../../domain/chart-data";
import type { ChartDefinition } from "../../domain/types";

interface HorizontalBarChartProps {
  definition: ChartDefinition;
  data: ChartDataSet;
}

interface HoverValue {
  key: string;
  x: number;
  y: number;
  category: string;
  series: string;
  value: number;
  prefix?: string;
  suffix?: string;
  color: string;
}

function fullNumber(value: number, prefix?: string, suffix?: string) {
  const formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(value);
  const prefixed = prefix ? `${prefix}${formatted}` : formatted;
  return suffix ? `${prefixed}${suffix === "%" ? "" : " "}${suffix}` : prefixed;
}

function shortNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000)
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000)}tr`;
  if (absolute >= 1_000)
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000)}k`;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}

function chartDomain(data: ChartDataSet, stacked: boolean) {
  const columnSeries = data.series.filter((series) => series.definition.renderer === "column");
  const values = stacked
    ? data.categories.flatMap((_, index) => {
        const items = columnSeries
          .map((series) => series.values[index])
          .filter((value) => value != null);
        return [
          items.reduce((sum, value) => sum + Math.min(0, value), 0),
          items.reduce((sum, value) => sum + Math.max(0, value), 0),
        ];
      })
    : columnSeries
        .flatMap((series) => series.values)
        .filter((value): value is number => value != null);
  if (!values.length) return { min: 0, max: 1 };
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  const padding = (max - min) * 0.08;
  return { min: min - padding, max: max + padding };
}

export function HorizontalBarChart({ definition, data }: HorizontalBarChartProps) {
  const [hover, setHover] = useState<HoverValue | null>(null);
  const idPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const columnSeries = data.series.filter((series) => series.definition.renderer === "column");
  const stacked = (definition.columnMode ?? "grouped") === "stacked";
  const categoryHeight = stacked ? 46 : Math.max(46, columnSeries.length * 25 + 16);
  const margin = { top: 20, right: 115, bottom: 52, left: 220 };
  const width = 1000;
  const height = Math.max(
    300,
    margin.top + margin.bottom + data.categories.length * categoryHeight,
  );
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const domain = chartDomain(data, stacked);
  const xPosition = (value: number) =>
    margin.left + ((value - domain.min) / (domain.max - domain.min)) * plotWidth;
  const zeroX = xPosition(0);
  const ticks = Array.from({ length: 6 }, (_, index) => index / 5);
  const hasValues = columnSeries.some((series) => series.values.some((value) => value != null));

  const showHover = (
    event: MouseEvent<SVGRectElement>,
    series: ChartDataSeries,
    categoryIndex: number,
    value: number,
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    setHover({
      key: `${series.definition.id}-${data.categories[categoryIndex]?.key}`,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      category: data.categories[categoryIndex]?.label ?? "",
      series: series.definition.label,
      value,
      prefix: series.prefix,
      suffix: series.suffix,
      color: value < 0 ? "#C62828" : series.definition.color,
    });
  };

  return (
    <Box>
      <Stack direction="row" sx={{ gap: 1.5, flexWrap: "wrap", mb: 1 }}>
        {columnSeries.map((series) => (
          <Stack
            key={series.definition.id}
            direction="row"
            sx={{ alignItems: "center", gap: 0.75 }}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.75,
                bgcolor: series.definition.color,
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 650 }}>
              {series.definition.label}
              {series.suffix ? ` · ${series.suffix}` : ""}
            </Typography>
            {series.errorCount > 0 && (
              <Chip size="small" color="error" label={`${series.errorCount} lỗi`} />
            )}
          </Stack>
        ))}
      </Stack>

      <Box sx={{ position: "relative", width: "100%" }} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={definition.name}
          style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
        >
          <defs>
            <filter id={`${idPrefix}-bar-shadow`} x="-20%" y="-50%" width="150%" height="200%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.22" />
            </filter>
          </defs>

          {ticks.map((ratio) => {
            const x = margin.left + ratio * plotWidth;
            const value = domain.min + ratio * (domain.max - domain.min);
            return (
              <g key={ratio}>
                <line
                  x1={x}
                  x2={x}
                  y1={margin.top}
                  y2={margin.top + plotHeight}
                  stroke="#DCE5E7"
                  strokeDasharray="4 4"
                />
                <text x={x} y={height - 22} textAnchor="middle" fontSize="12" fill="#617379">
                  {shortNumber(value)}
                </text>
              </g>
            );
          })}
          {domain.min < 0 && domain.max > 0 && (
            <line
              x1={zeroX}
              x2={zeroX}
              y1={margin.top}
              y2={margin.top + plotHeight}
              stroke="#617379"
              strokeWidth="1.5"
            />
          )}

          {data.categories.map((category, categoryIndex) => {
            const centerY = margin.top + categoryHeight * (categoryIndex + 0.5);
            const label =
              category.label.length > 25 ? `${category.label.slice(0, 23)}…` : category.label;
            return (
              <g key={category.key}>
                <text
                  x={margin.left - 14}
                  y={centerY + 4}
                  textAnchor="end"
                  fontSize="13"
                  fontWeight="650"
                  fill="#263D42"
                >
                  {label}
                  <title>{category.label}</title>
                </text>
                <line
                  x1={margin.left}
                  x2={margin.left + plotWidth}
                  y1={margin.top + categoryHeight * (categoryIndex + 1)}
                  y2={margin.top + categoryHeight * (categoryIndex + 1)}
                  stroke="#EEF2F3"
                />
                {columnSeries.map((series, seriesIndex) => {
                  const value = series.values[categoryIndex];
                  if (value == null) return null;
                  const previousValues = columnSeries
                    .slice(0, seriesIndex)
                    .map((item) => item.values[categoryIndex])
                    .filter(
                      (item): item is number => item != null && (value >= 0 ? item >= 0 : item < 0),
                    );
                  const startValue = stacked
                    ? previousValues.reduce((sum, item) => sum + item, 0)
                    : 0;
                  const endValue = startValue + value;
                  const startX = xPosition(startValue);
                  const endX = xPosition(endValue);
                  const barHeight = stacked
                    ? Math.min(25, categoryHeight * 0.56)
                    : Math.min(21, (categoryHeight - 10) / Math.max(1, columnSeries.length));
                  const y = stacked
                    ? centerY - barHeight / 2
                    : centerY - (barHeight * columnSeries.length) / 2 + seriesIndex * barHeight;
                  const barX = Math.min(startX, endX);
                  const barWidth = Math.max(1, Math.abs(endX - startX));
                  const color = value < 0 ? "#C62828" : series.definition.color;
                  const hoverKey = `${series.definition.id}-${category.key}`;
                  const active = hover?.key === hoverKey;
                  return (
                    <g key={hoverKey}>
                      <rect
                        x={barX}
                        y={y + 1}
                        width={barWidth}
                        height={Math.max(2, barHeight - 2)}
                        rx="5"
                        fill={color}
                        opacity={hover && !active ? 0.52 : 0.94}
                        stroke={active ? "#FFFFFF" : "transparent"}
                        strokeWidth={active ? 2 : 0}
                        filter={active ? `url(#${idPrefix}-bar-shadow)` : undefined}
                        style={{ cursor: "pointer", transition: "opacity 150ms ease" }}
                        onMouseEnter={(event) => showHover(event, series, categoryIndex, value)}
                        onMouseMove={(event) => showHover(event, series, categoryIndex, value)}
                        onMouseLeave={() => setHover(null)}
                      />
                      {series.definition.showValue && (
                        <text
                          x={value >= 0 ? endX + 8 : endX - 8}
                          y={y + barHeight / 2 + 4}
                          textAnchor={value >= 0 ? "start" : "end"}
                          fontSize="11"
                          fontWeight="700"
                          fill="#3E5459"
                        >
                          {fullNumber(value, series.prefix, series.suffix)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {!hasValues && (
            <text
              x={margin.left + plotWidth / 2}
              y={margin.top + plotHeight / 2}
              textAnchor="middle"
              fontSize="16"
              fill="#617379"
            >
              Chưa có dữ liệu phù hợp với cấu hình
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
              minWidth: 190,
              maxWidth: 280,
              pointerEvents: "none",
              border: 1,
              borderColor: "divider",
              zIndex: 4,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {hover.category}
            </Typography>
            <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, mt: 0.35 }}>
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  bgcolor: hover.color,
                  flex: "0 0 auto",
                }}
              />
              <Typography variant="body2" sx={{ flex: 1 }}>
                {hover.series}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                {fullNumber(hover.value, hover.prefix, hover.suffix)}
              </Typography>
            </Stack>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
