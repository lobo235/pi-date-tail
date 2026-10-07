import { test } from "node:test";
import assert from "node:assert/strict";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import dateTailExtension, { DATE_SECTION, registerDateTail } from "./index.ts";
import { DATE_MESSAGE_TYPE, renderDateMessage } from "./date-message.ts";
import { DATE_TAIL_TZ_ENV } from "./time-zone.ts";
import { agentStart, fakePi } from "./test-support.ts";

// 22:30 on 21 September in Los Angeles; 22 September in UTC and Tokyo.
const LATE_EVENING_IN_LOS_ANGELES = new Date("2026-09-22T05:30:00Z");
const LOS_ANGELES = { env: { [DATE_TAIL_TZ_ENV]: "America/Los_Angeles" }, processZone: "Asia/Tokyo", clock: () => LATE_EVENING_IN_LOS_ANGELES };

/** The content of the one message date-tail returned, or undefined when it returned none. */
const contentOf = (messages: unknown[]): unknown => (messages[0] as { content?: unknown } | undefined)?.content;

test("a prompt gets the day as a hidden date-tail message, and the system prompt is left alone", async () => {
  const { pi, emit } = fakePi();
  registerDateTail(pi, LOS_ANGELES);
  const event = agentStart();
  const result = await emit("before_agent_start", event);
  assert.deepEqual(result, [
    { customType: DATE_MESSAGE_TYPE, content: renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "America/Los_Angeles"), display: false },
  ]);
  assert.deepEqual(event.systemPromptOptions.sections, {});
});

test("the zone is PI_DATE_TAIL_TZ when set, and the process's own zone when not (table)", async () => {
  const cases: Array<{ name: string; env: NodeJS.ProcessEnv; processZone: string | undefined; zone: string | undefined }> = [
    { name: "set", env: { [DATE_TAIL_TZ_ENV]: "America/Los_Angeles" }, processZone: "Asia/Tokyo", zone: "America/Los_Angeles" },
    { name: "unset", env: {}, processZone: "Asia/Tokyo", zone: "Asia/Tokyo" },
    { name: "empty", env: { [DATE_TAIL_TZ_ENV]: "" }, processZone: "Asia/Tokyo", zone: "Asia/Tokyo" },
    { name: "unset, and the process zone has no name", env: {}, processZone: undefined, zone: undefined },
  ];
  for (const testCase of cases) {
    const { pi, emit } = fakePi();
    registerDateTail(pi, { env: testCase.env, processZone: testCase.processZone, clock: () => LATE_EVENING_IN_LOS_ANGELES });
    assert.equal(contentOf(await emit("before_agent_start", agentStart())), renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, testCase.zone), testCase.name);
  }
});

test("an invalid PI_DATE_TAIL_TZ stops the load, naming the variable, before anything is registered", () => {
  const { pi, events } = fakePi();
  assert.throws(() => registerDateTail(pi, { ...LOS_ANGELES, env: { [DATE_TAIL_TZ_ENV]: "Mars/Olympus" } }), new RegExp(`${DATE_TAIL_TZ_ENV}.*Mars/Olympus`));
  assert.deepEqual(events(), []);
});

test("a later prompt re-renders, so a new day arrives without a restart", async () => {
  let now = LATE_EVENING_IN_LOS_ANGELES;
  const { pi, emit } = fakePi();
  registerDateTail(pi, { ...LOS_ANGELES, clock: () => now });
  const first = contentOf(await emit("before_agent_start", agentStart()));
  now = new Date("2026-09-23T18:00:00Z");
  const second = contentOf(await emit("before_agent_start", agentStart()));
  assert.match(String(first), /2026-09-21 \(Monday\)/);
  assert.match(String(second), /2026-09-23 \(Wednesday\)/);
});

test("a prompt whose branch already carries today's message adds nothing", async () => {
  const today = renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "America/Los_Angeles");
  const branch = [{ type: "custom_message", id: "d1", parentId: null, timestamp: "t", customType: DATE_MESSAGE_TYPE, content: today, display: false }] as SessionEntry[];
  const { pi, emit } = fakePi();
  registerDateTail(pi, LOS_ANGELES);
  assert.deepEqual(await emit("before_agent_start", agentStart(), () => branch), []);
});

test("a date section already in the system prompt wins: no message, and the section is untouched", async () => {
  const { pi, emit } = fakePi();
  registerDateTail(pi, LOS_ANGELES);
  const event = agentStart({ [DATE_SECTION]: "Current date: set elsewhere" });
  assert.deepEqual(await emit("before_agent_start", event), []);
  assert.deepEqual(event.systemPromptOptions.sections, { [DATE_SECTION]: "Current date: set elsewhere" });
});

test("a date section counts only when its extension's handler ran first, as pi runs them in load order (table)", async () => {
  const setDateSection = (event: unknown) => {
    (event as ReturnType<typeof agentStart>).systemPromptOptions.sections[DATE_SECTION] = "Current date: set elsewhere";
    return undefined;
  };
  const cases: Array<{ name: string; otherFirst: boolean; messages: number }> = [
    { name: "the other extension loads first: date-tail sees its section and adds nothing", otherFirst: true, messages: 0 },
    { name: "the other extension loads later: date-tail cannot see it, and the model gets both", otherFirst: false, messages: 1 },
  ];
  for (const testCase of cases) {
    const { pi, emit } = fakePi();
    if (testCase.otherFirst) pi.on("before_agent_start", setDateSection);
    registerDateTail(pi, LOS_ANGELES);
    if (!testCase.otherFirst) pi.on("before_agent_start", setDateSection);
    const event = agentStart();
    assert.equal((await emit("before_agent_start", event)).length, testCase.messages, testCase.name);
    assert.equal(event.systemPromptOptions.sections[DATE_SECTION], "Current date: set elsewhere", testCase.name);
  }
});

test("an options object without a sections map still gets the date", async () => {
  const { pi, emit } = fakePi();
  registerDateTail(pi, LOS_ANGELES);
  const event = { ...agentStart(), systemPromptOptions: {} };
  assert.match(String(contentOf(await emit("before_agent_start", event))), /^Current date: 2026-09-21/);
});

test("an event without systemPromptOptions still gets the date, and never throws", async () => {
  const { pi, emit } = fakePi();
  registerDateTail(pi, LOS_ANGELES);
  const event = { ...agentStart(), systemPromptOptions: undefined };
  assert.match(String(contentOf(await emit("before_agent_start", event))), /^Current date: 2026-09-21/);
});

test("a clock that throws or answers an invalid Date never fails the prompt: no message is added (table)", async () => {
  const clocks: Array<{ name: string; clock: () => Date }> = [
    { name: "throws", clock: () => { throw new Error("no clock"); } },
    { name: "an invalid Date", clock: () => new Date(Number.NaN) },
  ];
  for (const testCase of clocks) {
    const { pi, emit } = fakePi();
    registerDateTail(pi, { ...LOS_ANGELES, clock: testCase.clock });
    assert.deepEqual(await emit("before_agent_start", agentStart()), [], testCase.name);
  }
});

test("a branch that cannot be read never fails the prompt: the message is added (a repeat only appends)", async () => {
  const { pi, emit } = fakePi();
  registerDateTail(pi, LOS_ANGELES);
  const result = await emit("before_agent_start", agentStart(), () => { throw new Error("store gone"); });
  assert.equal(contentOf(result), renderDateMessage(LATE_EVENING_IN_LOS_ANGELES, "America/Los_Angeles"));
});

test("the default export is the factory pi calls: it registers on the real clock and environment", async () => {
  const { pi, emit, events } = fakePi();
  dateTailExtension(pi);
  assert.deepEqual(events(), ["before_agent_start"]);
  assert.match(String(contentOf(await emit("before_agent_start", agentStart()))), /^Current date: \d{4}-\d\d-\d\d \(\w+day\), your calendar day in /);
});
