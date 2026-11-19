import { Navigate, useParams } from "react-router";

export default function LegacyProjectDetailRoute() {
  const { projectId = "", section } = useParams();
  const suffix = section ? `/${section}` : "";
  return <Navigate to={`/project-management/${projectId}${suffix}`} replace />;
}
