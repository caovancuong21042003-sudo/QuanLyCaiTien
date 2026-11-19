import type { ReactNode } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";

export function FormulaEditorSurface({
  open,
  title,
  context,
  actions,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  context: string;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" scroll="paper">
      <DialogTitle>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap title={context}>
              {context}
            </Typography>
          </Box>
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, flexShrink: 0 }}>
            {actions}
            <IconButton aria-label="Đóng trình soạn công thức" onClick={onClose}>
              <CloseRounded />
            </IconButton>
          </Stack>
        </Stack>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          p: { xs: 1.5, md: 2 },
          bgcolor: "#F5F8F8",
          height: { lg: "calc(100vh - 150px)" },
          overflow: { lg: "hidden" },
        }}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
