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

/** Packs, unpacks under `root/pack/`, and installs into the agent dir `env` names. Returns the unpacked directory. */
export function installPackedCopy(root: string, env: NodeJS.ProcessEnv): string {
  const packDir = path.join(root, "pack");
  fs.mkdirSync(packDir, { recursive: true });
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", packDir],
    { cwd: repo, encoding: "utf8", shell: process.platform === "win32" })) as { filename: string }[];
  execFileSync("tar", ["-xzf", packed[0].filename], { cwd: packDir });
  const unpacked = path.join(packDir, "package");
  execFileSync(process.execPath, [vendoredPi().cli, "install", unpacked], { cwd: root, env, stdio: ["ignore", "ignore", "pipe"] });
  return unpacked;
}
