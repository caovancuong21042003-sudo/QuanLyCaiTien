import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#135D66", dark: "#0B4248", light: "#D9EFED" },
    secondary: { main: "#E97836" },
    background: { default: "#F4F7F8", paper: "#FFFFFF" },
    text: { primary: "#172B30", secondary: "#617379" },
    divider: "#DCE5E7",
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, "Noto Sans", Arial, sans-serif',
    h4: { fontSize: "1.6rem", fontWeight: 750 },
    h5: { fontSize: "1.25rem", fontWeight: 720 },
    h6: { fontSize: "1rem", fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 650 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 38 } },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiFormControl: { defaultProps: { size: "small" } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700, backgroundColor: "#F2F6F7" } } },
  },
});
