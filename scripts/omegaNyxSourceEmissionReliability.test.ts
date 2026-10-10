import { createHash } from "node:crypto";
import { inspectNyxSourceEmission } from "./omega/nyx-source-emission-diagnostics";

let passed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failures.push(label); console.error(`  x ${label}`); }
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function wire(replacement: unknown, target = "src/example.mjs"): string {
  return JSON.stringify({ decision: "PROPOSE_EDIT", changes: [{ target, replacement }] });
}
async function inspect(content: string | null, representation: "LINES" | "TEXT",
  finishReason = "stop", providerResponseDigest = content === null ? null : digest(content)) {
  return inspectNyxSourceEmission({ content, representation, finishReason, providerResponseDigest,
    expectedTarget: "src/example.mjs" });
}

const validSource = "export function example() {\n  return 7;\n}\n";
const validLines = wire({ lines: validSource.split("\n"), lineEnding: "LF" });
const valid = await inspect(validLines, "LINES");
check(valid.outcome === "SYNTACTICALLY_VALID" && valid.lineCount === 4
  && valid.sourceDigest === digest(validSource), "exact LINES reconstruction is syntactically valid");
check(valid.rawSourcePersisted === false && valid.authorityGranted === false
  && !JSON.stringify(valid).includes("return 7"), "diagnostic cannot persist source or grant authority");

const malformedLine32 = `${Array.from({ length: 31 }, () => "// privateFixtureMarker").join("\n")}\nexport function broken( {`;
const syntax = await inspect(wire({ lines: malformedLine32.split("\n"), lineEnding: "LF" }), "LINES");
check(syntax.outcome === "SYNTAX_REJECTED" && syntax.lineCount === 32
  && syntax.syntaxLine === 32 && syntax.syntaxAtFinalLine === true,
"line-32 syntax defect is classified without treating it as truncation");
check(!JSON.stringify(syntax).includes("privateFixtureMarker"), "rejected source text is not disclosed");

const truncated = await inspect(validLines, "LINES", "length");
check(truncated.outcome === "TRUNCATED" && truncated.sourceDigest === null,
"provider length finish is separate from source syntax");
const incomplete = await inspect(validLines, "LINES", "content_filter");
check(incomplete.outcome === "INCOMPLETE_FINISH", "non-stop provider finish is not accepted as valid source");
const mismatch = await inspect(validLines, "LINES", "stop", "0".repeat(64));
check(mismatch.outcome === "ADAPTER_DIGEST_MISMATCH", "captured content must match provider evidence digest");
const nonJson = await inspect("not-json", "LINES");
check(nonJson.outcome === "NON_JSON_CONTENT", "JSON extraction failure remains distinct");
const boundary = await inspect(wire({ lines: ["export const value = 1;\n"], lineEnding: "LF" }), "LINES");
check(boundary.outcome === "MALFORMED_REPLACEMENT_BOUNDARY", "embedded newline is a boundary failure");
const missing = await inspect(null, "LINES");
check(missing.outcome === "NO_PROVIDER_CONTENT", "missing content is neither syntax nor task failure");
const noAction = await inspect(JSON.stringify({ decision: "NO_ACTION", diagnosis: "not yet justified" }), "LINES");
check(noAction.outcome === "NO_SOURCE_PROPOSED", "legitimate no-source action is not called malformed source");
const wrongTarget = await inspect(wire({ lines: validSource.split("\n"), lineEnding: "LF" }, "src/other.mjs"), "LINES");
check(wrongTarget.outcome === "INVALID_TARGET", "out-of-scope target is classified before syntax");
const text = await inspect(wire(validSource), "TEXT");
check(text.outcome === "SYNTACTICALLY_VALID" && text.sourceDigest === digest(validSource),
"TEXT representation is independently inspected");

const selectedContent=JSON.stringify({decision:"SELECT_LOCAL_REFACTOR",selectedProposalRef:"LOCAL-REFACTOR-TEST"});
const selectionReceipt={policy:"nyx-source-bound-refactor-selection/1",outcome:"RESOLVED",reason:"test-only-receipt",
  bindingDigest:"a".repeat(64),selectedProposalRef:"LOCAL-REFACTOR-TEST",path:"src/transform.mjs",
  baseSourceDigest:"b".repeat(64),proposedSourceDigest:"c".repeat(64),inputDigest:"d".repeat(64),outputDigest:"e".repeat(64),
  sourceOrigin:"HOST_PROPOSAL_MODEL_SELECTED",authorityGranted:false,acceptanceGranted:false} as const;
const selectedInput={content:selectedContent,finishReason:"stop",providerResponseDigest:digest(selectedContent),
  expectedTarget:"src/transform.mjs",representation:"LINES" as const,refactorSelection:selectionReceipt};
const selectedInspection=await inspectNyxSourceEmission(selectedInput);
check(selectedInspection.outcome==="HOST_SOURCE_SELECTION_RESOLVED"&&selectedInspection.sourceDigest===null
  &&!selectedInspection.authorityGranted,"resolved selection is host-owned source, not syntactically certified model emission");
for(const change of [{refactorSelection:undefined},{refactorSelection:{...selectionReceipt,selectedProposalRef:"other"}},
  {refactorSelection:{...selectionReceipt,path:"other"}},{refactorSelection:{...selectionReceipt,outcome:"REFUSED" as const}}])
  check((await inspectNyxSourceEmission({...selectedInput,...change})).outcome==="SOURCE_SELECTION_REFUSED",
    "absent, mismatched or refused selection receipt cannot become emission success");
check((await inspectNyxSourceEmission({...selectedInput,finishReason:"length"})).outcome==="TRUNCATED",
  "selection representation cannot hide a provider truncation");
console.log(`OMEGA_NYX_SOURCE_EMISSION_RELIABILITY passed: ${passed}, failed: ${failures.length}`);
if (failures.length) process.exitCode = 1;
