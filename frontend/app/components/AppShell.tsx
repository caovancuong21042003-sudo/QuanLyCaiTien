import { useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import MenuRounded from "@mui/icons-material/MenuRounded";
import TableChartRounded from "@mui/icons-material/TableChartRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import FunctionsRounded from "@mui/icons-material/FunctionsRounded";
import SummarizeRounded from "@mui/icons-material/SummarizeRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import { useTheme } from "@mui/material/styles";
import { useKkv } from "../context/kkv-context";
import { projectsForYear } from "../domain/metadata";
import { Outlet, useLocation, useNavigate } from "react-router";
const drawerWidth = 248;

export function AppShell() {
  const { state, updateState, reset } = useKkv();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("lg"));
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [yearDraft, setYearDraft] = useState(state.selectedYear + 1);
  const activeProjects = projectsForYear(state);
  const selectYear = (year: number) => {
    updateState((current) => ({ ...current, selectedYear: year }));
    navigate(
      location.pathname.startsWith("/project-management") ? "/project-management" : "/projects",
    );
  };
  const addYear = () => {
    if (!Number.isInteger(yearDraft) || yearDraft < 2000 || yearDraft > 2200) return;
    updateState((current) => ({
      ...current,
      selectedYear: yearDraft,
      availableYears: [...new Set([...current.availableYears, yearDraft])].sort((a, b) => a - b),
    }));
    navigate(
      location.pathname.startsWith("/project-management") ? "/project-management" : "/projects",
    );
    setYearDialogOpen(false);
  };
  const navigation = [
    {
      id: "table",
      label: "Bảng tổng hợp",
      icon: <TableChartRounded />,
      path: "/projects",
      selected: location.pathname === "/projects",
    },
    {
      id: "detail",
      label: "Quản lý dự án",
      icon: <DescriptionRounded />,
      path: "/project-management",
      selected:
        location.pathname.startsWith("/project-management") ||
        location.pathname.startsWith("/projects/"),
    },
    {
      id: "structure",
      label: "Cấu hình cấu trúc",
      icon: <TuneRounded />,
      path: "/structure",
      selected: location.pathname === "/structure",
    },
    {
      id: "summary",
      label: "Cấu hình tổng hợp",
      icon: <SummarizeRounded />,
      path: "/summaries",
      selected: location.pathname === "/summaries",
    },
    {
      id: "formula",
      label: "Trình tạo công thức",
      icon: <FunctionsRounded />,
      path: "/formulas",
      selected: location.pathname === "/formulas",
    },
    {
      id: "charts",
      label: "Biểu đồ",
      icon: <InsightsRounded />,
      path: "/charts",
      selected: location.pathname === "/charts",
    },
  ];
  const drawer = (
    <Stack sx={{ height: "100%" }}>
      <Toolbar sx={{ gap: 1.25, px: 2.25 }}>
        <Avatar
          variant="rounded"
          sx={{ bgcolor: "primary.main", width: 36, height: 36, fontWeight: 800 }}
        >
          K
        </Avatar>
        <Box>
          <Typography sx={{ fontWeight: 800 }}>Quản lý KKV</Typography>
          <Typography variant="caption" color="text.secondary">
            Kế hoạch & kết quả cải tiến
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <Box sx={{ px: 1.5, py: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Nhà máy KKV
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {activeProjects.length} dự án trong năm đang chọn
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 1.25 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Năm dữ liệu"
            value={state.selectedYear}
            onChange={(event) => selectYear(Number(event.target.value))}
          >
            {state.availableYears.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="Thêm năm dữ liệu">
            <IconButton
              aria-label="Thêm năm dữ liệu"
              onClick={() => {
                setYearDraft(Math.max(...state.availableYears, state.selectedYear) + 1);
                setYearDialogOpen(true);
              }}
            >
              <AddRounded />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
      <Divider />
      <List sx={{ px: 1.25, py: 1.5 }}>
        {navigation.map((item) => (
          <ListItemButton
            key={item.id}
            selected={item.selected}
            onClick={() => {
              navigate(item.path);
              setDrawerOpen(false);
            }}
            sx={{ borderRadius: 1.5, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={
                <Typography sx={{ fontWeight: item.selected ? 700 : 500 }}>{item.label}</Typography>
              }
            />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: "auto", p: 1.5 }}>
        <Button
          fullWidth
          color="inherit"
          startIcon={<RestartAltRounded />}
          onClick={() => {
            void reset();
            navigate("/projects");
          }}
        >
          Khôi phục dữ liệu mẫu
        </Button>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", textAlign: "center", mt: 1 }}
        >
          Phiên bản dữ liệu {state.schemaVersion}
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: "secondary.main", fontSize: 13 }}>
            CV
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Người dùng hiện tại
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Dữ liệu cục bộ
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          display: { xs: "block", lg: "none" },
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            onClick={() => setDrawerOpen(true)}
            sx={{ display: { lg: "none" }, mr: 1 }}
          >
            <MenuRounded />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2">Nhà máy KKV</Typography>
            <Typography variant="caption" color="text.secondary">
              Năm {state.selectedYear}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }}>
        <Drawer
          variant={desktop ? "permanent" : "temporary"}
          open={desktop || drawerOpen}
          onClose={() => setDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box" } }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{ flexGrow: 1, minWidth: 0, p: { xs: 1.5, sm: 2.5, lg: 3 }, pt: { xs: 10, lg: 3 } }}
      >
        <Outlet />
      </Box>
      <Dialog
        open={yearDialogOpen}
        onClose={() => setYearDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Thêm năm dữ liệu</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            type="number"
            label="Năm"
            value={yearDraft}
            slotProps={{ htmlInput: { min: 2000, max: 2200 } }}
            onChange={(event) => setYearDraft(Number(event.target.value))}
            sx={{ mt: 1 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Năm mới có lịch, dự án và dữ liệu tháng độc lập; hệ thống không sao chép dữ liệu từ năm
            cũ.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setYearDialogOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={addYear}>
            Tạo năm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
