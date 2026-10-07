/**
 * The time zone whose calendar day the date message gives: `PI_DATE_TAIL_TZ` when set, otherwise the
 * process's own zone, validated once when the extension loads.
 */

export const DATE_TAIL_TZ_ENV = "PI_DATE_TAIL_TZ";

/**
 * A canonical IANA zone name, or `undefined` for the process's own zone when it has no IANA name (a `TZ`
 * that is not a zone, say): the day is then formatted in whatever zone the process runs in.
 */
export type ZoneName = string | undefined;

/** The zone name a formatter resolves `zone` to, or `undefined` when `zone` is not one it knows. */
function canonicalZone(zone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * The zone for `PI_DATE_TAIL_TZ`'s raw value: trimmed, and unset or empty means `processZone`. A value
 * that is not an IANA zone name throws, naming the variable and the value, so pi stops at launch rather
 * than dating every session in a zone nobody chose.
 */
export function resolveTimeZone(raw: string | undefined, processZone: ZoneName): ZoneName {
  const requested = (raw ?? "").trim();
  if (requested === "") return processZone;
  // An offset is accepted by newer formatters, but `TZ=+05:00 date` reads it as a POSIX offset with the
  // opposite sign, so the command the message suggests would print the wrong time.
  const zone = /^[+-]/.test(requested) ? undefined : canonicalZone(requested);
  if (zone === undefined) {
    throw new Error(
      `${DATE_TAIL_TZ_ENV}: ${JSON.stringify(requested)} is not an IANA time zone name ` +
        `(for example "Europe/Berlin"); unset it to use this machine's time zone`,
    );
  }
  return zone;
}

/**
 * This process's own zone: `TZ` when it names one, otherwise the system's. `undefined` when the formatter
 * reports no usable name for it (a `TZ` that is not a zone reports none, an empty one "Etc/Unknown").
 */
export function processTimeZone(): ZoneName {
  const reported = new Intl.DateTimeFormat().resolvedOptions().timeZone as string | undefined;
  return reported === undefined ? undefined : canonicalZone(reported);
}
