/**
 * A Chrome that stays open between runs.
 *
 * Launching and killing a browser per run costs ~15s of startup and throws away
 * the HTTP cache, which made every measurement start cold. This connects to an
 * already-running instance when there is one and only spawns a browser if the
 * debugging port is dead. Nothing here ever kills Chrome.
 */

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
export const DEBUG_PORT = Number(process.env.CHROME_PORT ?? 9333);
// One profile per port: Chrome refuses to share a profile directory between two
// running instances, and a second instance (CHROME_PORT=9334) is how a script
// runs next to the action suite without the two fighting over one window,
// where background tabs get throttled or discarded mid-run.
const PROFILE =
  DEBUG_PORT === 9333
    ? `${process.env.TEMP ?? "."}\\krauss-debug-chrome`
    : `${process.env.TEMP ?? "."}\\krauss-debug-chrome-${DEBUG_PORT}`;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TargetInfo {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

async function listTargets(): Promise<TargetInfo[]> {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  return (await res.json()) as TargetInfo[];
}

async function portAlive(): Promise<boolean> {
  try {
    await listTargets();
    return true;
  } catch {
    return false;
  }
}

/** Start Chrome only if the debugging port is not already answering. */
export async function ensureBrowser(): Promise<void> {
  if (await portAlive()) {
    return;
  }
  const spawn = (
    globalThis as unknown as {
      Bun: { spawn: (cmd: string[], o: unknown) => unknown };
    }
  ).Bun.spawn;
  spawn(
    [
      CHROME,
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=CalculateNativeWinOcclusion",
      "--window-size=1500,950",
      "about:blank",
    ],
    { stdout: "ignore", stderr: "ignore" }
  );
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await portAlive()) {
      return;
    }
  }
  throw new Error("Chrome debugging port never came up");
}

async function sharedTab(): Promise<TargetInfo> {
  // Reuse the tab that is already on the app, so the HTTP cache and the
  // warmed bundle survive between runs.
  const targets = await listTargets();
  const target =
    targets.find(
      (t) => t.type === "page" && t.url.includes("/postal-codes/")
    ) ?? targets.find((t) => t.type === "page");
  if (!target) {
    throw new Error("no page target to attach to");
  }
  return target;
}

async function privateTab(name: string): Promise<TargetInfo> {
  const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
  const idFile = `${PROFILE}-tab-${name}.id`;
  const targets = await listTargets();
  if (existsSync(idFile)) {
    const id = readFileSync(idFile, "utf-8").trim();
    const known = targets.find((t) => t.id === id && t.type === "page");
    if (known) {
      return known;
    }
  }
  const res = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`,
    { method: "PUT" }
  );
  const created = (await res.json()) as TargetInfo;
  writeFileSync(idFile, created.id);
  return created;
}

export class Cdp {
  static consoleEvents: { text: string }[] = [];
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
        result?: Record<string, unknown>;
        error?: { message: string };
      };
      if (msg.id === undefined) {
        if (
          msg.method === "Runtime.consoleAPICalled" ||
          msg.method === "Runtime.exceptionThrown"
        ) {
          const params = msg.params ?? {};
          const args =
            (params.args as { value?: unknown; description?: string }[]) ?? [];
          const details = params.exceptionDetails as
            | { text?: string; exception?: { description?: string } }
            | undefined;
          const text =
            args.map((a) => {
              const val = a.value ?? a.description ?? "";
              if (typeof val === "string") return val;
              if (val === "") return "";
              return JSON.stringify(val);
            }).join(" ") ||
            details?.exception?.description ||
            details?.text ||
            "";
          if (text) {
            Cdp.consoleEvents.push({ text: text.slice(0, 3000) });
          }
        }
        return;
      }
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result ?? {});
    });
  }

  /**
   * Attach to the shared app tab, or — with `tab` — to a private tab of that
   * name. Two scripts driving one tab fight over focus, dialogs and the page
   * lock, so anything that runs next to the action suite should pass a name.
   * The private tab is remembered by id and reused on the next run.
   */
  static async attach(url: string, options: { tab?: string } = {}): Promise<Cdp> {
    await ensureBrowser();

    const target = options.tab
      ? await privateTab(options.tab)
      : await sharedTab();

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("ws error")));
    });
    const cdp = new Cdp(socket);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    // Reusing the browser also reuses its HTTP cache, which happily serves the
    // previous build's chunks after a rebuild. Disable it for the session so a
    // run always measures the code that was just built.
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    const current = await cdp.evaluate<string>("location.href");
    if (current.startsWith(url)) {
      await cdp.send("Page.reload", { ignoreCache: true });
    } else {
      await cdp.send("Page.navigate", { url });
    }
    await sleep(2500);
    // Only the document and its chunks need to bypass the cache; leaving it off
    // makes every tile and glyph refetch and slows a run to a crawl.
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
    return cdp;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const r = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: { text: string } };
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text);
    }
    return r.result?.value as T;
  }

  async screenshot(path: string): Promise<void> {
    const r = (await this.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 55,
    })) as { data?: string };
    if (r.data) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(path, Buffer.from(r.data, "base64"));
    }
  }

  /** Close the socket only. The browser stays running for the next run. */
  detach(): void {
    this.socket.close();
  }

  async waitFor(
    expression: string,
    timeoutMs = 60_000,
    intervalMs = 500
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate<boolean>(expression)) {
          return true;
        }
      } catch {
        // page may be mid-navigation
      }
      await sleep(intervalMs);
    }
    return false;
  }
}
