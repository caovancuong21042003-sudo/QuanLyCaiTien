import type { KkvState } from "../domain/types";

export interface KkvRepository {
  loadState(): Promise<KkvState>;
  saveState(state: KkvState): Promise<void>;
  resetState(): Promise<KkvState>;
}
