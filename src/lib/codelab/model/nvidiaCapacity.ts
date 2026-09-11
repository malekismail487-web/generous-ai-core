/** Delivery pacing only. This module grants no cognition or executor authority. */
export const NVIDIA_CAPACITY_POLICY = Object.freeze({
  requestsPerMinute: 40, minimumStartIntervalMs: 1501, fallbackRetryAfterMs: 60_000,
  defaultRequestLifetimeMs: 300_000, maxPendingRequests: 128,
  scope: "PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT", crossProcessCoordination: false,
  credentialAccess: false, authorityGranted: false,
} as const);

export interface CapacityClock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("cancelled", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException("cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

const hostClock: CapacityClock = { now: Date.now, sleep };

/** RFC 9110: delay-seconds or HTTP-date. Invalid/missing values use a conservative fallback. */
export function nvidiaRetryAfterMs(value: string | null, now: number): number {
  const input = value?.trim() ?? "";
  if (/^\d+$/.test(input)) {
    const seconds = Number(input);
    return seconds > Number.MAX_SAFE_INTEGER / 1000 ? Number.MAX_SAFE_INTEGER : seconds * 1000;
  }
  // Accept HTTP date shapes, not Date.parse's permissive interpretation of numeric/malformed values.
  const dateShape = /^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/;
  const date = dateShape.test(input) ? Date.parse(input) : NaN;
  return Number.isFinite(date) ? Math.max(0, date - now) : NVIDIA_CAPACITY_POLICY.fallbackRetryAfterMs;
}

export interface NvidiaCapacityAdmission {
  readonly state: "ADMITTED" | "WAITING_FOR_CAPACITY" | "CANCELLED";
  readonly waitedMs: number;
  readonly notBeforeEpochMs: number | null;
}

export class NvidiaCapacityCoordinator {
  #nextStart = 0;
  #cooldownUntil = 0;
  #pending = 0;
  readonly clock: CapacityClock;
  constructor(clock: CapacityClock = hostClock) {
    this.clock = Object.freeze({ now: clock.now.bind(clock), sleep: clock.sleep.bind(clock) });
  }

  defer(retryAfter: string | null): void {
    const now = this.clock.now();
    this.#cooldownUntil = Math.max(this.#cooldownUntil,
      Math.min(Number.MAX_SAFE_INTEGER, now + nvidiaRetryAfterMs(retryAfter, now)));
  }

  recordDispatch(): void {
    // A stalled event loop can delay an admitted request. Pace from the actual synchronous dispatch too.
    this.#nextStart = Math.max(this.#nextStart, this.clock.now() + NVIDIA_CAPACITY_POLICY.minimumStartIntervalMs);
  }

  async acquire(deadline: number, signal: AbortSignal): Promise<NvidiaCapacityAdmission> {
    const started = this.clock.now();
    const result = (state: NvidiaCapacityAdmission["state"], notBeforeEpochMs: number | null = null) =>
      Object.freeze({ state, waitedMs: Math.max(0, this.clock.now() - started), notBeforeEpochMs });
    if (signal.aborted) return result("CANCELLED");
    if (this.#pending >= NVIDIA_CAPACITY_POLICY.maxPendingRequests) return result("WAITING_FOR_CAPACITY");
    this.#pending += 1;
    try {
      while (true) {
        if (signal.aborted) return result("CANCELLED");
        const now = this.clock.now();
        const notBefore = Math.max(this.#nextStart, this.#cooldownUntil);
        if (now >= deadline || notBefore >= deadline) return result("WAITING_FOR_CAPACITY", Math.max(now, notBefore));
        if (now >= notBefore) {
          // No await between check and reservation: concurrent callers cannot consume the same slot.
          this.#nextStart = now + NVIDIA_CAPACITY_POLICY.minimumStartIntervalMs;
          return result("ADMITTED");
        }
        // Capped sleeps avoid timer overflow; every wake rechecks cancellation, cooldown and expiry.
        await this.clock.sleep(Math.min(notBefore - now, deadline - now, 60_000), signal);
      }
    } catch { return result("CANCELLED"); }
    finally { this.#pending -= 1; }
  }
}

// All live provider instances share the same gate. Other processes/account clients still require server 429 handling.
export const liveNvidiaCapacity = new NvidiaCapacityCoordinator();
