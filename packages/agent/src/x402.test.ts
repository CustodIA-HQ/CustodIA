import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: execute }));

import { paidFetch } from "./x402.js";

const offer = {
  scheme: "exact",
  network: "hedera:testnet",
  asset: "0.0.0",
  amount: "10000000",
  payTo: "0.0.123",
};
const challenge = (accepts: unknown[]) =>
  new Response(null, {
    status: 402,
    headers: {
      "payment-required": Buffer.from(JSON.stringify({ accepts })).toString("base64"),
    },
  });

beforeEach(() => {
  vi.stubEnv("RISK_API_PAYTO", "0.0.123");
  vi.stubEnv("HEDERA_NETWORK", "hedera:testnet");
  execute.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("payment authorization and signer failure", () => {
  it("signs an approved offer and retries with its signature", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(challenge([offer]))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const end = vi.fn();
    execute.mockImplementation((_runner, _args, _options, callback) => {
      queueMicrotask(() => callback(null, "signed-header"));
      return { stdin: { on: vi.fn(), end } };
    });
    expect((await paidFetch("https://risk.example")).data).toEqual({ ok: true });
    expect(end).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1][1].headers["payment-signature"]).toBe("signed-header");
  });
  it.each([
    { amount: "10000001" },
    { payTo: "0.0.999" },
    { asset: "0.0.1" },
    { network: "hedera:mainnet" },
    { scheme: "other" },
  ])("rejects an unapproved offer before starting the signer: %j", async (change) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(challenge([{ ...offer, ...change }])));
    await expect(paidFetch("https://risk.example")).rejects.toThrow("approved risk payment");
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects additional offers instead of letting the SDK select a different payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(challenge([offer, { ...offer, amount: "99999999" }])),
    );
    await expect(paidFetch("https://risk.example")).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it("fails closed without a trusted recipient", async () => {
    vi.stubEnv("RISK_API_PAYTO", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(challenge([offer])));
    await expect(paidFetch("https://risk.example")).rejects.toThrow("RISK_API_PAYTO");
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects a failed signer and releases the queue for the next request", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => challenge([offer]));
    vi.stubGlobal("fetch", fetchMock);
    execute.mockImplementation((_runner, _args, options, callback) => {
      expect(options.timeout).toBe(30_000);
      expect(options.killSignal).toBe("SIGKILL");
      queueMicrotask(() => callback(new Error("child exited"), ""));
      return { stdin: { on: vi.fn(), end: vi.fn() } };
    });
    await expect(paidFetch("https://risk.example")).rejects.toThrow("Signer failed");
    await expect(paidFetch("https://risk.example")).rejects.toThrow("Signer failed");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
