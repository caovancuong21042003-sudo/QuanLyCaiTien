import { Navigate, useNavigate, useParams } from "react-router";
import { ProjectDetailPage, type ProjectDetailSection } from "../pages/ProjectDetailPage";
import { ProjectManagementPage } from "../pages/ProjectManagementPage";
import { useKkv } from "../context/kkv-context";
import { projectsForYear } from "../domain/metadata";

const sections = new Set<ProjectDetailSection>(["info", "monthly"]);

export default function ProjectDetailRoute() {
  const navigate = useNavigate();
  const { state } = useKkv();
  const { projectId = "", section } = useParams();
  if (projectId && section === "annual")
    return <Navigate to={`/project-management/${projectId}/monthly`} replace />;
  const activeSection: ProjectDetailSection =
    section && sections.has(section as ProjectDetailSection)
      ? (section as ProjectDetailSection)
      : "info";
  if (!projectId)
    return (
      <ProjectManagementPage
        onOpenProject={(nextProjectId) => navigate(`/project-management/${nextProjectId}`)}
      />
    );
  if (section && !sections.has(section as ProjectDetailSection))
    return (
      <Navigate
        to={projectId ? `/project-management/${projectId}` : "/project-management"}
        replace
      />
    );
  const projects = projectsForYear(state);
  if (!projects.length) return <Navigate to="/project-management" replace />;
  if (projects.length && !projects.some((project) => project.id === projectId))
    return (
      <Navigate
        to={`/project-management/${projects[0].id}${activeSection === "info" ? "" : `/${activeSection}`}`}
        replace
      />
    );
  const projectPath = (nextProjectId: string, nextSection = activeSection) =>
    `/project-management/${nextProjectId}${nextSection === "info" ? "" : `/${nextSection}`}`;
  return (
    <ProjectDetailPage
      projectId={projectId}
      section={activeSection}
      onSectionChange={(nextSection) => navigate(projectPath(projectId, nextSection))}
      onSelectProject={(nextProjectId) => navigate(projectPath(nextProjectId))}
      onBack={() => navigate("/project-management")}
    />
  );
}
