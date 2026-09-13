import { afterEach, expect, it, vi } from "vitest";
import { generateWelcome, staticWelcome } from "./welcome.js";

afterEach(() => vi.unstubAllEnvs());

it("falls back to the fixed greeting when the model is not configured", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const link = "https://app.test/connect?t=abc";
  expect(await generateWelcome({ surface: "telegram", paired: { verifyLink: link } })).toBe(
    staticWelcome({ verifyLink: link }),
  );
  expect(staticWelcome({ verifyLink: link })).toContain(link);
  expect(staticWelcome({ wallet: "0xabc" })).toContain("verified as 0xabc");
  expect(staticWelcome(null)).toMatch(/CustodIA/);
});
