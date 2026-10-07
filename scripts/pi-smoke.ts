/**
 * pi smoke: the pi this tree vendors, started with only this extension, in a fresh HOME and agent dir,
 * against a fake OpenAI-compatible model on loopback. No network, no key, and nothing of the person
 * running it is read or written.
 *
 * Checks, end to end on a real pi:
 *  1. the first prompt's request carries the date message once, after the system prompt, never in it;
 *  2. a second prompt the same day adds nothing;
 *  3. after a compaction the next prompt adds the message again;
 *  4. the transcript holds those messages as hidden `date-tail` custom messages;
 *  5. an invalid PI_DATE_TAIL_TZ stops pi at launch with an error naming the variable.
 * Exits 1 naming the first failed check. `--keep` leaves the temporary directory for inspection.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { DATE_MESSAGE_TYPE, renderDateMessage } from "../src/date-message.ts";
import { DATE_TAIL_TZ_ENV } from "../src/time-zone.ts";
import { PROVIDER, MODEL, startFakeModel, type FakeModel } from "./fake-model.ts";

const repo = path.join(import.meta.dirname, "..");
const ZONE = "Asia/Tokyo";
const TIMEOUT_MS = 120_000;
// How long a pi that should refuse to start may take to exit: it fails while loading, before reading any input.
const LAUNCH_TIMEOUT_MS = 30_000;

type RpcMessage = { type?: string; id?: string; success?: boolean; error?: string };

/** The vendored pi: its version, and its CLI entry, run with this node so no shell shim is needed on any platform. */
function vendoredPi(): { version: string; cli: string } {
  const pkgDir = path.join(repo, "node_modules", "@earendil-works", "pi-coding-agent");
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as { version: string; bin: Record<string, string> };
  return { version: pkg.version, cli: path.join(pkgDir, pkg.bin.pi) };
}

function writeAgentDir(root: string, port: number): string {
  const agentDir = path.join(root, "agent");
  fs.mkdirSync(agentDir, { mode: 0o700 });
  const model = { id: MODEL, name: MODEL, contextWindow: 131072, maxTokens: 4096, input: ["text"], reasoning: false };
  const models = { providers: { [PROVIDER]: { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "unused", models: [model] } } };
  fs.writeFileSync(path.join(agentDir, "models.json"), JSON.stringify(models, null, 2));
  // Keep almost nothing at a compaction, so even this short session compacts and the first message is summarized.
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ compaction: { keepRecentTokens: 1 } }, null, 2));
  return agentDir;
}

function childEnv(root: string, agentDir: string, zone: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: root, USERPROFILE: root, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", [DATE_TAIL_TZ_ENV]: zone };
}

/** A pi in RPC mode: send a command and wait for a named event, or for pi to exit. */
function startPi(root: string, env: NodeJS.ProcessEnv) {
  const cwd = path.join(root, "project");
  fs.mkdirSync(cwd, { recursive: true });
  const args = [vendoredPi().cli, "--mode", "rpc", "--offline", "--session-dir", path.join(root, "sessions"),
    "--model", `${PROVIDER}/${MODEL}`, "-ne", "-e", path.join(repo, "src", "index.ts")];
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  const listeners = new Set<(message: RpcMessage) => void>();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let message: RpcMessage;
    try { message = JSON.parse(line) as RpcMessage; } catch { return; }
    for (const listener of listeners) listener(message);
  });
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));

  /** Sends `command` and resolves with the first message `done` accepts; rejects on a failed response or exit. */
  function send(command: { id: string; type: string; message?: string }, done: (message: RpcMessage) => boolean): Promise<RpcMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer to ${command.id} within ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS);
      const finish = (error: Error | null, message?: RpcMessage) => {
        clearTimeout(timer);
        listeners.delete(listener);
        if (error) reject(error); else resolve(message!);
      };
      const listener = (message: RpcMessage) => {
        if (message.type === "response" && message.id === command.id && message.success === false) {
          finish(new Error(`${command.id} failed: ${message.error ?? "no error given"}`));
        } else if (done(message)) finish(null, message);
      };
      listeners.add(listener);
      exited.then((code) => finish(new Error(`pi exited (${code}) during ${command.id}: ${stderr.trim()}`)));
      child.stdin.write(JSON.stringify(command) + "\n");
    });
  }
  const prompt = (id: string, message: string) => send({ id, type: "prompt", message }, (event) => event.type === "agent_settled");
  const compact = (id: string) => send({ id, type: "compact" }, (event) => event.type === "response" && event.id === id);
  const stop = () => { child.stdin.end(); child.kill(); };
  return { prompt, compact, stop, exited, stderr: () => stderr };
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

/** Checks 1-4 on one pi; returns the first failure, or null. */
async function checkDating(root: string, fake: FakeModel): Promise<string | null> {
  const pi = startPi(root, childEnv(root, writeAgentDir(root, fake.port), ZONE));
  try {
    const before = new Date();
    await pi.prompt("first", "What is today's date?");
    const afterFirst = fake.requests.length;
    await pi.prompt("second", "And again?");
    const afterSecond = fake.requests.length;
    await pi.compact("compact");
    await pi.prompt("third", "After the compaction?");
    // A prompt that straddles midnight renders the later day; accept either.
    const expected = [...new Set([renderDateMessage(before, ZONE), renderDateMessage(new Date(), ZONE)])];
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
    pi.stop();
  }
}

/** Check 5: an invalid zone stops pi at launch, naming the variable. */
async function checkInvalidZone(root: string): Promise<string | null> {
  const pi = startPi(root, childEnv(root, path.join(root, "agent"), "Mars/Olympus"));
  const code = await Promise.race([pi.exited, new Promise<"running">((resolve) => setTimeout(() => resolve("running"), LAUNCH_TIMEOUT_MS))]);
  pi.stop();
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
    const failure = (await checkDating(root, fake)) ?? (await checkInvalidZone(root));
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
