import { describe, expect, test } from "bun:test";
import { RateLimiter, type RateLimitRedis } from "./rate-limit";

function createFakeRedis() {
  const values = new Map<string, number>();
  let shouldFail = false;
  let incrementCalls = 0;
  let expireCalls = 0;
  const redis: RateLimitRedis = {
    async incr(key) {
      incrementCalls += 1;
      if (shouldFail) throw new Error("Redis unavailable");
      const next = (values.get(key) ?? 0) + 1;
      values.set(key, next);
      return next;
    },
    async expire() {
      expireCalls += 1;
      if (shouldFail) throw new Error("Redis unavailable");
      return 1;
    },
  };
  return {
    redis,
    values,
    setFailure(value: boolean) {
      shouldFail = value;
    },
    get incrementCalls() {
      return incrementCalls;
    },
    get expireCalls() {
      return expireCalls;
    },
  };
}

describe("bounded Redis rate-limit fallback", () => {
  test("uses the distributed counter while Redis is healthy", async () => {
    const fake = createFakeRedis();
    const limiter = new RateLimiter(fake.redis, { now: () => 60_000 });

    const first = await limiter.check({
      key: "route:client",
      limit: 2,
      fallbackLimit: 1,
      windowSeconds: 60,
    });
    const second = await limiter.check({
      key: "route:client",
      limit: 2,
      fallbackLimit: 1,
      windowSeconds: 60,
    });
    const third = await limiter.check({
      key: "route:client",
      limit: 2,
      fallbackLimit: 1,
      windowSeconds: 60,
    });

    expect(first).toMatchObject({ allowed: true, source: "redis", remaining: 1 });
    expect(second).toMatchObject({ allowed: true, source: "redis", remaining: 0 });
    expect(third).toMatchObject({ allowed: false, source: "redis", remaining: 0 });
    expect(fake.incrementCalls).toBe(3);
    expect(fake.expireCalls).toBe(1);
  });

  test("switches to a stricter local limiter and opens a circuit", async () => {
    let now = 100_000;
    const fake = createFakeRedis();
    fake.setFailure(true);
    const limiter = new RateLimiter(fake.redis, {
      now: () => now,
      redisCooldownMs: 5_000,
      redisTimeoutMs: 10,
    });

    const first = await limiter.check({
      key: "auth:client",
      limit: 60,
      fallbackLimit: 2,
      windowSeconds: 60,
    });
    const second = await limiter.check({
      key: "auth:client",
      limit: 60,
      fallbackLimit: 2,
      windowSeconds: 60,
    });
    const third = await limiter.check({
      key: "auth:client",
      limit: 60,
      fallbackLimit: 2,
      windowSeconds: 60,
    });

    expect(first).toMatchObject({ allowed: true, source: "local", limit: 2 });
    expect(second).toMatchObject({ allowed: true, source: "local", limit: 2 });
    expect(third).toMatchObject({ allowed: false, source: "local", limit: 2 });
    expect(fake.incrementCalls).toBe(1);
    expect(limiter.getHealth()).toMatchObject({
      status: "fallback",
      redisFailures: 1,
      fallbackRequests: 3,
      localEntryCount: 1,
    });

    now += 5_000;
    fake.setFailure(false);
    const recovered = await limiter.check({
      key: "auth:client",
      limit: 60,
      fallbackLimit: 2,
      windowSeconds: 60,
    });
    expect(recovered.source).toBe("redis");
    expect(limiter.getHealth().status).toBe("distributed");
    expect(fake.incrementCalls).toBe(2);
  });

  test("bounds local state and expires inactive identities", async () => {
    let now = 0;
    const fake = createFakeRedis();
    fake.setFailure(true);
    const limiter = new RateLimiter(fake.redis, {
      now: () => now,
      localEntryLimit: 2,
      redisCooldownMs: 60_000,
      redisTimeoutMs: 10,
    });
    const options = {
      limit: 60,
      fallbackLimit: 10,
      windowSeconds: 60,
    };

    await limiter.check({ ...options, key: "one" });
    await limiter.check({ ...options, key: "two" });
    await limiter.check({ ...options, key: "three" });
    expect(limiter.getHealth().localEntryCount).toBe(2);

    now = 60_001;
    await limiter.check({ ...options, key: "four" });
    expect(limiter.getHealth().localEntryCount).toBe(1);
  });
});
