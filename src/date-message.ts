/** The date message: its persisted type, its text, and whether the model already has today's. */
import type { CompactionEntry, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { ZoneName } from "./time-zone.ts";

/** `customType` of the date message on the transcript. Persisted, so part of the SemVer contract. */
export const DATE_MESSAGE_TYPE = "date-tail";

/**
 * The message text for `now` in `zone`: a calendar day and weekday, never a time, so it changes once a day.
 * It names the zone and the command that gives a time. Throws a RangeError for an invalid Date.
 */
export function renderDateMessage(now: Date, zone: ZoneName): string {
  // Assembled from parts rather than a locale's pattern, which ICU releases have changed before.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" })
    .formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  const weekday = part("weekday");
  const where = zone ?? "this machine's local time zone";
  const command = zone === undefined ? "date" : `TZ=${zone} date`;
  return `Current date: ${day} (${weekday}), your calendar day in ${where}. ` +
    `No time is given here: run \`${command}\` when a time matters.`;
}

/**
 * Whether `rendered` is already in the model's context. pi builds the context from the latest compaction's
 * summary plus the entries from its `firstKeptEntryId` on, so a date message with exactly that text counts when
 * it is after the latest compaction or in the range that compaction kept. One the summary replaced may be gone,
 * and adding one short message again costs less than a model that has lost the date.
 */
export function alreadyDated(branch: readonly SessionEntry[], rendered: string): boolean {
  return branch.slice(firstEntryInContext(branch)).some((entry) =>
    entry.type === "custom_message" && entry.customType === DATE_MESSAGE_TYPE && entry.content === rendered);
}

/**
 * The index of the oldest branch entry the model still sees: the latest compaction's first kept entry, or the
 * entry after that compaction when its first kept entry is not on the branch (nothing is assumed kept then).
 */
function firstEntryInContext(branch: readonly SessionEntry[]): number {
  const compactionIndex = branch.findLastIndex((entry) => entry.type === "compaction");
  if (compactionIndex < 0) return 0;
  const { firstKeptEntryId } = branch[compactionIndex] as CompactionEntry;
  const keptIndex = branch.findIndex((entry) => entry.id === firstKeptEntryId);
  return keptIndex >= 0 && keptIndex < compactionIndex ? keptIndex : compactionIndex + 1;
}
