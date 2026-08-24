/**
 * ORCHESTRA O7a — Static Generation Gate (source linter)
 * ----------------------------------------------------
 * Heuristic PRE-RUN gate over generated scene source. Real verification is
 * empirical (O6 packs); this catches the deterministic blunders cheaply
 * before any browser time is spent. Rules map to self-scan failure modes:
 *
 *   R1 no-math-random   — F5 determinism spine
 *   R2 no-date-source   — F5
 *   R3 fixed-timestep   — F4 physics stability scaffold marker
 *   R4 color-pipeline    — F3 sRGB/toneMapping present when a renderer is
 *   R5 camera-frustum    — F2 near/far numeric sanity
 */

export interface LintViolation {
  readonly rule: string;
  readonly line: number;
}

export interface LintResult {
  readonly ok: boolean;
  readonly violations: readonly LintViolation[];
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function lintGeneratedSource(source: string): LintResult {
  const violations: LintViolation[] = [];
  const push = (rule: string, index: number) => violations.push({ rule, line: lineOf(source, index) });

  // R1/R2 — absolute bans.
  const randomRe = /Math\.random\s*\(/g;
  for (let m = randomRe.exec(source); m !== null; m = randomRe.exec(source)) push("no-math-random", m.index);

  const dateRe = /(Date\.now\s*\(\s*\)|new\s+Date\s*\(\s*\))/g;
  for (let m = dateRe.exec(source); m !== null; m = dateRe.exec(source)) push("no-date-source", m.index);

  const hasRenderer = /new\s+THREE\.WebGLRenderer|new\s+WebGLRenderer/.test(source);
  const hasPhysics = /RigidBody|world\.step|rapier/i.test(source);

  // R3 — physics files must carry the scaffold timestep marker.
  if (hasPhysics && !/FIXED_TIMESTEP\s*=/.test(source)) {
    violations.push({ rule: "fixed-timestep", line: 1 });
  }

  // R4 — renderer setups must pin the color pipeline.
  if (hasRenderer && !/(outputColorSpace|outputEncoding)\s*=/.test(source)) {
    violations.push({ rule: "color-pipeline", line: 1 });
  }
  if (hasRenderer && !/toneMapping\s*=/.test(source)) {
    violations.push({ rule: "color-pipeline", line: 1 });
  }

  // R5 — literal near ≥ far is always wrong (heuristic; dynamic cases go to
  // runtime probes).
  const nearRe = /camera\.near\s*=\s*([\d.]+)/g;
  const farRe = /camera\.far\s*=\s*([\d.]+)/;
  const farMatch = source.match(farRe);
  if (farMatch) {
    const far = Number.parseFloat(farMatch[1]);
    for (let m = nearRe.exec(source); m !== null; m = nearRe.exec(source)) {
      if (Number.parseFloat(m[1]) >= far) push("camera-frustum", m.index);
    }
  }

  return { ok: violations.length === 0, violations };
}
