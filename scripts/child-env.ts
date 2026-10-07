/**
 * The environment the smoke hands pi: an allowlist, never the parent's whole environment, so API keys and other
 * secrets of the person running the smoke never reach the child pi or the commands it runs.
 */

/** Parent variables pi and its shell need to run: the search path, temp dirs, locale, and Windows' basics. */
export const PASSED_THROUGH = ["PATH", "TMPDIR", "LANG", "LC_ALL", "TEMP", "TMP", "SYSTEMROOT", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"];

/** The allowlisted parent variables that are set, plus `overrides` (which win). */
export function childEnv(parent: NodeJS.ProcessEnv, overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of PASSED_THROUGH) {
    if (parent[name] !== undefined) env[name] = parent[name];
  }
  return { ...env, ...overrides };
}
