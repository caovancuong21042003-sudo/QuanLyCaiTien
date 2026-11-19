import { CURRENT_SCHEMA_VERSION, createSeedState } from "../data/seed";
import type { KkvState } from "../domain/types";
import { isValidKkvState } from "../domain/state-validation";
import type { KkvRepository } from "./kkv-repository";

const STORAGE_KEY = "kkv-planning-state";

export function migrateState(input: unknown): KkvState {
  if (isValidKkvState(input, CURRENT_SCHEMA_VERSION)) return input;
  // Giai đoạn thử nghiệm: schema mới luôn bắt đầu từ seed sạch, không mang theo snapshot cũ.
  return createSeedState();
}

export class LocalStorageKkvRepository implements KkvRepository {
  async loadState(): Promise<KkvState> {
    if (typeof window === "undefined") return createSeedState();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedState();
      await this.saveState(seed);
      return seed;
    }

    try {
      const state = migrateState(JSON.parse(raw));
      await this.saveState(state);
      return state;
    } catch {
      return this.resetState();
    }
  }

  async saveState(state: KkvState): Promise<void> {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  async resetState(): Promise<KkvState> {
    const seed = createSeedState();
    await this.saveState(seed);
    return seed;
  }
}
