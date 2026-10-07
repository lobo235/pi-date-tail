import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateUnderTz } from "./test-support.ts";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { DATE_MESSAGE_TYPE, alreadyDated, renderDateMessage } from "./date-message.ts";

// 22:30 on 21 September in Los Angeles is 05:30 on 22 September in UTC and 14:30 on 22 September in Tokyo.
const LATE_EVENING_IN_LOS_ANGELES = new Date("2026-09-22T05:30:00Z");

test("the message gives the calendar day and weekday in the zone, names the zone, and says how to get a time", () => {
  assert.equal(
    renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "America/Los_Angeles"),
    "Current date: 2026-09-21 (Monday), your calendar day in America/Los_Angeles. " +
      "No time is given here: run `TZ=America/Los_Angeles date` when a time matters.",
  );
});

test("the same instant is a different day in a zone east of UTC", () => {
  assert.match(renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "Asia/Tokyo"), /^Current date: 2026-09-22 \(Tuesday\), your calendar day in Asia\/Tokyo\./);
});

test("the message is a day, never a time: two instants of one day render the same text", () => {
  const morning = renderDateMessage(new Date("2026-09-21T14:00:00Z"), "America/Los_Angeles");
  assert.equal(morning, renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "America/Los_Angeles"));
  assert.doesNotMatch(morning, /\d\d:\d\d/);
});

test("without a zone name the day is the process's own, and the command is plain `date`", () => {
  // A TZ that names no zone runs the process (and `date`) in UTC.
  const rendered = evaluateUnderTz("not-a-zone", "./date-message.ts", `mod.renderDateMessage(new Date("2026-09-22T05:30:00Z"), undefined)`);
  assert.equal(
    rendered,
    "Current date: 2026-09-22 (Tuesday), your calendar day in this machine's local time zone. " +
      "No time is given here: run `date` when a time matters.",
  );
});

test("an invalid Date throws, so the caller decides what a broken clock costs", () => {
  assert.throws(() => renderDateMessage(new Date(Number.NaN), "UTC"), RangeError);
});

const dateEntry = (content: string, customType = DATE_MESSAGE_TYPE, id = "d1") =>
  ({ type: "custom_message", id, parentId: null, timestamp: "t", customType, content, display: false }) as SessionEntry;
const userEntry = (id: string) =>
  ({ type: "message", id, parentId: null, timestamp: "t", message: { role: "user", content: "hi", timestamp: 0 } }) as SessionEntry;
/** A compaction that summarized everything before `firstKeptEntryId` and kept the rest. */
const compaction = (firstKeptEntryId: string, id = "c1") =>
  ({ type: "compaction", id, parentId: null, timestamp: "t", summary: "s", firstKeptEntryId, tokensBefore: 1 }) as SessionEntry;

test("today's message counts only when the model still sees it: after the latest compaction, or kept by it (table)", () => {
  const today = renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "America/Los_Angeles");
  const yesterday = renderDateMessage(new Date("2026-09-21T05:30:00Z"), "America/Los_Angeles");
  const todayInTokyo = renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "Asia/Tokyo");
  const cases: Array<{ name: string; branch: SessionEntry[]; dated: boolean }> = [
    { name: "a fresh session", branch: [], dated: false },
    { name: "today's message on the branch", branch: [userEntry("u1"), dateEntry(today), userEntry("u2")], dated: true },
    { name: "only yesterday's message", branch: [dateEntry(yesterday), userEntry("u1")], dated: false },
    { name: "today's message for another zone", branch: [dateEntry(todayInTokyo), userEntry("u1")], dated: false },
    { name: "today's message, then a compaction that may have summarized it away", branch: [dateEntry(today), userEntry("u1"), compaction("u1"), userEntry("u2")], dated: false },
    { name: "a compaction, then today's message", branch: [userEntry("u1"), compaction("u1"), dateEntry(today), userEntry("u2")], dated: true },
    { name: "another extension's message with the same text", branch: [dateEntry(today, "someone-else")], dated: false },
    // pi builds the context from the summary plus the entries from firstKeptEntryId on, so a kept message is still seen.
    { name: "today's message kept by the compaction", branch: [userEntry("u1"), userEntry("u2"), dateEntry(today), userEntry("u3"), compaction("u2"), userEntry("u4")], dated: true },
    { name: "today's message is the first kept entry", branch: [userEntry("u1"), dateEntry(today), userEntry("u2"), compaction("d1")], dated: true },
    { name: "yesterday's message kept by the compaction", branch: [userEntry("u1"), userEntry("u2"), dateEntry(yesterday), userEntry("u3"), compaction("u2"), userEntry("u4")], dated: false },
    { name: "today's message before the first kept entry", branch: [userEntry("u1"), dateEntry(today), userEntry("u2"), compaction("u2"), userEntry("u3")], dated: false },
    { name: "a compaction whose first kept entry is not on the branch", branch: [dateEntry(today), userEntry("u1"), compaction("gone")], dated: false },
    { name: "a first kept entry after the compaction (malformed): only what follows the compaction counts", branch: [dateEntry(today), userEntry("u1"), compaction("u2"), userEntry("u2")], dated: false },
    { name: "today's message kept by an earlier compaction, not by the latest", branch: [userEntry("u1"), dateEntry(today), compaction("d1", "c1"), userEntry("u2"), compaction("u2", "c2")], dated: false },
  ];
  for (const testCase of cases) {
    assert.equal(alreadyDated(testCase.branch, today), testCase.dated, testCase.name);
  }
});
