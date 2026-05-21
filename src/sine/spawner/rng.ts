export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  gaussian(mean = 0, std = 1) {
    const u = Math.max(this.next(), 1e-9);
    const v = Math.max(this.next(), 1e-9);
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }
}
