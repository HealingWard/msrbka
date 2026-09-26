// Кэш ответов и бережный доступ к магазинам: не чаще одного запроса к магазину в minGapMs,
// одинаковые одновременные запросы склеиваются.

export class TtlCache {
  constructor(ttlMs, max = 500) {
    this.ttl = ttlMs;
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) { this.map.delete(key); return undefined; }
    return e.value;
  }
  set(key, value, ttl = this.ttl) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, exp: Date.now() + ttl });
  }
}

export class Throttle {
  constructor(minGapMs) {
    this.gap = minGapMs;
    this.queues = new Map();
  }
  /** Выполняет fn в очереди ключа key с паузой не менее gap между запусками. */
  run(key, fn) {
    const prev = this.queues.get(key) || Promise.resolve(0);
    const next = prev.then(async (lastAt) => {
      const wait = lastAt + this.gap - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      return Date.now();
    });
    const result = next.then(() => fn());
    this.queues.set(key, result.then(() => Date.now(), () => Date.now()));
    return result;
  }
}

export class Inflight {
  constructor() { this.map = new Map(); }
  run(key, fn) {
    if (this.map.has(key)) return this.map.get(key);
    const p = Promise.resolve().then(fn).finally(() => this.map.delete(key));
    this.map.set(key, p);
    return p;
  }
}

/** Ограничение частоты запросов с одного IP (скользящее окно в минуту). */
export class RateLimit {
  constructor(perMinute) {
    this.limit = perMinute;
    this.hits = new Map();
  }
  allow(ip) {
    const now = Date.now();
    const arr = (this.hits.get(ip) || []).filter((t) => now - t < 60000);
    if (arr.length >= this.limit) { this.hits.set(ip, arr); return false; }
    arr.push(now);
    this.hits.set(ip, arr);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}
