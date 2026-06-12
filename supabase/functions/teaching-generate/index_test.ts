/**
 * teaching-generate integration sanity test.
 *
 * Purpose: catch the two Stage-0 silent bugs from ever regressing.
 *
 *  1. theta/SE must come from `ability_estimates` (not the non-existent
 *     `student_learning_profiles.theta` column).
 *  2. recent error count must read `graded_events.was_correct`
 *     (not the non-existent `is_correct` column).
 *  3. client-supplied `fatigue` must reach the state vector.
 *
 * This test does not call the live edge function (that needs a deployed
 * runtime + real auth); instead it asserts the SOURCE FILE references the
 * correct columns/identifiers. It is fast, deterministic, and impossible
 * to fool by changing only one of the call sites.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const RAW = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
// Strip // line comments and /* block comments */ before regex checks so that
// historical "FIX:" notes mentioning the old column names don't trip the guard.
const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

Deno.test("teaching-generate reads theta from ability_estimates", () => {
  assertStringIncludes(SRC, 'from("ability_estimates")');
  assertStringIncludes(SRC, "theta, theta_se");
  // Must NOT use the non-existent student_learning_profiles.theta join.
  assert(
    !/from\("student_learning_profiles"\)\s*\.select\([^)]*theta/.test(SRC),
    "teaching-generate must not select theta from student_learning_profiles",
  );
});

Deno.test("teaching-generate reads was_correct from graded_events", () => {
  assertStringIncludes(SRC, 'from("graded_events")');
  assertStringIncludes(SRC, "was_correct");
  // Must NOT reference the non-existent is_correct column.
  assert(
    !/graded_events[\s\S]{0,200}is_correct/.test(SRC),
    "teaching-generate must not reference graded_events.is_correct",
  );
});

Deno.test("teaching-generate forwards client fatigue to the state vector", () => {
  assertStringIncludes(SRC, "body.fatigue");
  assertStringIncludes(SRC, "fatigue: clientFatigue");
});
