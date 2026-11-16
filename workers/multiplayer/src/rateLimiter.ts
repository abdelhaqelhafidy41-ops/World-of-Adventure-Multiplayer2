import type { ClientMessageType } from '../../../shared/multiplayerProtocol';

interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs?: number;
  violations: number;
}

/**
 * Per-connection and per-IP token bucket rate limiter preventing floods/abuse.
 */
export class ConnectionRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private violations = 0;

  public consume(
    bucketKey: string,
    capacity: number,
    refillPerSecond: number,
    now = Date.now(),
  ): RateLimitDecision {
    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: now };
      this.buckets.set(bucketKey, bucket);
    } else {
      const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSecond);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, violations: this.violations };
    }

    this.violations += 1;
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / Math.max(0.1, refillPerSecond)) * 1000);
    return {
      allowed: false,
      retryAfterMs,
      violations: this.violations,
    };
  }

  public checkMessage(type: ClientMessageType, now = Date.now()): RateLimitDecision {
    // High-frequency 20-30 Hz movement sync vs low-frequency control/event limits
    if (type === 'PLAYER_STATE') {
      return this.consume('msg:player_state', 42, 34, now);
    }
    if (type === 'ENTITY_SYNC') {
      return this.consume('msg:entity_sync', 20, 14, now);
    }
    if (type === 'PING' || type === 'PONG') {
      return this.consume('msg:heartbeat', 12, 3, now);
    }
    if (type === 'GAME_EVENT') {
      return this.consume('msg:game_event', 28, 18, now);
    }
    if (type === 'ROOM_CHAT') {
      return this.consume('msg:chat', 4, 0.75, now);
    }
    if (type === 'PLAYER_REPORT') {
      return this.consume('msg:report', 3, 0.1, now);
    }
    return this.consume('msg:control', 12, 4, now);
  }
}

export class IpRateLimiter {
  private readonly entries = new Map<string, { count: number; windowStartMs: number }>();
  private readonly maxPerWindow: number;
  private readonly windowMs: number;

  constructor(maxPerWindow = 40, windowMs = 60_000) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  public check(ip: string, now = Date.now()): boolean {
    if (this.entries.size > 2000) {
      for (const [k, v] of this.entries) {
        if (now - v.windowStartMs > this.windowMs) {
          this.entries.delete(k);
        }
      }
    }

    const current = this.entries.get(ip);
    if (!current || now - current.windowStartMs >= this.windowMs) {
      this.entries.set(ip, { count: 1, windowStartMs: now });
      return true;
    }

    if (current.count >= this.maxPerWindow) {
      return false;
    }
    current.count += 1;
    return true;
  }
}
