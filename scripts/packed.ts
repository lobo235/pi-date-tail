/**
 * The package as npm would publish it, installed into a pi: `npm pack` of this repository, unpacked, then
 * `pi install <dir>` by the vendored pi into the given agent dir. A pi started on that agent dir finds the
 * extension the way a user's does: through the package's `pi.extensions` manifest, among only the files the
 * `files` allowlist ships.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { vendoredPi } from "./rpc-pi.ts";

const repo = path.join(import.meta.dirname, "..");

/**
 * npm without a shell, which would re-parse arguments such as a temporary path: the npm-cli.js that started this
 * script (`npm_execpath`), else on Windows the one installed next to node, else `npm` on the search path.
 */
export function runNpm(args: string[], cwd: string): string {
  const started = process.env.npm_execpath;
  const besideNode = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const cli = started && /npm-cli\.c?js$/.test(started) ? started : process.platform === "win32" && fs.existsSync(besideNode) ? besideNode : undefined;
  return cli ? execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" }) : execFileSync("npm", args, { cwd, encoding: "utf8" });
}

/** Packs, unpacks under `root/pack/`, and installs into the agent dir `env` names. Returns the unpacked directory. */
export function installPackedCopy(root: string, env: NodeJS.ProcessEnv): string {
  const packDir = path.join(root, "pack");
  fs.mkdirSync(packDir, { recursive: true });
  const packed = JSON.parse(runNpm(["pack", "--json", "--pack-destination", packDir], repo)) as { filename: string }[];
  execFileSync("tar", ["-xzf", packed[0].filename], { cwd: packDir });
  const unpacked = path.join(packDir, "package");
  execFileSync(process.execPath, [vendoredPi().cli, "install", unpacked], { cwd: root, env, stdio: ["ignore", "ignore", "pipe"] });
  return unpacked;
}
