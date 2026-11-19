import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/app-shell.tsx", [
    index("routes/index.tsx"),
    route("projects", "routes/projects.tsx"),
    route("project-management/:projectId?/:section?", "routes/project-detail.tsx"),
    route("projects/:projectId/:section?", "routes/legacy-project-detail.tsx"),
    route("structure", "routes/structure.tsx"),
    route("summaries", "routes/summaries.tsx"),
    route("formulas", "routes/formulas.tsx"),
    route("charts", "routes/charts.tsx"),
  ]),
] satisfies RouteConfig;
