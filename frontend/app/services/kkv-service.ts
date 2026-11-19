import type { KkvState } from "../domain/types";
import type { KkvRepository } from "../repositories/kkv-repository";

export class KkvService {
  constructor(private readonly repository: KkvRepository) {}
  load() {
    return this.repository.loadState();
  }
  save(state: KkvState) {
    return this.repository.saveState(state);
  }
  reset() {
    return this.repository.resetState();
  }
}
