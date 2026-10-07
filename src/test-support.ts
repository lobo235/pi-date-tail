/** Test helpers: an in-memory fake of the slice of pi date-tail uses, and a fresh process under a given `TZ`. */
import { execFileSync } from "node:child_process";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

type Handler = (event: unknown, ctx: unknown) => unknown;

/** A fake pi: records `pi.on` registrations and dispatches events the way pi does, last result wins. */
export function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const api = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
  };
  /** Dispatches `event` with a context whose session branch is `getBranch()`; resolves the last handler result. */
  async function emit(event: string, payload: unknown, getBranch: () => SessionEntry[] = () => []): Promise<unknown> {
    const ctx = { sessionManager: { getBranch } };
    let result: unknown;
    for (const handler of handlers.get(event) ?? []) result = (await handler(payload, ctx)) ?? result;
    return result;
  }
  return { pi: api as unknown as ExtensionAPI, emit, events: () => [...handlers.keys()] };
}

/** A before_agent_start event as pi builds it: the prompt, its rendered system prompt and its mutable sections. */
export function agentStart(sections: Record<string, string> = {}) {
  return { type: "before_agent_start", prompt: "hi", systemPrompt: "", systemPromptOptions: { sections } };
}

/**
 * Evaluates `expression` in a fresh node process with `TZ` set to `tz`, after importing the module at
 * `modulePath` (relative to src/) as `mod`. Returns what the expression printed.
 */
export function evaluateUnderTz(tz: string, modulePath: string, expression: string): string {
  const moduleUrl = new URL(modulePath, import.meta.url).href;
  const script = `const mod = await import(${JSON.stringify(moduleUrl)}); console.log(String(${expression}));`;
  return execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim();
}
