import { afterEach, expect, it, vi } from "vitest";
import {
  createClaimToken,
  isAutoLabel,
  isDisconnect,
  isGreeting,
  parseNameCommand,
  readClaimToken,
} from "./names.js";

afterEach(() => vi.unstubAllEnvs());

it("parses name commands and nothing else", () => {
  expect(parseNameCommand("claim alice")).toEqual({ kind: "claim", label: "alice" });
  expect(parseNameCommand("Claim alice.custodia.eth")).toEqual({
    kind: "claim",
    label: "alice.custodia.eth",
  });
  expect(parseNameCommand("is alice available?")).toEqual({ kind: "check", label: "alice" });
  expect(parseNameCommand("check bob-1")).toEqual({ kind: "check", label: "bob-1" });
  expect(parseNameCommand("my name")).toEqual({ kind: "mine" });
  expect(parseNameCommand("release my name")).toEqual({ kind: "release" });
  expect(parseNameCommand("delete my ENS name")).toEqual({ kind: "release" });
  expect(parseNameCommand("what's my ENS name?")).toEqual({ kind: "mine" });
  expect(parseNameCommand("is eth available")).toEqual({ kind: "check", label: "eth" });
  expect(parseNameCommand("claim my eth")).toBeNull();
  expect(parseNameCommand("what is eth doing")).toBeNull();
  expect(parseNameCommand("show my portfolio")).toBeNull();
});

it("claim links are bound to wallet and label and expire", () => {
  vi.stubEnv("SESSION_SECRET", "s");
  const wallet = "0x2222222222222222222222222222222222222222";
  const token = createClaimToken(wallet, "alice");
  expect(readClaimToken(token)).toMatchObject({ wallet, label: "alice" });
  expect(readClaimToken(token, Date.now() + 16 * 60 * 1_000)).toBeNull();
  expect(readClaimToken(`${token}x`)).toBeNull();
  const [body] = token.split(".");
  expect(readClaimToken(`${body}.${createClaimToken(wallet, "bob").split(".")[1]}`)).toBeNull();
});

it("treats the generated wallet-xxxxxxxx label as no name", () => {
  expect(isAutoLabel(null)).toBe(true);
  expect(isAutoLabel("wallet-9e15a220")).toBe(true);
  expect(isAutoLabel("alice")).toBe(false);
});

it("recognises plain greetings only", () => {
  for (const g of ["hi", "Hello!", "hey", "hola", "good morning"]) expect(isGreeting(g)).toBe(true);
  for (const n of ["hi, sell 1 eth", "what is eth doing", "show my portfolio"])
    expect(isGreeting(n)).toBe(false);
});

it("a generated wallet-xxxxxxxx label can be replaced by a real claim", async () => {
  const { createTestDb, tables } = await import("@custodia/db");
  const { claimUserLabel, getStoredUserLabel } = await import("./users.js");
  const ctx = await createTestDb();
  const wallet = "0x9e15a220cc2cfcfa3381c5488434291eb65eaa78" as const;
  await ctx.db.insert(tables.users).values({ wallet, ensLabel: "wallet-9e15a220" });
  await claimUserLabel(ctx.db as never, wallet, "rob");
  expect(await getStoredUserLabel(ctx.db as never, wallet)).toBe("rob");
  // A real name is not replaced.
  await expect(claimUserLabel(ctx.db as never, wallet, "bob")).rejects.toThrow(
    /already claimed rob/,
  );
  await ctx.close();
});

it("recognises disconnect commands only", () => {
  for (const d of ["disconnect", "Unpair", "log out", "reset this chat"])
    expect(isDisconnect(d)).toBe(true);
  for (const n of ["disconnect the vault", "reset my password"])
    expect(isDisconnect(n)).toBe(false);
});
