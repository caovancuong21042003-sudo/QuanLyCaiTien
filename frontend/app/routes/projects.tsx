import { useNavigate } from "react-router";
import { ProjectTablePage } from "../pages/ProjectTablePage";

export default function ProjectsRoute() {
  const navigate = useNavigate();
  return (
    <ProjectTablePage
      onOpenProject={(projectId) => navigate(`/project-management/${projectId}`)}
      onManageProjects={() => navigate("/project-management")}
    />
  );
}
