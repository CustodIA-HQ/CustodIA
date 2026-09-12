import { afterEach, expect, it, vi } from "vitest";

vi.mock("@custodia/db", () => ({ createDb: () => ({}) }));
vi.mock("@custodia/runtime", () => ({
  enqueueJob: vi.fn(async () => ({ jobId: 1, created: true })),
}));

import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());
it("rejects unauthenticated calls even when the secret is unset", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new Request("https://example.com/api/cron"))).status).toBe(401);
});
it("rejects an incorrect credential", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect(
    (
      await GET(
        new Request("https://example.com/api/cron", { headers: { authorization: "Bearer wrong" } }),
      )
    ).status,
  ).toBe(401);
});
it("enqueues monitor and notify jobs when authorized", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  const res = await GET(
    new Request("https://example.com/api/cron", {
      headers: { authorization: "Bearer test-secret" },
    }),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, simulated: true });
});
