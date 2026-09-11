"use client";
import { useEffect, useRef, useState } from "react";

export interface RunEvent {
  seq: number;
  stage: string;
  type: string;
  payload: unknown;
}
export type RunStatus = "queued" | "running" | "done" | "failed";

export const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  inspecting_wallet: "Inspecting wallet",
  fetching_context: "Fetching live market context",
  paying_analysis: "Paying for risk analysis (x402)",
  generating_ui: "Generating the guard interface",
  awaiting_signature: "Awaiting your signature",
  publishing: "Publishing to ENS",
  done: "Done",
  failed: "Failed",
};

/** Polls GET /api/runs/:id/events every second until the run finishes. Survives reloads: pass the stored runId. */
export function useRun(runId: string | null) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [startedAt] = useState(() => Date.now());
  const last = useRef(0);

  useEffect(() => {
    if (!runId) return;
    let stop = false;
    last.current = 0;
    setEvents([]);
    const poll = async () => {
      if (stop) return;
      const res = await fetch(`/api/runs/${runId}/events?after=${last.current}`);
      if (!res.ok) {
        setStatus("failed");
        return;
      }
      const body = (await res.json()) as { status: RunStatus; events: RunEvent[] };
      if (body.events.length) {
        last.current = body.events[body.events.length - 1]?.seq ?? last.current;
        setEvents((prev) => [...prev, ...body.events]);
      }
      setStatus(body.status);
      if (!stop && body.status !== "done" && body.status !== "failed") setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [runId]);

  const stage = events.length ? (events[events.length - 1]?.stage ?? "queued") : "queued";
  const errorEvent = events.find((e) => e.type === "error")?.payload as
    | { error?: string }
    | undefined;
  const result = events.find((e) => e.type === "result")?.payload as
    | {
        proposalId: string;
        proposalHash: string;
        ensName: string;
        taskId: string;
        rationale: string;
        receipts: unknown[];
      }
    | undefined;
  const text = events
    .filter((e) => e.type === "text")
    .map((e) => (e.payload as { delta?: string })?.delta ?? "")
    .join("");
  return {
    status,
    events,
    stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    text,
    result,
    error: errorEvent?.error ?? null,
    startedAt,
  };
}
