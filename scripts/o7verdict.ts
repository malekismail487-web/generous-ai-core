/**
 * O7 — Formal perception verdict: bridges a rig report JSON through the
 * pure judges. Usage: npx tsx scripts/o7verdict.ts <report.json>
 */
import { readFileSync } from "node:fs";
import { judgeAll } from "../src/lib/codelab/engine/perception";

const raw = JSON.parse(readFileSync(process.argv[2] ?? "report.json", "utf8"));
const report = {
  motion: raw.motion,
  palette: raw.palette,
  edges: raw.edges,
  physics: raw.physics,
  audio: raw.audio,
  playtest: raw.playtest,
};
const verdicts = judgeAll(report);
for (const v of verdicts) {
  console.log(`${v.verdict === "pass" ? "PASS" : "FAIL"}  ${v.channel.padEnd(10)} ${v.reason}`);
}
const ok = verdicts.every((v) => v.verdict === "pass");
console.log(ok ? "\nSCENE VERDICT: PASS (all eyes agree)" : "\nSCENE VERDICT: FAIL");
process.exit(ok ? 0 : 1);
