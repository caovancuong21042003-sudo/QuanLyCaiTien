import { useDeferredValue, useMemo, useState } from "react";
import {
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { CreateProjectDialog } from "../components/projects/CreateProjectDialog";
import { useKkv } from "../context/kkv-context";
import { projectsForYear } from "../domain/metadata";

const uniqueOptions = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "vi"));

export function ProjectManagementPage({
  onOpenProject,
}: {
  onOpenProject: (projectId: string) => void;
}) {
  const { state } = useKkv();
  const [creating, setCreating] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [owner, setOwner] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const projects = useMemo(() => projectsForYear(state), [state.projects, state.selectedYear]);
  const departments = useMemo(
    () => uniqueOptions(projects.map((project) => project.department)),
    [projects],
  );
  const categories = useMemo(
    () => uniqueOptions(projects.map((project) => project.category)),
    [projects],
  );
  const owners = useMemo(() => uniqueOptions(projects.map((project) => project.owner)), [projects]);
  const filteredProjects = useMemo(() => {
    const keyword = deferredSearchText.trim().toLocaleLowerCase("vi");
    return projects.filter((project) => {
      const matchesKeyword =
        !keyword ||
        [project.code, project.name, project.department, project.category, project.owner]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(keyword);
      return (
        matchesKeyword &&
        (!department || project.department === department) &&
        (!category || project.category === category) &&
        (!owner || project.owner === owner)
      );
    });
  }, [category, deferredSearchText, department, owner, projects]);
  const hasFilters = Boolean(searchText || department || category || owner);
  const clearFilters = () => {
    setSearchText("");
    setDepartment("");
    setCategory("");
    setOwner("");
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1.5 }}
      >
        <Box>
          <Typography variant="h4">Quản lý dự án</Typography>
          <Typography color="text.secondary">
            {hasFilters
              ? filteredProjects.length + "/" + projects.length + " dự án theo bộ lọc"
              : projects.length + " dự án"}{" "}
            · Năm {state.selectedYear}
          </Typography>
        </Box>
        {projects.length > 0 && (
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>
            Thêm dự án
          </Button>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "minmax(240px, 1.5fr) repeat(3, minmax(150px, 1fr)) auto",
            },
            gap: 1,
            alignItems: "start",
          }}
        >
          <TextField
            size="small"
            label="Tìm dự án"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Mã, tên, bộ phận hoặc phụ trách"
          />
          <TextField
            select
            size="small"
            label="Bộ phận"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {departments.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Phân loại"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {categories.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Người phụ trách"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {owners.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <Button size="small" disabled={!hasFilters} onClick={clearFilters} sx={{ minHeight: 40 }}>
            Xóa bộ lọc
          </Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
          <Table stickyHeader size="small" sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: "#EAF1F2", width: 140 }}>Mã dự án</TableCell>
                <TableCell sx={{ bgcolor: "#EAF1F2", minWidth: 280 }}>Dự án</TableCell>
                <TableCell sx={{ bgcolor: "#EAF1F2", minWidth: 150 }}>Bộ phận</TableCell>
                <TableCell sx={{ bgcolor: "#EAF1F2", minWidth: 150 }}>Phân loại</TableCell>
                <TableCell sx={{ bgcolor: "#EAF1F2", minWidth: 150 }}>Người phụ trách</TableCell>
                <TableCell sx={{ bgcolor: "#EAF1F2", width: 130 }}>Hạn hoàn thành</TableCell>
                <TableCell align="right" sx={{ bgcolor: "#EAF1F2", width: 100 }}>
                  Thao tác
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProjects.map((project) => (
                <TableRow
                  key={project.id}
                  hover
                  tabIndex={0}
                  onClick={() => onOpenProject(project.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onOpenProject(project.id);
                  }}
                  sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 } }}
                >
                  <TableCell>
                    <Typography variant="body2" color="primary.main" sx={{ fontWeight: 750 }}>
                      {project.code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, whiteSpace: "normal", overflowWrap: "anywhere" }}
                    >
                      {project.name}
                    </Typography>
                    {project.product && (
                      <Typography variant="caption" color="text.secondary">
                        {project.product}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{project.department || "—"}</TableCell>
                  <TableCell>{project.category || "—"}</TableCell>
                  <TableCell>{project.owner || "—"}</TableCell>
                  <TableCell>{project.deadline || "—"}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      endIcon={<ArrowForwardRounded />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenProject(project.id);
                      }}
                    >
                      Mở
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredProjects.length && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 8, textAlign: "center" }}>
                    <Typography variant="h6">
                      {projects.length ? "Không tìm thấy dự án phù hợp" : "Năm này chưa có dự án"}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                      {projects.length
                        ? "Hãy thay đổi hoặc xóa bộ lọc để xem lại danh sách."
                        : "Tạo dự án đầu tiên để bắt đầu nhập dữ liệu."}
                    </Typography>
                    {projects.length ? (
                      <Button variant="outlined" onClick={clearFilters}>
                        Xóa bộ lọc
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        startIcon={<AddRounded />}
                        onClick={() => setCreating(true)}
                      >
                        Thêm dự án
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            onOpenProject(project.id);
          }}
        />
      )}
    </Stack>
  );
}
