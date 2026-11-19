import { useId, useState, type MouseEvent } from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { ChartDataSet, ChartDataSeries } from "../../domain/chart-data";
import type { ChartDefinition, ChartValueAxis } from "../../domain/types";
import { HorizontalBarChart } from "./HorizontalBarChart";
import { PieChart } from "./PieChart";

interface FlexibleChartProps {
  definition: ChartDefinition;
  data: ChartDataSet;
  compact?: boolean;
}

interface Domain {
  min: number;
  max: number;
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

const svgHeight = { small: 300, medium: 390, large: 500 };

function stackedExtremes(series: ChartDataSeries[]) {
  const columnSeries = series.filter((item) => item.definition.renderer === "column");
  const length = Math.max(0, ...columnSeries.map((item) => item.values.length));
  return Array.from({ length }, (_, index) => {
    const values = columnSeries.map((item) => item.values[index]).filter((value) => value != null);
    return {
      positive: values.reduce((sum, value) => sum + Math.max(0, value), 0),
      negative: values.reduce((sum, value) => sum + Math.min(0, value), 0),
    };
  });
}

function domainFor(
  series: ChartDataSeries[],
  axis: ChartValueAxis,
  columnMode: ChartDefinition["columnMode"],
): Domain {
  const axisSeries = series.filter((item) => item.definition.valueAxis === axis);
  const regularValues = axisSeries
    .filter((item) => columnMode !== "stacked" || item.definition.renderer !== "column")
    .flatMap((item) => item.values)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const stackedValues =
    columnMode === "stacked"
      ? stackedExtremes(axisSeries).flatMap((item) => [item.negative, item.positive])
      : [];
  const values = [...regularValues, ...stackedValues];
  if (!values.length) return { min: 0, max: 1 };
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  if (minimum === maximum) return { min: minimum - 1, max: maximum + 1 };
  const padding = (maximum - minimum) * 0.08;
  return { min: minimum - padding, max: maximum + padding };
}

function yPosition(value: number, domain: Domain, top: number, height: number) {
  return top + ((domain.max - value) / (domain.max - domain.min)) * height;
}

function shortNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000)
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000)}tr`;
  if (absolute >= 1_000)
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000)}k`;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}

function fullNumber(value: number, prefix?: string, suffix?: string) {
  const formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(value);
  const prefixed = prefix ? `${prefix}${formatted}` : formatted;
  return suffix ? `${prefixed}${suffix === "%" ? "" : " "}${suffix}` : prefixed;
}

function lineSegments(values: Array<number | null>) {
  const segments: Array<Array<{ index: number; value: number }>> = [];
  values.forEach((value, index) => {
    if (value == null) return;
    if (index === 0 || values[index - 1] == null) segments.push([]);
    segments.at(-1)?.push({ index, value });
  });
  return segments;
}

function legendShape(series: ChartDataSeries) {
  const renderer = series.definition.renderer;
  if (renderer === "line") return { width: 22, height: 3, borderRadius: 2, opacity: 1 };
  if (renderer === "scatter") return { width: 10, height: 10, borderRadius: "50%", opacity: 1 };
  if (renderer === "area") return { width: 22, height: 10, borderRadius: 1, opacity: 0.45 };
  return { width: 11, height: 11, borderRadius: 0.5, opacity: 1 };
}

export function FlexibleChart({ definition, data, compact = false }: FlexibleChartProps) {
  const [hover, setHover] = useState<HoverValue | null>(null);
  const idPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (definition.presentation === "pie" || definition.presentation === "donut")
    return <PieChart definition={definition} data={data} />;
  const useHorizontal =
    definition.orientation === "horizontal" ||
    (definition.orientation === "auto" &&
      definition.categoryAxis === "project" &&
      data.categories.length >= 12);
  if (useHorizontal) return <HorizontalBarChart definition={definition} data={data} />;
  const width = 1000;
  const height = compact ? 310 : svgHeight[definition.height];
  const margin = { top: 26, right: 76, bottom: 58, left: 76 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const categoryWidth = plotWidth / Math.max(1, data.categories.length);
  const columnMode = definition.columnMode ?? "grouped";
  const leftDomain = domainFor(data.series, "left", columnMode);
  const rightDomain = domainFor(data.series, "right", columnMode);
  const hasRightAxis = data.series.some((item) => item.definition.valueAxis === "right");
  const columnSeries = data.series.filter((item) => item.definition.renderer === "column");
  const hasValues = data.series.some((item) => item.values.some((value) => value != null));
  const ticks = Array.from({ length: 5 }, (_, index) => index / 4);
  const baseline = yPosition(0, leftDomain, margin.top, plotHeight);

  const showHover = (
    event: MouseEvent<SVGElement>,
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
      color:
        value < 0 && series.definition.renderer === "column" ? "#C62828" : series.definition.color,
    });
  };

  return (
    <Box>
      <Stack direction="row" sx={{ gap: 1.5, flexWrap: "wrap", mb: 1 }}>
        {data.series.map((series) => {
          const shape = legendShape(series);
          return (
            <Stack
              key={series.definition.id}
              direction="row"
              sx={{ alignItems: "center", gap: 0.75 }}
            >
              <Box sx={{ ...shape, bgcolor: series.definition.color }} />
              <Typography variant="caption" sx={{ fontWeight: 650 }}>
                {series.definition.label}
                {series.suffix ? ` · ${series.suffix}` : ""}
              </Typography>
              {series.errorCount > 0 && (
                <Chip size="small" color="error" label={`${series.errorCount} lỗi`} />
              )}
            </Stack>
          );
        })}
      </Stack>

      <Box
        sx={{ width: "100%", minHeight: compact ? 250 : 300, position: "relative" }}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={definition.name}
          style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
        >
          <defs>
            {data.series.map((series) => (
              <linearGradient
                key={series.definition.id}
                id={`${idPrefix}-${series.definition.id}`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0%" stopColor={series.definition.color} stopOpacity="0.5" />
                <stop offset="100%" stopColor={series.definition.color} stopOpacity="0.04" />
              </linearGradient>
            ))}
            <filter id={`${idPrefix}-shadow`} x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.22" />
            </filter>
          </defs>

          {ticks.map((ratio) => {
            const y = margin.top + ratio * plotHeight;
            const leftValue = leftDomain.max - ratio * (leftDomain.max - leftDomain.min);
            const rightValue = rightDomain.max - ratio * (rightDomain.max - rightDomain.min);
            return (
              <g key={ratio}>
                <line
                  x1={margin.left}
                  x2={margin.left + plotWidth}
                  y1={y}
                  y2={y}
                  stroke="#DCE5E7"
                  strokeDasharray={ratio === 1 ? undefined : "4 4"}
                />
                <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#617379">
                  {shortNumber(leftValue)}
                </text>
                {hasRightAxis && (
                  <text
                    x={margin.left + plotWidth + 10}
                    y={y + 4}
                    textAnchor="start"
                    fontSize="12"
                    fill="#617379"
                  >
                    {shortNumber(rightValue)}
                  </text>
                )}
              </g>
            );
          })}

          {leftDomain.min < 0 && leftDomain.max > 0 && (
            <line
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={baseline}
              y2={baseline}
              stroke="#617379"
              strokeWidth="1.5"
            />
          )}

          {data.categories.map((category, index) => (
            <text
              key={category.key}
              x={margin.left + categoryWidth * (index + 0.5)}
              y={height - 25}
              textAnchor="middle"
              fontSize={data.categories.length > 16 ? "10" : "12"}
              fill="#3E5459"
            >
              {category.label.length > 14 ? `${category.label.slice(0, 12)}…` : category.label}
            </text>
          ))}

          {columnSeries.flatMap((series, seriesIndex) => {
            const domain = series.definition.valueAxis === "right" ? rightDomain : leftDomain;
            const sameAxisColumns = columnSeries.filter(
              (item) => item.definition.valueAxis === series.definition.valueAxis,
            );
            const positionOnAxis = sameAxisColumns.indexOf(series);
            const availableWidth = categoryWidth * (columnMode === "stacked" ? 0.54 : 0.72);
            const barWidth =
              columnMode === "stacked"
                ? Math.min(48, availableWidth)
                : Math.min(34, availableWidth / Math.max(1, columnSeries.length));
            return series.values.map((value, index) => {
              if (value == null) return null;
              const previousValues = sameAxisColumns
                .slice(0, positionOnAxis)
                .map((item) => item.values[index])
                .filter(
                  (item): item is number => item != null && (value >= 0 ? item >= 0 : item < 0),
                );
              const startValue =
                columnMode === "stacked" ? previousValues.reduce((sum, item) => sum + item, 0) : 0;
              const endValue = startValue + value;
              const startY = yPosition(startValue, domain, margin.top, plotHeight);
              const endY = yPosition(endValue, domain, margin.top, plotHeight);
              const x =
                columnMode === "stacked"
                  ? margin.left + categoryWidth * (index + 0.5) - barWidth / 2
                  : margin.left +
                    categoryWidth * (index + 0.5) -
                    (barWidth * columnSeries.length) / 2 +
                    seriesIndex * barWidth;
              const y = Math.min(startY, endY);
              const barHeight = Math.max(1, Math.abs(startY - endY));
              const color = value < 0 ? "#C62828" : series.definition.color;
              const hoverKey = `${series.definition.id}-${data.categories[index]?.key}`;
              const active = hover?.key === hoverKey;
              return (
                <g key={hoverKey}>
                  <rect
                    x={x + 1}
                    y={y}
                    width={Math.max(2, barWidth - 2)}
                    height={barHeight}
                    rx="4"
                    fill={color}
                    opacity={hover && !active ? 0.55 : 0.94}
                    stroke={active ? "#FFFFFF" : "transparent"}
                    strokeWidth={active ? 2 : 0}
                    filter={active ? `url(#${idPrefix}-shadow)` : undefined}
                    style={{ cursor: "pointer", transition: "opacity 160ms ease" }}
                    onMouseEnter={(event) => showHover(event, series, index, value)}
                    onMouseMove={(event) => showHover(event, series, index, value)}
                    onMouseLeave={() => setHover(null)}
                  />
                  {series.definition.showValue && (
                    <text
                      x={x + barWidth / 2}
                      y={value >= 0 ? y - 6 : y + barHeight + 14}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#3E5459"
                    >
                      {shortNumber(value)}
                    </text>
                  )}
                </g>
              );
            });
          })}

          {data.series
            .filter((series) => ["line", "area", "scatter"].includes(series.definition.renderer))
            .flatMap((series) => {
              const domain = series.definition.valueAxis === "right" ? rightDomain : leftDomain;
              const zeroY = yPosition(0, domain, margin.top, plotHeight);
              const renderer = series.definition.renderer;
              return lineSegments(series.values).map((segment, segmentIndex) => {
                const coordinates = segment.map(({ index, value }) => ({
                  x: margin.left + categoryWidth * (index + 0.5),
                  y: yPosition(value, domain, margin.top, plotHeight),
                }));
                const points = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
                const areaPoints = coordinates.length
                  ? `${coordinates[0].x},${zeroY} ${points} ${coordinates.at(-1)?.x},${zeroY}`
                  : "";
                return (
                  <g key={`${series.definition.id}-segment-${segmentIndex}`}>
                    {renderer === "area" && coordinates.length > 1 && (
                      <polygon
                        points={areaPoints}
                        fill={`url(#${idPrefix}-${series.definition.id})`}
                        stroke="none"
                      />
                    )}
                    {renderer !== "scatter" && segment.length > 1 && (
                      <polyline
                        points={points}
                        fill="none"
                        stroke={series.definition.color}
                        strokeWidth={renderer === "area" ? 2.5 : 3}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={hover ? 0.78 : 1}
                      />
                    )}
                    {segment.map(({ index, value }, pointIndex) => {
                      const { x, y } = coordinates[pointIndex];
                      const hoverKey = `${series.definition.id}-${data.categories[index]?.key}`;
                      const active = hover?.key === hoverKey;
                      const radius = renderer === "scatter" ? 6 : active ? 6 : 4.5;
                      return (
                        <g key={hoverKey}>
                          <circle
                            cx={x}
                            cy={y}
                            r={radius}
                            fill={renderer === "scatter" ? series.definition.color : "#FFFFFF"}
                            stroke={series.definition.color}
                            strokeWidth={renderer === "scatter" ? 2 : 3}
                            filter={active ? `url(#${idPrefix}-shadow)` : undefined}
                            style={{ transition: "r 140ms ease" }}
                          />
                          <circle
                            cx={x}
                            cy={y}
                            r="13"
                            fill="transparent"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(event) => showHover(event, series, index, value)}
                            onMouseMove={(event) => showHover(event, series, index, value)}
                            onMouseLeave={() => setHover(null)}
                          />
                          {series.definition.showValue && (
                            <text x={x} y={y - 11} textAnchor="middle" fontSize="10" fill="#3E5459">
                              {shortNumber(value)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              });
            })}

          {!hasValues && (
            <g>
              <rect
                x={margin.left}
                y={margin.top}
                width={plotWidth}
                height={plotHeight}
                fill="#F7F9FA"
              />
              <text
                x={margin.left + plotWidth / 2}
                y={margin.top + plotHeight / 2}
                textAnchor="middle"
                fontSize="16"
                fill="#617379"
              >
                Chưa có dữ liệu phù hợp với cấu hình
              </text>
            </g>
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
              minWidth: 170,
              maxWidth: 260,
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
