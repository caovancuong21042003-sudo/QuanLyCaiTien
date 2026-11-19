import { describe, expect, it } from "vitest";
import { createSeedState } from "../data/seed";
import { buildChartData } from "../domain/chart-data";
import type { ChartDefinition } from "../domain/types";
import { migrateState } from "../repositories/local-storage-repository";
import { createChartDefinition } from "../pages/ChartsPage";

describe("chart data", () => {
  it("lưu columnId khi tạo biểu đồ mới, không lưu mã kỹ thuật của cột", () => {
    const state = createSeedState();
    state.monthlyColumns.unshift({
      id: "column-custom-id",
      code: "customTechnicalCode",
      label: "Cột tùy chỉnh",
      sortOrder: 0,
    });

    const chart = createChartDefinition(state, "summary");

    expect(chart.series[0].columnId).toBe("column-custom-id");
  });

  it("tách khóa nguồn biểu đồ tổng hợp và biểu đồ dự án", () => {
    const state = createSeedState();
    const summarySeries = state.chartDefinitions
      .filter((chart) => chart.dashboardScope === "summary")
      .flatMap((chart) => chart.series);
    const projectSeries = state.chartDefinitions
      .filter((chart) => chart.dashboardScope === "project")
      .flatMap((chart) => chart.series);

    expect(summarySeries.every((series) => Boolean(series.metricId) && !series.fieldId)).toBe(true);
    expect(projectSeries.every((series) => Boolean(series.fieldId) && !series.metricId)).toBe(true);
  });

  it("uses the configured summary row for all twelve months", () => {
    const state = createSeedState();
    const chart = state.chartDefinitions.find((item) => item.id === "chart-monthly-saving")!;
    const projects = state.projects.filter((project) => project.year === state.selectedYear);

    const data = buildChartData(state, chart, projects);

    expect(data.categories).toHaveLength(12);
    expect(data.categories[0]).toEqual({ key: "m:1", label: "T1" });
    expect(data.series).toHaveLength(2);
    expect(data.series[0].values.some((value) => value != null)).toBe(true);
    expect(data.series[1].values.some((value) => value != null)).toBe(true);
  });

  it("applies the filtered project scope before calculating a summary row", () => {
    const state = createSeedState();
    const chart = state.chartDefinitions.find((item) => item.id === "chart-monthly-saving")!;
    const projects = state.projects.filter((project) => project.year === state.selectedYear);

    const allData = buildChartData(state, chart, projects);
    const oneProjectData = buildChartData(state, chart, projects.slice(0, 1));

    expect(oneProjectData.series[0].values).not.toEqual(allData.series[0].values);
  });

  it("keeps projects on a stable project axis", () => {
    const state = createSeedState();
    const projects = state.projects
      .filter((project) => project.year === state.selectedYear)
      .slice(0, 3)
      .reverse();
    const chart: ChartDefinition = {
      id: "project-chart",
      name: "Theo dự án",
      categoryAxis: "project",
      filterScope: "followPageFilters",
      size: "half",
      height: "small",
      sortOrder: 1,
      series: [
        {
          id: "project-series",
          label: "Hiệu quả",
          sourceKind: "monthlyField",
          fieldId: "savingUsd",
          columnId: "actual",
          month: 5,
          renderer: "column",
          valueAxis: "left",
          color: "#135D66",
          showValue: false,
        },
      ],
    };

    const data = buildChartData(state, chart, projects);

    expect(data.categories.map((item) => item.key)).toEqual(projects.map((item) => item.id));
    expect(data.categories.map((item) => item.label)).toEqual(projects.map((item) => item.code));
  });

  it("compares annual summary values by project and sorts them by value", () => {
    const state = createSeedState();
    const chart = state.chartDefinitions.find(
      (item) => item.id === "chart-project-saving-comparison",
    )!;
    const projects = state.projects.filter((project) => project.year === state.selectedYear);

    const data = buildChartData(state, chart, projects);
    const values = data.series[0].values.filter((value): value is number => value != null);

    expect(data.categories).toHaveLength(projects.length);
    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((left, right) => right - left));
  });

  it("reads monthly fields directly for the selected project dashboard", () => {
    const state = createSeedState();
    const chart = state.chartDefinitions.find(
      (item) => item.id === "chart-project-detail-monthly-saving",
    )!;
    const project = state.projects.find((item) => item.year === state.selectedYear)!;

    const data = buildChartData(state, chart, [project]);

    expect(data.categories).toHaveLength(12);
    expect(data.series).toHaveLength(2);
    expect(data.series[0].values.some((value) => value != null)).toBe(true);
  });

  it("keeps prefix and suffix as two independent chart decorations", () => {
    const state = createSeedState();
    const field = state.fieldDefinitions.find((item) => item.id === "savingUsd")!;
    field.prefix = "$";
    field.suffix = "USD";
    const chart = state.chartDefinitions.find(
      (item) => item.id === "chart-project-detail-monthly-saving",
    )!;
    const project = state.projects.find((item) => item.year === state.selectedYear)!;

    const data = buildChartData(state, chart, [project]);

    expect(data.series[0].prefix).toBe("$");
    expect(data.series[0].suffix).toBe("USD");
  });

  it("reproduces the Excel monthly and cumulative saving chart", () => {
    const state = createSeedState();
    const chart = state.chartDefinitions.find((item) => item.id === "chart-excel-saving-combo")!;
    const projects = state.projects.filter((project) => project.year === state.selectedYear);

    const data = buildChartData(state, chart, projects);
    const expectedMonthlyPlan = [
      2001.9271111111111, 2389.121111111111, 3786.555895555555, 5522.321717777777,
      9406.518895694444, 12063.248095694444, 16360.936031631943, 23155.331324965275,
      23927.059124965275, 30074.78692496528, 31635.94992496528, 37333.164644965276,
    ];
    const expectedMonthlyActual = [
      2726.084133333333, 898.9766666666665, 2241.1615730511107, 4281.436760064444,
      6578.243476426666, 7884.393713226667, 12989.215804000001, 0, 0, 0, 0, 0,
    ];

    expect(state.projects).toHaveLength(48);
    expect(data.categories).toHaveLength(12);
    expect(data.series).toHaveLength(4);
    expectedMonthlyPlan.forEach((value, index) => {
      expect(data.series[0].values[index]).toBeCloseTo(value, 8);
    });
    expectedMonthlyActual.forEach((value, index) => {
      expect(data.series[1].values[index]).toBeCloseTo(value, 8);
    });
    expect(data.series[2].values[11]).toBeCloseTo(197656.92080340278, 8);
    expect(data.series[3].values[11]).toBeCloseTo(37599.51212676889, 8);
    expect(chart.series.map((series) => series.renderer)).toEqual([
      "column",
      "column",
      "line",
      "line",
    ]);
    expect(chart.series.map((series) => series.valueAxis)).toEqual([
      "left",
      "left",
      "right",
      "right",
    ]);
  });

  it("adds the chart templates when migrating an existing workspace", () => {
    const legacy = createSeedState() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 25;
    delete legacy.chartDefinitions;

    const migrated = migrateState(legacy);

    expect(migrated.chartDefinitions.map((item) => item.id)).toEqual([
      "chart-excel-saving-combo",
      "chart-monthly-saving",
      "chart-cumulative-saving",
      "chart-cumulative-variance",
      "chart-project-saving-comparison",
      "chart-project-saving-share",
      "chart-project-detail-monthly-saving",
      "chart-project-detail-cumulative-saving",
      "chart-project-detail-production",
    ]);
  });

  it("resets customized charts from an obsolete schema", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 26;
    legacy.chartDefinitions = legacy.chartDefinitions
      .filter((item) =>
        ["chart-monthly-saving", "chart-cumulative-saving", "chart-cumulative-variance"].includes(
          item.id,
        ),
      )
      .map((item) =>
        item.id === "chart-monthly-saving" ? { ...item, name: "Biểu đồ đã sửa" } : item,
      );

    const migrated = migrateState(legacy);

    expect(migrated.chartDefinitions).toHaveLength(9);
    expect(
      migrated.chartDefinitions.find((item) => item.id === "chart-monthly-saving")?.name,
    ).not.toBe("Biểu đồ đã sửa");
    expect(
      migrated.chartDefinitions.some((item) => item.id === "chart-project-saving-comparison"),
    ).toBe(true);
  });

  it("adds the donut template to schema 27 workspaces", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 27;
    legacy.chartDefinitions = legacy.chartDefinitions.filter((item) =>
      [
        "chart-monthly-saving",
        "chart-cumulative-saving",
        "chart-cumulative-variance",
        "chart-project-saving-comparison",
      ].includes(item.id),
    );

    const migrated = migrateState(legacy);

    expect(migrated.chartDefinitions).toHaveLength(9);
    expect(migrated.chartDefinitions.some((item) => item.id === "chart-project-saving-share")).toBe(
      true,
    );
  });
});
