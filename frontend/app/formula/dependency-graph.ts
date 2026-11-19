export class DependencyGraph {
  // `active` là đường đi DFS hiện tại, còn `cache` chứa các nút đã tính xong.
  // Phải tách riêng: nút trong cache là hợp lệ, nút đang active nghĩa là có phụ thuộc vòng.
  private readonly active = new Set<string>();
  private readonly cache = new Map<string, unknown>();

  enter(key: string): boolean {
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }
  leave(key: string): void {
    this.active.delete(key);
  }
  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }
  set(key: string, value: unknown): void {
    this.cache.set(key, value);
  }
  clear(): void {
    this.active.clear();
    this.cache.clear();
  }
}
