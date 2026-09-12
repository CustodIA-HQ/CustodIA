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

/** Connects to the SSE stream at GET /api/runs/:id/events and accumulates events. */
export function useRun(runId: string | null) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [startedAt] = useState(() => Date.now());
  const last = useRef(0);

  useEffect(() => {
    if (!runId) return;
    last.current = 0;
    setEvents([]);
    setStatus(null);

    const url = `/api/runs/${runId}/events?after=0`;
    const source = new EventSource(url);

    source.onmessage = (ev: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      // Sentinel emitted by the SSE route when the run reaches a terminal state
      if (
        parsed &&
        typeof parsed === "object" &&
        "done" in parsed &&
        (parsed as { done: boolean }).done
      ) {
        const sentinel = parsed as { status?: RunStatus };
        if (sentinel.status) setStatus(sentinel.status);
        source.close();
        return;
      }
      // Regular run_event row
      const event = parsed as RunEvent;
      if (typeof event.seq === "number") {
        last.current = Math.max(last.current, event.seq);
        setEvents((prev) => [...prev, event]);
      }
    };

    source.onerror = () => {
      // Network drop or Vercel 45 s timeout — fall back to a single JSON poll.
      source.close();
      void fetch(`/api/runs/${runId}/events?after=${last.current}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { status?: RunStatus; events?: RunEvent[] } | null) => {
          if (!body) return;
          if (body.events?.length) {
            setEvents((prev) => [...prev, ...(body.events ?? [])]);
          }
          if (body.status) setStatus(body.status);
        })
        .catch(() => undefined);
    };

    return () => {
      source.close();
    };
  }, [runId]);

  const stage = events.length ? (events[events.length - 1]?.stage ?? "queued") : "queued";
  const errorEvent = events.find((e) => e.type === "error")?.payload as
    | { error?: string }
    | undefined;
  const result = events.find((e) => e.type === "result")?.payload as
    | {
        proposalId: string | null;
        proposalHash: string | null;
        ensName: string | null;
        taskId: string | null;
        rationale: string;
        receipts: unknown[];
      }
    | undefined;
  const text = events
    .filter((e) => e.type === "text")
    .map((e) => (e.payload as { delta?: string })?.delta ?? "")
    .join("");

  const toolOutput = (name: string): unknown => {
    const matches = events.filter((e) => {
      if (e.type !== "tool") return false;
      const p = e.payload as { name?: string; output?: unknown } | undefined;
      return p?.name === name && p.output != null;
    });
    const output = (matches.at(-1)?.payload as { output?: unknown } | undefined)?.output;
    if (typeof output === "string") {
      try {
        return JSON.parse(output);
      } catch {
        return undefined;
      }
    }
    return output;
  };

  const portfolio = toolOutput("read_portfolio") as
    | {
        chain?: string;
        owner?: string;
        block?: string;
        eth?: string;
        usdc?: string;
        scope?: string;
      }
    | undefined;

  const market = toolOutput("get_market_context") as
    | { pair?: string; priceUsd?: number; hourly?: Array<{ ts: number; close: number }> }
    | undefined;

  const options = events.find((e) => {
    if (e.type !== "tool") return false;
    const p = e.payload as { name?: string; output?: unknown } | undefined;
    return p?.name === "quick_options";
  })?.payload as { output?: { question: string; choices: string[] } } | undefined;

  return {
    status,
    events,
    stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    text,
    result,
    portfolio,
    market,
    options: options?.output,
    error: errorEvent?.error ?? null,
    startedAt,
  };
}
