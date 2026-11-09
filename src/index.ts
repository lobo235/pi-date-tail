/**
 * pi-date-tail: your calendar day for pi, without touching the system prompt.
 *
 * pi left the date out of its system prompt so the prompt would not change every day and invalidate a
 * provider's prompt cache. This gives the model the day back as a hidden custom message that
 * `before_agent_start` returns: pi appends it after the user's prompt and keeps it on the transcript, so
 * nothing ahead of it ever changes. It is added once per calendar day, and again after a compaction that
 * summarized it away.
 *
 * Considered and rejected: a `date` system-prompt section (pi renders the base sections on runs that a
 * custom message starts, so the section would come and go, and each flip re-reads the whole conversation
 * on a prefix-caching provider), and a date fixed at launch (stale for a session that crosses midnight).
 */
import type { BeforeAgentStartEventResult, ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { DATE_MESSAGE_TYPE, alreadyDated, renderDateMessage } from "./date-message.ts";
import { api, createWarner, piVersion, versionNotice, type Notify } from "./pi-guard.ts";
import { DATE_TAIL_TZ_ENV, processTimeZone, resolveTimeZone, type ZoneName } from "./time-zone.ts";

/** A `date` section an extension that ran earlier put in the system prompt; when present, it wins. */
export const DATE_SECTION = "date";

/** What date-tail reads from its surroundings, injectable so tests need no real clock or environment. */
export interface DateTailOptions {
  env: NodeJS.ProcessEnv;
  /** The process's own zone, used when `PI_DATE_TAIL_TZ` is unset or empty. */
  processZone: ZoneName;
  clock: () => Date;
  /** The running pi's version; read from the pi package when omitted, and only for the unverified-pi warning. */
  version?: string;
  /** Where a warning goes; `ctx.ui.notify` of the current event when omitted (tests pass their own). */
  notify?: Notify;
}

/** The date message for this prompt, or undefined when the model already has today's or no day can be told. */
function dateMessageFor(
  zone: ZoneName,
  clock: () => Date,
  ctx: ExtensionContext,
  warner: { warn: (key: string, message: string) => void },
): BeforeAgentStartEventResult | undefined {
  let rendered: string;
  try {
    rendered = renderDateMessage(clock(), zone);
  } catch {
    return undefined; // a broken clock costs the date, never the prompt
  }
  // Feature-detected by `typeof` and called through the object: taking the method by reference detaches its receiver,
  // and a call that throws here would silently switch the duplicate check off (the smoke test catches exactly that).
  const branchOf = ctx.sessionManager as { getBranch?: () => SessionEntry[] } | undefined;
  const getBranch =
    typeof branchOf?.getBranch === "function" ? () => branchOf.getBranch!() : api(warner, "ctx.sessionManager.getBranch", undefined as (() => SessionEntry[]) | undefined, undefined);
  let dated = false;
  try {
    dated = getBranch ? alreadyDated(getBranch(), rendered) : false;
  } catch {
    // An unreadable branch adds the message anyway: a repeat is appended, so it invalidates no cache.
  }
  if (dated) return undefined;
  return { message: { customType: DATE_MESSAGE_TYPE, content: rendered, display: false } };
}

/** Validates the zone (throwing on a bad `PI_DATE_TAIL_TZ`) and registers the `before_agent_start` handler. */
export function registerDateTail(pi: ExtensionAPI, options: DateTailOptions): void {
  const zone = resolveTimeZone(options.env[DATE_TAIL_TZ_ENV], options.processZone);
  // Bound to the latest context so one warner serves every prompt, and the version notice lands on the first one.
  let current: ExtensionContext | undefined;
  const warner = createWarner(options.notify ?? ((message, level) => current?.ui?.notify?.(message, level)));
  let announced = false;
  pi.on("before_agent_start", (event, ctx) => {
    current = ctx;
    if (!announced) {
      announced = true;
      const notice = versionNotice(options.version ?? piVersion());
      if (notice) warner.warn("pi-version", notice);
    }
    const sections = (event.systemPromptOptions as { sections?: Record<string, string> } | undefined)?.sections;
    if (sections?.[DATE_SECTION] !== undefined) return undefined;
    return dateMessageFor(zone, options.clock, ctx, warner);
  });
}

/** The extension factory pi calls with its API. */
export default function dateTailExtension(pi: ExtensionAPI): void {
  registerDateTail(pi, { env: process.env, processZone: processTimeZone(), clock: () => new Date() });
}
