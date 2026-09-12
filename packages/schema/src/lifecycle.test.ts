import { describe, expect, it } from "vitest";
import { canTransition, normalizeTaskStatus, TASK_STATUSES } from "./lifecycle.js";

describe("task lifecycle v2", () => {
  it("lists the seven states", () => {
    expect(TASK_STATUSES).toEqual([
      "draft",
      "awaiting_authorization",
      "active",
      "needs_human",
      "completed",
      "expired",
      "revoked",
    ]);
  });
  it("normalizes legacy strings", () => {
    expect(normalizeTaskStatus("needs-human")).toBe("needs_human");
    expect(normalizeTaskStatus("ACTIVE")).toBe("active");
    expect(normalizeTaskStatus("bogus")).toBeNull();
  });
  it("lets the agent only narrow", () => {
    expect(canTransition("active", "needs_human", "agent")).toBe(true);
    expect(canTransition("active", "completed", "agent")).toBe(true);
    expect(canTransition("needs_human", "active", "agent")).toBe(false);
    expect(canTransition("draft", "active", "agent")).toBe(false);
  });
  it("requires the owner to re-activate and the operator to revoke", () => {
    expect(canTransition("needs_human", "active", "owner")).toBe(true);
    expect(canTransition("active", "revoked", "operator")).toBe(true);
    expect(canTransition("active", "revoked", "agent")).toBe(false);
  });
  it("treats terminal states as terminal", () => {
    for (const from of ["completed", "expired", "revoked"] as const) {
      for (const to of TASK_STATUSES) expect(canTransition(from, to, "operator")).toBe(false);
    }
  });
});
