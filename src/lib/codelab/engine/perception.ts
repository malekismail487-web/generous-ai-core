/**
 * ORCHESTRA O7 — Perception Core (the workers' eyes, pure half)
 * -----------------------------------------------------------
 * Every generated scene is judged by INSTRUMENTS, not vibes. The browser
 * rig (playtest instrumentation) produces raw measurements; THIS module
 * holds the deterministic gates that turn measurements into verdicts.
 *
 * Channels (each maps to an O6 probe):
 *   motion    — animation liveness: frame-difference energy over a window
 *   palette   — color health: non-degenerate histograms, contrast presence
 *   edges     — geometry richness: gradient density on downscaled frame
 *   physics   — replay determinism + energy drift + tunneling rate
 *   audio     — offline-render analysis: non-silence, RMS band, clipping
 *   playtest  — fuzz session: zero crashes, rAF alive, input latency bound
 */

// ---------------------------------------------------------------------------
// Published thresholds (frozen)
// ---------------------------------------------------------------------------

export const PERCEPTION_THRESHOLDS = Object.freeze({
  /** Mean abs frame-diff (0-255) across the motion window. */
  motionMin: 0.35,
  motionMax: 60, // above this = seizure/strobe, not animation
  /** Luminance histogram: dark+bright buckets must both be populated. */
  paletteMinSpreadBuckets: 5,
  paletteMinMean: 6,
  paletteMaxMean: 235,
  /** Edge pixels ratio on downscaled luma frame. */
  edgesMinRatio: 0.02,
  /** Physics replay: exact hash equality required. */
  physicsReplayExact: true,
  physicsMaxEnergyDrift: 0.08, // |ΔE/E| bound over the probe window
  physicsMaxTunnelRate: 0.001,
  /** Offline audio (per rendered buffer). */
  audioMinRms: 0.004,
  audioMaxRms: 0.9,
  audioMaxPeak: 0.999, // clipping guard
  /** Playtest fuzz session. */
  playtestMaxErrors: 0,
  /** Loop liveness is RATE-based (environment-robust: SW/hw GL alike). */
  playtestMinFps: 18,
  playtestMaxLatencyMs: 100,
});

// ---------------------------------------------------------------------------
// Measurement shapes (what the rig reports)
// ---------------------------------------------------------------------------

export interface MotionMeasurement {
  /** Mean absolute luminance delta between sampled frame pairs (0-255). */
  readonly meanFrameDelta: number;
  readonly samples: number;
}

export interface PaletteMeasurement {
  readonly histogram: readonly number[]; // 8 buckets
  readonly meanLuminance: number;
}

export interface EdgeMeasurement {
  readonly edgeRatio: number;
}

export interface PhysicsMeasurement {
  readonly replayHashA: string;
  readonly replayHashB: string;
  readonly energyDrift: number; // |ΔE/E|
  readonly tunnelRate: number;
}

export interface AudioMeasurement {
  readonly rms: number;
  readonly peak: number;
  readonly spectralCentroidHz: number;
  readonly durationSec: number;
}

export interface PlaytestMeasurement {
  readonly injectedEvents: number;
  readonly consoleErrors: readonly string[];
  readonly framesAdvanced: number;
  /** Wall-clock span of the fuzz window, ms — fps is derived from this. */
  readonly windowMs: number;
  readonly inputLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type Verdict = "pass" | "fail";

export interface ChannelVerdict {
  readonly channel: "animation" | "palette" | "edges" | "physics" | "audio" | "playtest";
  readonly verdict: Verdict;
  readonly reason: string; // fixed token
}

export function judgeMotion(m: MotionMeasurement): ChannelVerdict {
  if (m.samples < 2) return { channel: "animation", verdict: "fail", reason: "insufficient_samples" };
  if (m.meanFrameDelta < PERCEPTION_THRESHOLDS.motionMin) {
    return { channel: "animation", verdict: "fail", reason: "static_scene" };
  }
  if (m.meanFrameDelta > PERCEPTION_THRESHOLDS.motionMax) {
    return { channel: "animation", verdict: "fail", reason: "strobe" };
  }
  return { channel: "animation", verdict: "pass", reason: "alive" };
}

export function judgePalette(m: PaletteMeasurement): ChannelVerdict {
  // Mean first — it names the specific failure (dark/blown) before the
  // generic spread diagnosis.
  if (m.meanLuminance < PERCEPTION_THRESHOLDS.paletteMinMean) {
    return { channel: "palette", verdict: "fail", reason: "too_dark" };
  }
  if (m.meanLuminance > PERCEPTION_THRESHOLDS.paletteMaxMean) {
    return { channel: "palette", verdict: "fail", reason: "blown_out" };
  }
  const populated = m.histogram.filter((c) => c > 0).length;
  if (populated < PERCEPTION_THRESHOLDS.paletteMinSpreadBuckets) {
    return { channel: "palette", verdict: "fail", reason: "degenerate_histogram" };
  }
  return { channel: "palette", verdict: "pass", reason: "healthy" };
}

export function judgeEdges(m: EdgeMeasurement): ChannelVerdict {
  if (m.edgeRatio < PERCEPTION_THRESHOLDS.edgesMinRatio) {
    return { channel: "edges", verdict: "fail", reason: "featureless" };
  }
  return { channel: "edges", verdict: "pass", reason: "rich" };
}

export function judgePhysics(m: PhysicsMeasurement): ChannelVerdict {
  if (PERCEPTION_THRESHOLDS.physicsReplayExact && m.replayHashA !== m.replayHashB) {
    return { channel: "physics", verdict: "fail", reason: "replay_mismatch" };
  }
  if (!(m.energyDrift <= PERCEPTION_THRESHOLDS.physicsMaxEnergyDrift)) {
    return { channel: "physics", verdict: "fail", reason: "energy_drift" };
  }
  if (!(m.tunnelRate <= PERCEPTION_THRESHOLDS.physicsMaxTunnelRate)) {
    return { channel: "physics", verdict: "fail", reason: "tunneling" };
  }
  return { channel: "physics", verdict: "pass", reason: "deterministic_stable" };
}

export function judgeAudio(m: AudioMeasurement): ChannelVerdict {
  if (m.rms < PERCEPTION_THRESHOLDS.audioMinRms) {
    return { channel: "audio", verdict: "fail", reason: "silent" };
  }
  if (m.rms > PERCEPTION_THRESHOLDS.audioMaxRms) {
    return { channel: "audio", verdict: "fail", reason: "too_loud" };
  }
  if (m.peak > PERCEPTION_THRESHOLDS.audioMaxPeak) {
    return { channel: "audio", verdict: "fail", reason: "clipping" };
  }
  return { channel: "audio", verdict: "pass", reason: "rendered" };
}

export function judgePlaytest(m: PlaytestMeasurement): ChannelVerdict {
  if (m.consoleErrors.length > PERCEPTION_THRESHOLDS.playtestMaxErrors) {
    return { channel: "playtest", verdict: "fail", reason: "console_errors" };
  }
  const fps = m.windowMs > 0 ? (m.framesAdvanced / m.windowMs) * 1000 : 0;
  if (fps < PERCEPTION_THRESHOLDS.playtestMinFps) {
    return { channel: "playtest", verdict: "fail", reason: "render_loop_stalled" };
  }
  if (!(m.inputLatencyMs <= PERCEPTION_THRESHOLDS.playtestMaxLatencyMs)) {
    return { channel: "playtest", verdict: "fail", reason: "input_latency" };
  }
  return { channel: "playtest", verdict: "pass", reason: "responsive" };
}

// ---------------------------------------------------------------------------
// Aggregate → O6 ProbeResult feed
// ---------------------------------------------------------------------------

export interface PerceptionReport {
  readonly motion: MotionMeasurement;
  readonly palette: PaletteMeasurement;
  readonly edges: EdgeMeasurement;
  readonly physics: PhysicsMeasurement;
  readonly audio: AudioMeasurement;
  readonly playtest: PlaytestMeasurement;
}

/** All six channel verdicts for one perception report, in fixed order. */
export function judgeAll(r: PerceptionReport): readonly ChannelVerdict[] {
  return [
    judgeMotion(r.motion),
    judgePalette(r.palette),
    judgeEdges(r.edges),
    judgePhysics(r.physics),
    judgeAudio(r.audio),
    judgePlaytest(r.playtest),
  ];
}

export function allPassed(r: PerceptionReport): boolean {
  return judgeAll(r).every((v) => v.verdict === "pass");
}
