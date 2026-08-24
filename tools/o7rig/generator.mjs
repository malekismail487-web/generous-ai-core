/**
 * ORCHESTRA O7 — Generator Adapter (the wiring to live model calls)
 * ----------------------------------------------------------------
 * The GEN phase of the Closed Loop. Two implementations behind one
 * interface:
 *
 *   gateway — POSTs the scaffold contract + prompt + prior critique to an
 *             OpenAI-compatible endpoint (Lovable AI gateway pattern) and
 *             returns generated scene files. ACTIVE the moment credentials
 *             exist: ORCHESTRA_GATEWAY_URL + ORCHESTRA_MODEL_KEY env vars.
 *   manual  — explicit non-autonomous mode used for rig verification only;
 *             attempts are pre-authored files passed by the operator. Every
 *             artifact produced this way is LABELED manual in its pack.
 *
 * Honesty law: nothing here pretends autonomy. A run without credentials
 * fails loudly with NO_MODEL_CREDENTIALS rather than silently degrading.
 */

import { readFileSync, existsSync } from "node:fs";

export interface GenerateRequest {
  readonly prompt: string;
  readonly scaffoldContract: string;
  readonly priorCritique: string | null;
  readonly attempt: number;
}

export interface GeneratedScene {
  readonly files: Readonly<Record<string, string>>; // path → source
  readonly mode: "gateway" | "manual";
  readonly model?: string;
}

export function hasCredentials(): boolean {
  return Boolean(process.env.ORCHESTRA_GATEWAY_URL && process.env.ORCHESTRA_MODEL_KEY);
}

export async function generate(req: GenerateRequest): Promise<GeneratedScene> {
  if (!hasCredentials()) {
    throw new Error("NO_MODEL_CREDENTIALS: set ORCHESTRA_GATEWAY_URL + ORCHESTRA_MODEL_KEY for autonomous generation");
  }
  const messages = [
    {
      role: "system",
      content:
        `${req.scaffoldContract}\n\n` +
        "Output a SINGLE self-contained HTML file using three.js via unpkg importmap. " +
        "Hard rules: no Math.random, no Date.now, seeded integer-hash noise only, " +
        "FIXED_TIMESTEP constant, renderer.outputColorSpace + ACES toneMapping pinned, " +
        "camera.near < camera.far, expose window.__frames, window.__physicsReplay (Rapier " +
        "replay via jsdelivr +esm), window.__audioRender (OfflineAudioContext synth).",
    },
    {
      role: "user",
      content:
        `Scene brief: ${req.prompt}\n` +
        (req.priorCritique
          ? `\nPrior attempt critique (fix ALL of it): ${req.priorCritique}\n`
          : "") +
        `\nAttempt number: ${req.attempt}`,
    },
  ];
  const res = await fetch(process.env.ORCHESTRA_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ORCHESTRA_MODEL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: process.env.ORCHESTRA_MODEL ?? "gpt-4o", messages }),
  });
  if (!res.ok) throw new Error(`GATEWAY_ERROR:${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const html = content.match(/```(?:html)?\n([\s\S]*?)```/)?.[1] ?? content;
  return { files: { "index.html": html }, mode: "gateway", model: process.env.ORCHESTRA_MODEL ?? "gpt-4o" };
}

/** Manual mode: operator-authored attempt file, honestly labeled. */
export function generateManual(path: string): GeneratedScene {
  if (!existsSync(path)) throw new Error(`MANUAL_ATTEMPT_MISSING:${path}`);
  return { files: { "index.html": readFileSync(path, "utf8") }, mode: "manual" };
}

export const SCAFFOLD_CONTRACT = [
  "ORCHESTRA O7 Generation Contract v1",
  "- Units: meters, Y-up. camera.near>=0.05, camera.far<=1000, near<far.",
  "- Seeded PRNG: integer hash-mixing only (xmur3+mulberry32 pattern).",
  "- Physics (if any): Rapier compat via jsdelivr +esm, FIXED_TIMESTEP=1/60,",
  "  ordered construction, expose window.__physicsReplay() -> {replayHashA,",
  "  replayHashB, energyDrift, tunnelRate} (two fresh 240-step runs).",
  "- Audio (if any): expose window.__audioRender() -> OfflineAudioContext",
  "  render -> {rms, peak, spectralCentroidHz, durationSec}.",
  "- Animation: continuous (camera/particles/pulses); expose window.__frames.",
  "- Color: outputColorSpace sRGB + ACESFilmicToneMapping.",
  "- preserveDrawingBuffer:true so the rig can read pixels.",
].join("\n");
