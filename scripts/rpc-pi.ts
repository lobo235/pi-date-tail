/** The vendored pi in RPC mode, driven one command at a time: the harness the pi smoke runs on. */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { MODEL, PROVIDER } from "./fake-model.ts";

const repo = path.join(import.meta.dirname, "..");
const TIMEOUT_MS = 120_000;

type RpcMessage = { type?: string; id?: string; success?: boolean; error?: string };

/** The vendored pi: its version, and its CLI entry, run with this node so no shell shim is needed on any platform. */
export function vendoredPi(): { version: string; cli: string } {
  const pkgDir = path.join(repo, "node_modules", "@earendil-works", "pi-coding-agent");
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as { version: string; bin: Record<string, string> };
  return { version: pkg.version, cli: path.join(pkgDir, pkg.bin.pi) };
}

export interface PiLaunch {
  /** Holds `project/` (the working directory) and `sessions/` (the session dir). */
  root: string;
  env: NodeJS.ProcessEnv;
  /**
   * Which extensions pi loads. `source`: only this repository's `src/index.ts` (`-ne -e`). `installed`: whatever
   * the agent dir's settings install (no flags; the package check installs the packed tarball there). `none`: no
   * extensions at all (`-ne`).
   */
  extensions: "source" | "installed" | "none";
  /** Continue the newest session in `sessions/` instead of starting one. */
  continueSession?: boolean;
}

function piArgs(launch: PiLaunch): string[] {
  const args = [vendoredPi().cli, "--mode", "rpc", "--offline", "--session-dir", path.join(launch.root, "sessions"),
    "--model", `${PROVIDER}/${MODEL}`];
  if (launch.continueSession) args.push("-c");
  if (launch.extensions !== "installed") args.push("-ne");
  if (launch.extensions === "source") args.push("-e", path.join(repo, "src", "index.ts"));
  return args;
}

/** Starts pi; `prompt` waits for the run to settle, `compact` for its response, and `stop` for pi to exit. */
export function startPi(launch: PiLaunch) {
  const cwd = path.join(launch.root, "project");
  fs.mkdirSync(cwd, { recursive: true });
  const child = spawn(process.execPath, piArgs(launch), { cwd, env: launch.env, stdio: ["pipe", "pipe", "pipe"] });
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
  const stop = async () => { child.stdin.end(); child.kill(); await exited; };
  return { prompt, compact, stop, exited, stderr: () => stderr };
}
