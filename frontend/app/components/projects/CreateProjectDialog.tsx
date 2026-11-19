import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useKkv } from "../../context/kkv-context";
import { projectsForYear } from "../../domain/metadata";
import type { Project, ProjectFieldTemplate } from "../../domain/types";
import { createClientId } from "../../utils/id";
import { PROJECT_FIELD_BLUEPRINTS } from "../../domain/project-field-blueprints";

const emptyDocument = () => ({ type: "doc", content: [] });
const creationTemplateLabels: Record<string, string> = {
  quality: "Giảm lỗi",
  cycle: "Giảm Cycle",
  amr: "Giảm nhân lực",
  office: "Cải thiện thời gian",
  custom: "Tự cấu hình",
};

const creationTemplateLabel = (template: ProjectFieldTemplate) =>
  creationTemplateLabels[template.id] ?? template.label;

const templateRowNumber = (template: ProjectFieldTemplate, fieldId: string) => {
  const rows = [...template.monthlyLayout.rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const rowId = template.monthlyLayout.placements.find(
    (placement) => placement.fieldId === fieldId,
  )?.rowId;
  const index = rows.findIndex((row) => row.id === rowId);
  return index >= 0 ? index + 1 : 1;
};

function createEmptyProject(year: number): Project {
  return {
    id: createClientId("project"),
    year,
    code: "",
    name: "",
    category: "",
    department: "",
    owner: "",
    deadline: `${year}-12-31`,
    product: "",
    description: emptyDocument(),
    targetReason: emptyDocument(),
    notes: emptyDocument(),
    startMonth: 1,
  };
}

export function CreateProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const { state, updateState } = useKkv();
  const [draft, setDraft] = useState(() => createEmptyProject(state.selectedYear));
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState("");
  const selectedTemplate = state.projectFieldTemplates.find(
    (template) => template.id === templateId,
  );

  const save = () => {
    const code = draft.code.trim();
    const name = draft.name.trim();
    if (!code || !name) {
      setError("Mã dự án và tên dự án không được để trống.");
      return;
    }
    if (!selectedTemplate) {
      setError("Hãy chọn mẫu cấu hình cho bảng dữ liệu 12 tháng.");
      return;
    }
    if (
      projectsForYear(state).some((project) => project.code.toLowerCase() === code.toLowerCase())
    ) {
      setError("Mã dự án đã tồn tại trong năm này.");
      return;
    }

    const project = { ...draft, code, name, year: state.selectedYear, templateId };
    updateState((current) => {
      return {
        ...current,
        projects: [...current.projects, project],
      };
    });
    onCreated(project);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Thêm dự án cho năm {state.selectedYear}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="warning">{error}</Alert>}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: 2,
            }}
          >
            <TextField
              autoFocus
              label="Mã dự án"
              value={draft.code}
              onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            />
            <TextField
              label="Tên dự án"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <TextField
              label="Phân loại"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            />
            <TextField
              label="Bộ phận"
              value={draft.department}
              onChange={(event) => setDraft({ ...draft, department: event.target.value })}
            />
            <TextField
              label="Người phụ trách"
              value={draft.owner}
              onChange={(event) => setDraft({ ...draft, owner: event.target.value })}
            />
            <TextField
              label="Sản phẩm/thiết bị"
              value={draft.product}
              onChange={(event) => setDraft({ ...draft, product: event.target.value })}
            />
            <TextField
              type="date"
              label="Hạn hoàn thành"
              value={draft.deadline}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) => setDraft({ ...draft, deadline: event.target.value })}
            />
            <TextField
              select
              label="Tháng bắt đầu"
              value={draft.startMonth}
              onChange={(event) => setDraft({ ...draft, startMonth: Number(event.target.value) })}
            >
              {state.periods.map((period) => (
                <MenuItem key={period.month} value={period.month}>
                  {period.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
              Mẫu cấu hình bảng 12 tháng
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
              Chọn bộ trường phù hợp với dự án. Bạn vẫn có thể đổi tên, hậu tố và cột hiển thị sau
              khi tạo.
            </Typography>

            {state.projectFieldTemplates.length ? (
              <RadioGroup
                value={templateId}
                onChange={(event) => {
                  setTemplateId(event.target.value);
                  setError("");
                }}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                  gap: 1,
                }}
              >
                {state.projectFieldTemplates.map((template) => {
                  const selected = template.id === templateId;
                  return (
                    <Paper
                      key={template.id}
                      variant="outlined"
                      onClick={() => {
                        setTemplateId(template.id);
                        setError("");
                      }}
                      sx={{
                        cursor: "pointer",
                        borderColor: selected ? "primary.main" : "divider",
                        bgcolor: selected ? "primary.50" : "background.paper",
                        transition: "border-color 120ms ease, background-color 120ms ease",
                        "&:hover": { borderColor: "primary.main" },
                      }}
                    >
                      <FormControlLabel
                        value={template.id}
                        control={<Radio />}
                        sx={{ m: 0, p: 1.25, width: "100%", alignItems: "flex-start" }}
                        label={
                          <Box sx={{ pt: 0.25 }}>
                            <Typography variant="body2" sx={{ fontWeight: 750 }}>
                              {creationTemplateLabel(template)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {template.description || "Không có mô tả"}
                            </Typography>
                          </Box>
                        }
                      />
                    </Paper>
                  );
                })}
              </RadioGroup>
            ) : (
              <Alert severity="warning">Chưa có mẫu cấu hình nào để áp dụng.</Alert>
            )}
          </Box>

          {selectedTemplate && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#F8FBFB" }}>
              <Stack spacing={1.25}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>
                    Xem trước · {creationTemplateLabel(selectedTemplate)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Xem trước thông tin dự án, cột chung và dữ liệu theo tháng sẽ được tạo.
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Thông tin dự án và cột chung
                  </Typography>
                  <Stack spacing={0.75}>
                    {selectedTemplate.projectFields?.length ? (
                      selectedTemplate.projectFields.map((item) => {
                        const definition = PROJECT_FIELD_BLUEPRINTS.find(
                          (field) => field.id === item.fieldId,
                        );
                        const summaryField = state.summaryProjectColumns.find(
                          (column) => column.id === item.summaryProjectColumnId,
                        );
                        return (
                          <Stack
                            key={item.fieldId}
                            direction={{ xs: "column", sm: "row" }}
                            sx={{
                              gap: 0.5,
                              justifyContent: "space-between",
                              p: 1,
                              borderRadius: 1,
                              bgcolor: "background.paper",
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {item.displayLabel || definition?.label || item.fieldId}
                              {(item.displaySuffix || definition?.suffix) && (
                                <Typography
                                  component="span"
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {` · ${item.displaySuffix || definition?.suffix}`}
                                </Typography>
                              )}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Cột chung: {summaryField?.label ?? "Không đưa lên bảng tổng hợp"}
                            </Typography>
                          </Stack>
                        );
                      })
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Không có trường thông tin dự án trong mẫu này.
                      </Typography>
                    )}
                  </Stack>
                </Box>

                <Typography variant="overline" color="text.secondary">
                  Dữ liệu theo tháng
                </Typography>

                {selectedTemplate.fields.length ? (
                  selectedTemplate.fields.map((item) => {
                    const definition = state.fieldDefinitions.find(
                      (field) => field.id === item.fieldId,
                    );
                    const label = item.displayLabel || definition?.label || item.fieldId;
                    const suffix = item.displaySuffix || definition?.suffix;
                    const columnLabels = item.allowedColumnIds.map(
                      (id) => state.monthlyColumns.find((column) => column.id === id)?.label ?? id,
                    );
                    return (
                      <Stack
                        key={item.fieldId}
                        direction={{ xs: "column", sm: "row" }}
                        sx={{
                          gap: 1,
                          alignItems: { sm: "center" },
                          justifyContent: "space-between",
                          p: 1,
                          borderRadius: 1,
                          bgcolor: "background.paper",
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {label}
                            {suffix && (
                              <Typography component="span" variant="caption" color="text.secondary">
                                {" · " + suffix}
                              </Typography>
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Dòng {templateRowNumber(selectedTemplate, item.fieldId)}
                          </Typography>
                        </Box>
                        <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
                          {columnLabels.map((columnLabel) => (
                            <Chip key={columnLabel} size="small" label={columnLabel} />
                          ))}
                        </Stack>
                      </Stack>
                    );
                  })
                ) : (
                  <Alert severity="info">
                    Bảng 12 tháng sẽ bắt đầu trống. Sau khi tạo, hãy vào Cấu hình cấu trúc để bật
                    những trường cần dùng.
                  </Alert>
                )}
              </Stack>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={save}>
          Tạo dự án
        </Button>
      </DialogActions>
    </Dialog>
  );
}
