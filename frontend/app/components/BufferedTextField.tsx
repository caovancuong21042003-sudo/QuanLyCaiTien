import { useEffect, useRef, useState } from "react";
import { TextField, type TextFieldProps } from "@mui/material";

type BufferedTextFieldProps = Omit<TextFieldProps, "value" | "onChange" | "onBlur"> & {
  value: unknown;
  onCommit: (value: string) => void;
  commitDelay?: number;
};

const inputText = (value: unknown) => (value == null ? "" : String(value));

/**
 * Giữ nội dung gõ ở state cục bộ để một ký tự không làm render lại toàn bộ workspace.
 * Dữ liệu vẫn tự lưu sau khi người dùng ngừng gõ hoặc rời khỏi ô nhập.
 */
export function BufferedTextField({
  value,
  onCommit,
  commitDelay = 450,
  onFocus,
  ...props
}: BufferedTextFieldProps) {
  const [draft, setDraft] = useState(() => inputText(value));
  const draftRef = useRef(draft);
  const committedRef = useRef(inputText(value));
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const clearTimer = () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const commit = (next: string) => {
    clearTimer();
    if (next === committedRef.current) return;
    committedRef.current = next;
    onCommitRef.current(next);
  };

  useEffect(() => {
    const next = inputText(value);
    committedRef.current = next;
    if (!focusedRef.current) {
      draftRef.current = next;
      setDraft(next);
    }
  }, [value]);

  useEffect(
    () => () => {
      clearTimer();
      // Điều hướng bằng route có thể tháo field trước khi timer chạy; vẫn phải giữ ký tự cuối.
      if (draftRef.current !== committedRef.current) {
        committedRef.current = draftRef.current;
        onCommitRef.current(draftRef.current);
      }
    },
    [],
  );

  return (
    <TextField
      {...props}
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        draftRef.current = next;
        setDraft(next);
        clearTimer();
        timerRef.current = setTimeout(() => commit(draftRef.current), commitDelay);
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit(draftRef.current);
      }}
    />
  );
}
