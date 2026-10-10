/** Test helpers: an in-memory fake of the slice of pi date-tail uses, and a fresh process under a given `TZ`. */
import { execFileSync } from "node:child_process";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

type Handler = (event: unknown, ctx: unknown) => unknown;

/**
 * A fake pi: records `pi.on` registrations and dispatches before_agent_start the way pi does: every handler in
 * registration order, each seeing earlier handlers' changes to the event, and every returned `message` collected.
 */
export function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const api = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
  };
  /** Dispatches `event` with a context whose session branch is `getBranch()`; resolves the messages handlers returned. */
  async function emit(event: string, payload: unknown, getBranch: () => SessionEntry[] = () => []): Promise<unknown[]> {
    const ctx = { sessionManager: { getBranch } };
    const messages: unknown[] = [];
    for (const handler of handlers.get(event) ?? []) {
      const result = (await handler(payload, ctx)) as { message?: unknown } | undefined;
      if (result?.message) messages.push(result.message);
    }
    return messages;
  }
  return { pi: api as unknown as ExtensionAPI, emit, events: () => [...handlers.keys()] };
}

/** A before_agent_start event as pi builds it: the prompt, its rendered system prompt and its mutable sections. */
export function agentStart(sections: Record<string, string> = {}) {
  return { type: "before_agent_start", prompt: "hi", systemPrompt: "", systemPromptOptions: { sections } };
}

/**
 * Evaluates `expression` in a fresh node process with `TZ` set to `tz` (unset when `tz` is undefined), after importing the module at
 * `modulePath` (relative to src/) as `mod`. Returns what the expression printed.
 */
export function evaluateUnderTz(tz: string | undefined, modulePath: string, expression: string): string {
  const moduleUrl = new URL(modulePath, import.meta.url).href;
  const script = `const mod = await import(${JSON.stringify(moduleUrl)}); console.log(String(${expression}));`;
  const { TZ: _inherited, ...env } = process.env;
  return execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: tz === undefined ? env : { ...env, TZ: tz }, encoding: "utf8" }).trim();
}
