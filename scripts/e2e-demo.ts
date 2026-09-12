import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createDb, tables } from "@custodia/db";
import { type Constraint, constraintsHash, MANDATE_DOMAIN, MANDATE_TYPES } from "@custodia/schema";
import { eq } from "drizzle-orm";
import { privateKeyToAccount } from "viem/accounts";
import { openBrowser } from "./_shot.js";

/**
 * pnpm demo:e2e — drives every product operation against the running app with a
 * funded Sepolia wallet, captures desktop + mobile screenshots (with a touch on
 * the chart), and writes a markdown report. Real testnet actions: ENS claim,
 * paid x402 analyses, ENS task publication, simulate, revoke.
 */
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp/e2e";
mkdirSync(OUT, { recursive: true });
const user = privateKeyToAccount(process.env.ENS_OPERATOR_PRIVATE_KEY as `0x${string}`);
const conversationId = randomUUID();
const db = createDb();
const j = (r: Response) => r.json().catch(() => ({})) as Promise<Record<string, unknown>>;
const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`;
const report: string[] = [
  `# CustodIA end-to-end run — ${new Date().toISOString()}`,
  "",
  `Wallet: ${user.address}`,
  "",
];
const log = (line: string) => {
  console.log(`${at()} ${line}`);
  report.push(line);
};
const issues: string[] = [];
const issue = (s: string) => {
  issues.push(s);
  log(`   ⚠ ISSUE: ${s}`);
};

const CASES: Array<{ id: string; prompt: string; expectProposal: boolean }> = [
  { id: "research", prompt: "What is ETH doing today?", expectProposal: false },
  { id: "holdings", prompt: "Show my Sepolia portfolio", expectProposal: false },
  {
    id: "position_protection",
    prompt: "Protect me if ETH drops more than 15%",
    expectProposal: true,
  },
  { id: "portfolio_guard", prompt: "Keep ETH/USDC inside a 5% drawdown", expectProposal: true },
  {
    id: "collateral_guard",
    prompt: "Protect my collateral if health factor approaches 1.35",
    expectProposal: true,
  },
  { id: "spot_execution", prompt: "Buy 500 USDC of ETH", expectProposal: true },
  { id: "futures_execution", prompt: "Open a small ETH future", expectProposal: true },
  { id: "strategy_compare", prompt: "Compare ETH and USDC allocations", expectProposal: true },
  { id: "needs_human", prompt: "Buy 50000 USDC of ETH", expectProposal: true },
  { id: "unsupported", prompt: "Bridge my ETH to mainnet", expectProposal: false },
];

// E2E_CASES=portfolio_guard,needs_human limits the prompt phase (and skips the static pages) for targeted re-runs.
const ONLY = (process.env.E2E_CASES ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const selectedCases = ONLY.length ? CASES.filter((c) => ONLY.includes(c.id)) : CASES;

const browser = await openBrowser();
const shots = async (name: string, path: string, cookie?: string, touch = false) => {
  const url = `${BASE}${path}`;
  const d = await browser.shot({
    url,
    out: `${OUT}/${name}-desktop.png`,
    width: 1280,
    height: 900,
    cookie,
    settleMs: 3500,
    touchAt: touch ? { selector: ".guard-chart__plot", xRatio: 0.55, yRatio: 0.5 } : undefined,
    fullPage: true,
  });
  const m = await browser.shot({
    url,
    out: `${OUT}/${name}-mobile.png`,
    width: 390,
    height: 844,
    mobile: true,
    cookie,
    settleMs: 3500,
    touchAt: touch ? { selector: ".guard-chart__plot", xRatio: 0.4, yRatio: 0.5 } : undefined,
    fullPage: true,
  });
  log(`   📸 ${name}: ${path}  (title "${d.title}")`);
  if (!d.title) issue(`${name}: empty document title at ${path}`);
  return { d, m };
};

// ── 1. auth ───────────────────────────────────────────────────────────────────
const ch = (await j(
  await post("/api/auth/challenge", { address: user.address, conversationId }),
)) as { message?: string; error?: string };
if (!ch.message) {
  log(`✗ challenge: ${ch.error}`);
  process.exit(1);
}
const vr = await post("/api/auth/verify", {
  address: user.address,
  conversationId,
  message: ch.message,
  signature: await user.signMessage({ message: ch.message }),
});
const cookie = vr.headers.get("set-cookie")?.split(";")[0] as string;
log(`## 1. Sign-in — ${vr.status} ${cookie ? "✓" : "✗"}`);

// ── 2. static pages ───────────────────────────────────────────────────────────
log("## 2. Pages");
for (const [name, path] of ONLY.length
  ? []
  : ([
      ["home", "/"],
      ["chat", "/chat"],
      ["holdings", "/holdings"],
      ["telegram", "/telegram"],
      ["ux-lab", "/ux"],
    ] as const)) {
  await shots(name, path, cookie, name === "ux-lab");
}
for (const c of ONLY.length ? [] : CASES.filter((x) => x.expectProposal)) {
  await shots(`ux-${c.id}`, `/ux/${c.id.replaceAll("_", "-")}`, cookie, true);
}

// ── 3. ENS claim ──────────────────────────────────────────────────────────────
const label = `e2e-${randomBytes(2).toString("hex")}`;
log(`## 3. ENS claim — ${label}.custodia.eth`);
const avail = (await j(
  await fetch(`${BASE}/api/ens/available?label=${label}`, { headers: { cookie } }),
)) as { available?: boolean; name?: string; error?: string };
log(`   available: ${JSON.stringify(avail)}`);
const claimMessage = [
  "CustodIA ENS claim",
  "",
  `Wallet: ${user.address}`,
  `Name: ${avail.name}`,
  "",
  "I confirm this wallet owns this ENS identity.",
  "Task workflows will be published as subnames of this name.",
].join("\n");
const cl = await post(
  "/api/ens/claim",
  { label, message: claimMessage, signature: await user.signMessage({ message: claimMessage }) },
  cookie,
);
const clb = await j(cl);
log(`   POST /api/ens/claim → ${cl.status} ${JSON.stringify(clb).slice(0, 200)}`);
if (!cl.ok) issue(`ENS claim failed: ${JSON.stringify(clb)}`);
let attached = false;
for (let i = 0; i < 40 && !attached; i++) {
  await sleep(3000);
  const [jobRow] = await db
    .select({ status: tables.jobs.status, lastError: tables.jobs.lastError })
    .from(tables.jobs)
    .where(eq(tables.jobs.kind, "ens.attach"))
    .orderBy(tables.jobs.id)
    .limit(1);
  const rows = await db
    .select({ status: tables.jobs.status, lastError: tables.jobs.lastError, id: tables.jobs.id })
    .from(tables.jobs)
    .where(eq(tables.jobs.kind, "ens.attach"));
  const mine = rows.at(-1) ?? jobRow;
  if (mine?.status === "done") attached = true;
  if (mine?.status === "failed") {
    issue(`ens.attach job failed: ${mine.lastError}`);
    break;
  }
}
log(`   ens.attach job: ${attached ? "done ✓" : "not done"}`);
await shots("ens-directory", `/${label}.custodia.eth`, cookie);

// ── 4. chat cases ─────────────────────────────────────────────────────────────
log("## 4. Prompts");
const published: Array<{ id: string; taskId: string; ensName: string; slug: string }> = [];
for (const c of selectedCases) {
  log(`### ${c.id} — "${c.prompt}"`);
  const cr = await post(
    "/api/chat",
    { conversationId, clientRequestId: randomUUID(), message: c.prompt },
    cookie,
  );
  const cb = (await j(cr)) as { runId?: string; error?: string };
  if (!cb.runId) {
    issue(`${c.id}: chat → ${cr.status} ${cb.error}`);
    continue;
  }
  let after = 0;
  let status = "queued";
  let result: Record<string, unknown> | undefined;
  let text = "";
  const stages: string[] = [];
  let intent = "";
  const deadline = Date.now() + 240_000;
  while (status !== "done" && status !== "failed" && Date.now() < deadline) {
    const body = (await j(
      await fetch(`${BASE}/api/runs/${cb.runId}/events?after=${after}`, { headers: { cookie } }),
    )) as {
      status: string;
      events: Array<{ seq: number; stage: string; type: string; payload: Record<string, unknown> }>;
    };
    status = body.status;
    for (const e of body.events ?? []) {
      after = e.seq;
      if (e.type === "stage" && stages.at(-1) !== e.stage) stages.push(e.stage);
      if (e.type === "tool" && (e.payload as { name?: string })?.name === "classify_intent")
        intent = String((e.payload as { output?: { intent?: string } }).output?.intent ?? "");
      if (e.type === "text") text += String((e.payload as { delta?: string }).delta ?? "");
      if (e.type === "result") result = e.payload;
      if (e.type === "error")
        issue(`${c.id}: run error ${JSON.stringify(e.payload).slice(0, 200)}`);
    }
    if (status !== "done" && status !== "failed") await sleep(1500);
  }
  log(`   intent=${intent} status=${status} stages=${stages.join("→")}`);
  log(`   agent: ${JSON.stringify((text || String(result?.rationale ?? "")).slice(0, 220))}`);
  if (status !== "done") {
    issue(`${c.id}: run ${status}`);
    continue;
  }
  const proposalId = result?.proposalId as string | null;
  if (c.expectProposal !== Boolean(proposalId))
    issue(`${c.id}: expected proposal=${c.expectProposal}, got ${Boolean(proposalId)}`);
  if (!proposalId) continue;

  const pr = (await j(
    await fetch(`${BASE}/api/proposals/${proposalId}`, { headers: { cookie } }),
  )) as {
    hash: string;
    uiSpec: { intent: string; components: Array<Record<string, unknown>> };
    proposal: { taskId: string; ensName: string; agent: `0x${string}`; template: string };
  };
  const find = (t: string) =>
    pr.uiSpec.components.find((x) => x.type === t) as Record<string, unknown> | undefined;
  log(
    `   proposal ${proposalId.slice(0, 8)} template=${pr.proposal.template} uiSpec.intent=${pr.uiSpec.intent} components=${pr.uiSpec.components.map((x) => x.type).join(",")}`,
  );
  const constraints: Constraint[] = [
    { type: "custodia.allowed_assets.1", assets: ["ETH", "USDC"] },
    { type: "custodia.max_drawdown_pct.1", value: Number(find("range_slider")?.max ?? 0) },
    { type: "custodia.max_trade_usd.1", value: Number(find("amount_selector")?.max ?? 0) },
    {
      // The demo's refusal moment needs a mandate that *allows* rebalancing so the
      // $50 simulate passes on size and the $50,000 one fails on the trade cap.
      type: "custodia.allow_rebalance.1",
      value:
        c.id === "portfolio_guard" ? true : Boolean(find("permission_toggle")?.default ?? false),
    },
  ];
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 24 * 3600;
  const mandate = {
    kind: "custodia.mandate.task.1",
    taskId: pr.proposal.taskId,
    owner: user.address,
    agent: pr.proposal.agent,
    ens: pr.proposal.ensName,
    constraints,
    iat,
    exp,
  };
  const sig = await user.signTypedData({
    domain: MANDATE_DOMAIN,
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: {
      kind: mandate.kind,
      taskId: mandate.taskId,
      owner: mandate.owner,
      agent: mandate.agent,
      ens: mandate.ens,
      constraintsHash: constraintsHash(constraints),
      iat: BigInt(iat),
      exp: BigInt(exp),
    },
  });
  const mr = await post(
    "/api/mandate",
    { conversationId, proposalId, mandate, signature: sig },
    cookie,
  );
  const mb = (await j(mr)) as { error?: string; ensName?: string };
  log(`   mandate → ${mr.status} ${mr.ok ? mb.ensName : JSON.stringify(mb)}`);
  const authorizable =
    pr.uiSpec.intent !== "needs_human" && pr.uiSpec.intent !== "compare_strategies";
  if (!authorizable) {
    if (mr.status !== 409) issue(`${c.id}: non-authorizable proposal was accepted (${mr.status})`);
    else log("   ✓ correctly refused: proposal grants no authority");
    continue;
  }
  if (!mr.ok) {
    issue(`${c.id}: mandate rejected: ${mb.error}`);
    continue;
  }
  let task: { status: string } | undefined;
  for (let i = 0; i < 50; i++) {
    [task] = await db
      .select({ status: tables.tasks.status })
      .from(tables.tasks)
      .where(eq(tables.tasks.id, pr.proposal.taskId));
    if (task?.status === "active") break;
    await sleep(3000);
  }
  log(`   task ${pr.proposal.taskId} → ${task?.status}`);
  if (task?.status !== "active") {
    issue(`${c.id}: task never became active (${task?.status})`);
    continue;
  }
  const slug = pr.proposal.template.replaceAll("_", "-");
  published.push({ id: c.id, taskId: pr.proposal.taskId, ensName: pr.proposal.ensName, slug });
  const ownerName = pr.proposal.ensName.split(".").slice(1).join(".");
  await shots(
    `task-${c.id}-directory`,
    `/${ownerName}/${pr.proposal.taskId}/${slug}`,
    cookie,
    true,
  );
  await shots(`task-${c.id}-review`, `/task/${pr.proposal.taskId}`, cookie);
  await shots(`task-${c.id}-guard`, `/guard/${pr.proposal.ensName}`, cookie, true);
}

// ── 5. simulate + revoke on the first active task ─────────────────────────────
log("## 5. Simulate + revoke");
const target = published.find((p) => p.id === "portfolio_guard") ?? published[0];
if (target) {
  const inside = await j(
    await post(`/api/tasks/${target.taskId}/simulate`, { notionalUsd: 50 }, cookie),
  );
  const outside = await j(
    await post(`/api/tasks/${target.taskId}/simulate`, { notionalUsd: 50_000 }, cookie),
  );
  log(`   simulate $50 → ${JSON.stringify(inside).slice(0, 160)}`);
  log(`   simulate $50,000 → ${JSON.stringify(outside).slice(0, 160)}`);
  if ((inside as { decision?: { allowed?: boolean } }).decision?.allowed !== true)
    issue(
      `simulate $50 was not allowed: ${JSON.stringify((inside as { decision?: unknown }).decision)}`,
    );
  if ((outside as { decision?: { allowed?: boolean } }).decision?.allowed !== false)
    issue("simulate $50,000 was not denied");
  const msg = `CustodIA revoke task ${target.taskId}`;
  const rv = await post(
    `/api/tasks/${target.taskId}/revoke`,
    { message: msg, signature: await user.signMessage({ message: msg }) },
    cookie,
  );
  log(`   revoke → ${rv.status} ${JSON.stringify(await j(rv)).slice(0, 160)}`);
  if (!rv.ok) issue("revoke failed");
  const again = await j(
    await post(`/api/tasks/${target.taskId}/simulate`, { notionalUsd: 50 }, cookie),
  );
  log(`   simulate after revoke → ${JSON.stringify(again).slice(0, 120)}`);
  await shots(`task-${target.id}-revoked`, `/task/${target.taskId}`, cookie);
  await shots(`audit-${target.id}`, `/audit/${target.taskId}`, cookie);
} else {
  issue("no task was published; simulate/revoke skipped");
}

report.push("", "## Issues", ...(issues.length ? issues.map((s) => `- ${s}`) : ["- none"]));
writeFileSync(`${OUT}/report.md`, report.join("\n"));
browser.close();
log(`DONE — ${issues.length} issue(s). Report: ${OUT}/report.md`);
process.exit(0);
