export class BoundedCache<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly limit: number) {}

  get size() {
    return this.entries.size;
  }

  has(key: K) {
    return this.entries.has(key);
  }

  get(key: K) {
    const value = this.entries.get(key);
    if (value === undefined || !this.entries.has(key)) return value;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.limit <= 0) return;
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear() {
    this.entries.clear();
  }
}
