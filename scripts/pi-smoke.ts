/**
 * pi smoke: the pi this tree vendors, started with only this extension, in a fresh HOME and agent dir,
 * against a fake OpenAI-compatible model on loopback. No network, no key, and nothing of the person
 * running it is read or written.
 *
 * Checks 1-4 run on the package as published: `npm pack`, unpacked and `pi install`ed, so pi finds the extension
 * through the package manifest and the `files` allowlist. Checks 5-6 load `src/index.ts` directly.
 *
 * Checks, end to end on a real pi:
 *  1. the first prompt's request carries the date message once, after the system prompt, never in it;
 *  2. a second prompt the same day adds nothing;
 *  3. after a compaction that summarized it, the next prompt adds the message again;
 *  4. the transcript holds those messages as hidden `date-tail` custom messages;
 *  5. after a compaction that kept it, the next prompt adds nothing;
 *  6. an invalid PI_DATE_TAIL_TZ stops pi at launch with an error naming the variable.
 * Exits 1 naming the first failed check. `--keep` leaves the temporary directory for inspection.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DATE_MESSAGE_TYPE, renderDateMessage } from "../src/date-message.ts";
import { DATE_TAIL_TZ_ENV } from "../src/time-zone.ts";
import { PROVIDER, MODEL, startFakeModel, type FakeModel } from "./fake-model.ts";
import { installPackedCopy } from "./packed.ts";
import { startPi, vendoredPi } from "./rpc-pi.ts";

const ZONE = "Asia/Tokyo";
// How long a pi that should refuse to start may take to exit: it fails while loading, before reading any input.
const LAUNCH_TIMEOUT_MS = 30_000;

/** An agent dir with the fake model, and compactions that keep `keepRecentTokens` of recent conversation. */
function writeAgentDir(root: string, port: number, keepRecentTokens: number): string {
  const agentDir = path.join(root, "agent");
  fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const model = { id: MODEL, name: MODEL, contextWindow: 131072, maxTokens: 4096, input: ["text"], reasoning: false };
  const models = { providers: { [PROVIDER]: { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "unused", models: [model] } } };
  fs.writeFileSync(path.join(agentDir, "models.json"), JSON.stringify(models, null, 2));
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ compaction: { keepRecentTokens } }, null, 2));
  return agentDir;
}

function childEnv(root: string, agentDir: string, zone: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: root, USERPROFILE: root, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", [DATE_TAIL_TZ_ENV]: zone };
}

/** How many times `text` appears in the non-system messages of a request, and whether the system part has it. */
function occurrences(request: { messages?: { role?: string }[] }, text: string): { conversation: number; system: boolean } {
  const needle = JSON.stringify(text).slice(1, -1);
  let conversation = 0;
  let system = false;
  for (const message of request.messages ?? []) {
    const body = JSON.stringify(message);
    if (message.role === "system" || message.role === "developer") system ||= body.includes(needle);
    else conversation += body.split(needle).length - 1;
  }
  return { conversation, system };
}

type DateEntry = { type?: string; customType?: string; content?: unknown; display?: boolean };

function dateEntries(root: string): DateEntry[] {
  const dir = path.join(root, "sessions");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".jsonl")) : [];
  return files.flatMap((name) => fs.readFileSync(path.join(dir, name), "utf8").split("\n").filter(Boolean))
    .map((line) => JSON.parse(line) as DateEntry)
    .filter((entry) => entry.type === "custom_message" && entry.customType === DATE_MESSAGE_TYPE);
}

function expectOnce(request: object | undefined, expected: string[], label: string): string | null {
  if (!request) return `${label}: no model request was made`;
  const counts = expected.map((text) => occurrences(request, text));
  if (counts.some((count) => count.system)) return `${label}: the date is in the system prompt`;
  const total = counts.reduce((sum, count) => sum + count.conversation, 0);
  return total === 1 ? null : `${label}: the date message appears ${total} times in the conversation, expected once`;
}

/** The date message for a check that ran from `before` until now: a check that straddles midnight sees the later day. */
const datesSince = (before: Date) => [...new Set([renderDateMessage(before, ZONE), renderDateMessage(new Date(), ZONE)])];

/** Checks 1-4 on one pi running the installed package, whose compaction keeps almost nothing; the first failure, or null. */
async function checkDating(root: string, fake: FakeModel): Promise<string | null> {
  // keepRecentTokens 1: even this short session compacts, and the first date message is summarized.
  const env = childEnv(root, writeAgentDir(root, fake.port, 1), ZONE);
  installPackedCopy(root, env);
  const pi = startPi({ root, env, extensions: "installed" });
  try {
    const before = new Date();
    await pi.prompt("first", "What is today's date?");
    const afterFirst = fake.requests.length;
    await pi.prompt("second", "And again?");
    const afterSecond = fake.requests.length;
    await pi.compact("compact");
    await pi.prompt("third", "After the compaction?");
    const expected = datesSince(before);
    const failure = expectOnce(fake.requests[0], expected, "first prompt")
      ?? expectOnce(fake.requests[afterSecond - 1], expected, "second prompt")
      ?? (afterFirst === afterSecond ? "second prompt: no model request was made" : null);
    if (failure) return failure;
    const entries = dateEntries(root);
    if (entries.length !== 2) return `transcript: ${entries.length} date-tail entries, expected 2 (first prompt, after the compaction)`;
    if (entries.some((entry) => entry.display !== false || !expected.includes(String(entry.content)))) {
      return "transcript: a date-tail entry is visible or carries other text";
    }
    return null;
  } finally {
    await pi.stop();
  }
}

/**
 * Check 5: a compaction that keeps the date message. A first pi, without the extension, writes long turns to
 * summarize; a second continues that session with the extension, so the date follows them and the compaction,
 * which keeps the newest turns, keeps it.
 */
async function checkKeptDate(root: string, fake: FakeModel): Promise<string | null> {
  const env = childEnv(root, writeAgentDir(root, fake.port, 2000), ZONE);
  const history = startPi({ root, env, extensions: "none" });
  // Two long turns: compaction cuts at the second (past keepRecentTokens), so the first is summarized and the second kept.
  await history.prompt("history-1", `Earlier work. ${"lorem ipsum dolor sit amet ".repeat(800)}`);
  await history.prompt("history-2", `More work. ${"consectetur adipiscing elit ".repeat(800)}`);
  await history.stop();
  const pi = startPi({ root, env, extensions: "source", continueSession: true });
  try {
    const before = new Date();
    await pi.prompt("dated", "What is today's date?");
    await pi.compact("compact-keeping");
    await pi.prompt("after", "After the compaction?");
    const failure = expectOnce(fake.requests.at(-1), datesSince(before), "kept date, prompt after the compaction");
    if (failure) return failure;
    const entries = dateEntries(root);
    return entries.length === 1 ? null : `kept date: ${entries.length} date-tail entries, expected 1 (the compaction kept it)`;
  } finally {
    await pi.stop();
  }
}

/** Check 6: an invalid zone stops pi at launch, naming the variable. */
async function checkInvalidZone(root: string): Promise<string | null> {
  const pi = startPi({ root, env: childEnv(root, path.join(root, "agent"), "Mars/Olympus"), extensions: "source" });
  const code = await Promise.race([pi.exited, new Promise<"running">((resolve) => setTimeout(() => resolve("running"), LAUNCH_TIMEOUT_MS))]);
  await pi.stop();
  if (code === "running") return `invalid zone: pi was still running after ${LAUNCH_TIMEOUT_MS / 1000} s`;
  if (code === 0) return "invalid zone: pi exited 0";
  if (!pi.stderr().includes(DATE_TAIL_TZ_ENV) || !pi.stderr().includes("Mars/Olympus")) {
    return `invalid zone: pi's error does not name ${DATE_TAIL_TZ_ENV} and the value: ${pi.stderr().trim()}`;
  }
  return null;
}

async function main(): Promise<number> {
  const keep = process.argv.includes("--keep");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "date-tail-smoke-"));
  const fake = await startFakeModel();
  try {
    const failure = (await checkDating(path.join(root, "summarized"), fake))
      ?? (await checkKeptDate(path.join(root, "kept"), fake))
      ?? (await checkInvalidZone(path.join(root, "invalid")));
    console.log(`pi smoke: pi ${vendoredPi().version}, ${fake.requests.length} model request(s): ${failure ?? "ok"}`);
    return failure ? 1 : 0;
  } finally {
    fake.server.close();
    if (keep) console.log(`kept ${root}`);
    else fs.rmSync(root, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code), (error: unknown) => {
  console.error(`pi smoke: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
