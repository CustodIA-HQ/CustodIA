/**
 * Minimal Chrome DevTools Protocol driver (no dependencies): screenshots with
 * cookies, device emulation and touch input. Usage from other scripts:
 *   const b = await openBrowser(); await b.shot({ url, out, width, cookie, touchAt })
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

type Msg = { id: number; result?: Record<string, unknown>; error?: { message: string } };

export async function openBrowser(port = 9333) {
  const proc = spawn(
    "chromium-browser",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let version: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 50 && !version; i++) {
    try {
      version = (await (
        await fetch(`http://127.0.0.1:${port}/json/version`)
      ).json()) as typeof version;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!version) throw new Error("chromium did not expose CDP");
  const browserWs = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => browserWs.addEventListener("open", r, { once: true }));

  const makeSession = async () => {
    const targetJson = (await (
      await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
    ).json()) as { webSocketDebuggerUrl: string };
    const ws = new WebSocket(targetJson.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    let seq = 0;
    const pending = new Map<number, (m: Msg) => void>();
    const events: Array<{ method: string; params: unknown }> = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as Msg & { method?: string; params?: unknown };
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
      } else if (msg.method) events.push({ method: msg.method, params: msg.params });
    });
    const send = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = ++seq;
        pending.set(id, (m) =>
          m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result ?? {}),
        );
        ws.send(JSON.stringify({ id, method, params }));
      });
    const waitFor = (method: string, timeoutMs = 20000) =>
      new Promise<void>((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => {
          if (events.some((e) => e.method === method)) return resolve();
          if (Date.now() - t0 > timeoutMs) return reject(new Error(`timeout waiting ${method}`));
          setTimeout(tick, 50);
        };
        tick();
      });
    return { send, waitFor, events, close: () => ws.close() };
  };

  const shot = async (opts: {
    url: string;
    out: string;
    width?: number;
    height?: number;
    cookie?: string;
    mobile?: boolean;
    settleMs?: number;
    touchAt?: { selector: string; xRatio: number; yRatio: number };
    fullPage?: boolean;
    click?: string;
    evaluate?: string;
  }) => {
    const s = await makeSession();
    const width = opts.width ?? 1280;
    const height = opts.height ?? 900;
    await s.send("Page.enable");
    await s.send("Network.enable");
    await s.send("Runtime.enable");
    await s.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: !!opts.mobile,
    });
    if (opts.mobile) await s.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    if (opts.cookie) {
      const [name, ...rest] = opts.cookie.split("=");
      await s.send("Network.setCookie", { name, value: rest.join("="), url: opts.url });
    }
    await s.send("Page.navigate", { url: opts.url });
    await s.waitFor("Page.loadEventFired").catch(() => undefined);
    await new Promise((r) => setTimeout(r, opts.settleMs ?? 2500));
    if (opts.click) {
      await s.send("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(opts.click)})?.click()`,
      });
      await new Promise((r) => setTimeout(r, 600));
    }
    if (opts.evaluate) {
      await s.send("Runtime.evaluate", { expression: opts.evaluate, awaitPromise: true });
      await new Promise((r) => setTimeout(r, 600));
    }
    if (opts.touchAt) {
      const rectRes = await s.send("Runtime.evaluate", {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(opts.touchAt.selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }); })()`,
        returnByValue: true,
      });
      const rect = JSON.parse(String((rectRes.result as { value?: string })?.value ?? "null")) as {
        x: number;
        y: number;
        w: number;
        h: number;
      } | null;
      if (rect) {
        const x = rect.x + rect.w * opts.touchAt.xRatio;
        const y = rect.y + rect.h * opts.touchAt.yRatio;
        if (opts.mobile) {
          await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
          await s.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + 20, y }],
          });
        } else {
          await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (opts.fullPage) {
      const m = (await s.send("Page.getLayoutMetrics")) as { cssContentSize?: { height: number } };
      const h = Math.min(Math.ceil(m.cssContentSize?.height ?? height), 6000);
      await s.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: h,
        deviceScaleFactor: 1,
        mobile: !!opts.mobile,
      });
      await new Promise((r) => setTimeout(r, 300));
    }
    const res = (await s.send("Page.captureScreenshot", { format: "png" })) as { data: string };
    writeFileSync(opts.out, Buffer.from(res.data, "base64"));
    const title = String(
      (
        (await s.send("Runtime.evaluate", { expression: "document.title", returnByValue: true }))
          .result as { value?: string }
      )?.value ?? "",
    );
    s.close();
    return { title };
  };

  return {
    shot,
    close: () => {
      browserWs.close();
      proc.kill();
    },
  };
}
