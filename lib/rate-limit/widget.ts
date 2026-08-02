type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

export function consumeWidgetRateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }
  existing.count += 1;
  if (buckets.size > 5_000) {
    for (const [bucketKey, entry] of buckets) if (entry.resetAt <= now) buckets.delete(bucketKey);
  }
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
  };
}

export function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
