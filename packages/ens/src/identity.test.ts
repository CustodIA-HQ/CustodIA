import { expect, it } from "vitest";
import { makeOwnerName, makeTaskName, parseClaimLabel } from "./identity.js";
import { ownerNameFromTaskEns, parseOwnerParam, taskDirectoryPath, taskSlug } from "./paths.js";

it("nests each workflow under the owner identity name", () => {
  expect(makeOwnerName("alice", "custodia.eth")).toBe("alice.custodia.eth");
  expect(makeTaskName("abcd1234", "alice", "custodia.eth")).toBe("abcd1234.alice.custodia.eth");
});

it("accepts a label or a full parent name and rejects reserved names", () => {
  expect(parseClaimLabel("Alice", "custodia.eth")).toEqual({
    ok: true,
    label: "alice",
    name: "alice.custodia.eth",
  });
  expect(parseClaimLabel("alice.custodia.eth", "custodia.eth")).toMatchObject({
    ok: true,
    label: "alice",
  });
  expect(parseClaimLabel("wallet-abcd", "custodia.eth").ok).toBe(false);
  expect(parseClaimLabel("ab", "custodia.eth").ok).toBe(false);
});

it("builds a directory path owner.eth/hash/task-name", () => {
  expect(taskSlug("portfolio_guard")).toBe("portfolio-guard");
  expect(taskDirectoryPath("alice.custodia.eth", "abcd1234", "portfolio_guard")).toBe(
    "/alice.custodia.eth/abcd1234/portfolio-guard",
  );
  expect(ownerNameFromTaskEns("abcd1234.alice.custodia.eth", "abcd1234")).toBe(
    "alice.custodia.eth",
  );
  expect(parseOwnerParam("alice", "custodia.eth")).toEqual({
    label: "alice",
    name: "alice.custodia.eth",
  });
  expect(parseOwnerParam("alice.custodia.eth", "custodia.eth").label).toBe("alice");
});
