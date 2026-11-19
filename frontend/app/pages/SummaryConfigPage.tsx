import { Box, Stack, Typography } from "@mui/material";
import { SummaryConfigTab } from "../components/summary-config/SummaryConfigTab";
import { useKkv } from "../context/kkv-context";

export function SummaryConfigPage() {
  const { state, updateState } = useKkv();

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Cấu hình tổng hợp</Typography>
        <Typography color="text.secondary">
          Tạo cột, dòng tổng hợp và định nghĩa công thức riêng cho từng trường dữ liệu.
        </Typography>
      </Box>
      <SummaryConfigTab state={state} updateState={updateState} />
    </Stack>
  );
}
