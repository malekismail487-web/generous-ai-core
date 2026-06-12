/**
 * ability-update integration sanity test (Stage 2).
 *
 * Asserts that the edge function pushes interactions into kt_sequence_state
 * via the shared helper after every graded answer. Source-level guard, same
 * approach as the teaching-generate test.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("ability-update imports the KT sequence helper", () => {
  assertStringIncludes(SRC, '"../_shared/ktSequence.ts"');
  assertStringIncludes(SRC, "pushKtInteraction");
});

Deno.test("ability-update appends the latest answer to the KT sequence", () => {
  assertStringIncludes(SRC, "await pushKtInteraction(admin, {");
  assertStringIncludes(SRC, "c: body.isCorrect ? 1 : 0");
});
