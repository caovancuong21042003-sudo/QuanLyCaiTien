import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createSeedState } from "../data/seed";
import type { KkvState } from "../domain/types";
import { LocalStorageKkvRepository } from "../repositories/local-storage-repository";
import { KkvService } from "../services/kkv-service";

interface KkvContextValue {
  state: KkvState;
  ready: boolean;
  updateState: (updater: (state: KkvState) => KkvState) => void;
  reset: () => Promise<void>;
}

const Context = createContext<KkvContextValue | null>(null);

export function KkvProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => new KkvService(new LocalStorageKkvRepository()), []);
  const [state, setState] = useState<KkvState>(() => createSeedState());
  const [ready, setReady] = useState(false);
  const latestStateRef = useRef(state);
  const readyRef = useRef(ready);
  latestStateRef.current = state;
  readyRef.current = ready;
  useEffect(() => {
    service.load().then((loaded) => {
      setState(loaded);
      setReady(true);
    });
  }, [service]);
  useEffect(() => {
    if (!ready) return;
    // Không stringify và ghi toàn bộ workspace trong cùng nhịp gõ phím.
    const timer = setTimeout(() => {
      void service.save(state);
    }, 500);
    return () => clearTimeout(timer);
  }, [ready, service, state]);
  useEffect(
    () => () => {
      // Flush bản cuối khi provider bị tháo, ví dụ đóng hoặc điều hướng khỏi ứng dụng.
      if (readyRef.current) void service.save(latestStateRef.current);
    },
    [service],
  );
  const updateState = useCallback((updater: (current: KkvState) => KkvState) => {
    // Updater chỉ thay state trong bộ nhớ; repository được ghi trễ ở effect phía trên.
    setState(updater);
  }, []);
  const reset = useCallback(async () => {
    setState(await service.reset());
  }, [service]);
  return (
    <Context.Provider value={{ state, ready, updateState, reset }}>{children}</Context.Provider>
  );
}

export function useKkv() {
  const value = useContext(Context);
  if (!value) throw new Error("useKkv must be used inside KkvProvider");
  return value;
}
