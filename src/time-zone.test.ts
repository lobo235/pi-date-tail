import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateUnderTz } from "./test-support.ts";
import { DATE_TAIL_TZ_ENV, processTimeZone, resolveTimeZone } from "./time-zone.ts";

test("PI_DATE_TAIL_TZ picks the zone, canonically spelled, whatever the process zone is", () => {
  const cases: Array<{ name: string; raw: string; want: string }> = [
    { name: "an IANA zone", raw: "Europe/Berlin", want: "Europe/Berlin" },
    { name: "surrounding whitespace is tolerated", raw: "  UTC ", want: "UTC" },
    // `TZ=america/los_angeles date` silently prints UTC on a case-sensitive file system, so the
    // name the message hands the model must be the canonical spelling.
    { name: "case is canonicalized", raw: "america/los_angeles", want: "America/Los_Angeles" },
  ];
  for (const testCase of cases) {
    assert.equal(resolveTimeZone(testCase.raw, "Asia/Tokyo"), testCase.want, testCase.name);
  }
});

test("a PI_DATE_TAIL_TZ that is not a zone name stops the load, naming the variable and the value", () => {
  const cases: Array<{ name: string; raw: string; value: string }> = [
    { name: "not a zone", raw: "Mars/Olympus", value: "Mars/Olympus" },
    // `TZ=+05:00 date` reads a POSIX offset with the opposite sign, so an offset would hand the
    // model a command that prints the wrong time.
    { name: "an offset", raw: "+05:00", value: "+05:00" },
    { name: "a negative offset", raw: "-0700", value: "-0700" },
  ];
  for (const testCase of cases) {
    assert.throws(
      () => resolveTimeZone(testCase.raw, "Asia/Tokyo"),
      (error: Error) => error.message.includes(DATE_TAIL_TZ_ENV) && error.message.includes(JSON.stringify(testCase.value)),
      testCase.name,
    );
  }
});

test("an unset or empty PI_DATE_TAIL_TZ means the process's own zone", () => {
  const cases: Array<{ name: string; raw: string | undefined; processZone: string | undefined }> = [
    { name: "unset", raw: undefined, processZone: "Asia/Tokyo" },
    { name: "empty", raw: "", processZone: "Asia/Tokyo" },
    { name: "only whitespace", raw: "   ", processZone: "America/Los_Angeles" },
    { name: "unset, and the process zone has no IANA name", raw: undefined, processZone: undefined },
  ];
  for (const testCase of cases) {
    assert.equal(resolveTimeZone(testCase.raw, testCase.processZone), testCase.processZone, testCase.name);
  }
});

test("the process's own zone honours TZ, and is undefined when TZ names no zone", () => {
  const cases: Array<{ name: string; tz: string; want: string }> = [
    { name: "an IANA zone", tz: "Asia/Tokyo", want: "Asia/Tokyo" },
    { name: "UTC", tz: "UTC", want: "UTC" },
    // The C library falls back to UTC here; the formatter reports no name (or "Etc/Unknown").
    { name: "not a zone", tz: "not-a-zone", want: "undefined" },
    // Windows reads an empty TZ as unset (the system's zone); the C library elsewhere reads it as UTC with no name.
    { name: "empty", tz: "", want: process.platform === "win32" ? evaluateUnderTz(undefined, "./time-zone.ts", "mod.processTimeZone()") : "undefined" },
  ];
  for (const testCase of cases) {
    assert.equal(evaluateUnderTz(testCase.tz, "./time-zone.ts", "mod.processTimeZone()"), testCase.want, testCase.name);
  }
});

test("processTimeZone() answers this process's zone as a valid name or undefined", () => {
  const zone = processTimeZone();
  if (zone !== undefined) assert.equal(resolveTimeZone(zone, undefined), zone);
});
