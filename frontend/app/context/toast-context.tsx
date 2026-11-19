import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Alert, Snackbar, type AlertColor } from "@mui/material";

interface ToastOptions {
  severity?: AlertColor;
  duration?: number;
}

interface ToastItem {
  id: number;
  message: string;
  severity: AlertColor;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const defaultDuration = (severity: AlertColor) => {
  if (severity === "error") return 6000;
  if (severity === "warning") return 5000;
  if (severity === "info") return 4000;
  return 3000;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const current = queue[0];
  const value = useMemo<ToastContextValue>(
    () => ({
      showToast: (message, options) => {
        const severity = options?.severity ?? "success";
        setQueue((items) => [
          ...items,
          {
            id: Date.now() + items.length,
            message,
            severity,
            duration: options?.duration ?? defaultDuration(severity),
          },
        ]);
      },
    }),
    [],
  );

  const closeCurrent = () =>
    setQueue((items) => (current && items[0]?.id === current.id ? items.slice(1) : items));

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <Snackbar
          key={current.id}
          open
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          autoHideDuration={current.duration}
          onClose={(_, reason) => {
            if (reason !== "clickaway") closeCurrent();
          }}
          sx={{ maxWidth: { xs: "calc(100vw - 24px)", sm: 520 } }}
        >
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={closeCurrent}
            sx={{ width: "100%", boxShadow: 4 }}
          >
            {current.message}
          </Alert>
        </Snackbar>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast phải được dùng bên trong ToastProvider.");
  return context;
}
