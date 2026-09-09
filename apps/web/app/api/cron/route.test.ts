import { afterEach, expect, it, vi } from "vitest";
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
it("reports the watcher as unimplemented without database access", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect(
    (
      await GET(
        new Request("https://example.com/api/cron", {
          headers: { authorization: "Bearer test-secret" },
        }),
      )
    ).status,
  ).toBe(501);
});
