/**
 * xorshift64 RNG. Deterministic per-seed so a run can be replayed or
 * shared just by stashing the seed.
 */
export class SeedRng {
  private state: bigint;

  constructor(seed: bigint | number) {
    const s = typeof seed === 'number' ? BigInt(seed >>> 0) : seed;
    this.state = s === 0n ? 0x9E3779B97F4A7C15n : s;
  }

  nextU32(): number {
    let x = this.state;
    x ^= (x << 13n) & 0xFFFFFFFFFFFFFFFFn;
    x ^= x >> 7n;
    x ^= (x << 17n) & 0xFFFFFFFFFFFFFFFFn;
    this.state = x;
    return Number(x & 0xFFFFFFFFn);
  }

  next01(): number { return this.nextU32() / 0x100000000; }

  rangeInt(minInclusive: number, maxExclusive: number): number {
    const span = maxExclusive - minInclusive;
    return minInclusive + (this.nextU32() % span);
  }

  rangeFloat(min: number, max: number): number {
    return min + this.next01() * (max - min);
  }
}
