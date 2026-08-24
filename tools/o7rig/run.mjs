import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const scenePath = process.argv[2] || 'canyon-v3.html';
const outPrefix = process.argv[3] || 'run';

// ---- Static gate (JS mirror of src/lib/codelab/engine/linter.ts R1–R5) ----
function lint(source) {
  const v = [];
  if (/Math\.random\s*\(/.test(source)) v.push('no-math-random');
  if (/(Date\.now\s*\(\s*\)|new\s+Date\s*\(\s*\))/.test(source)) v.push('no-date-source');
  if (/RigidBody|world\.step|rapier/i.test(source) && !/FIXED_TIMESTEP\s*=/.test(source)) v.push('fixed-timestep');
  if (/new\s+(THREE\.)?WebGLRenderer/.test(source)) {
    if (!/(outputColorSpace|outputEncoding)\s*=/.test(source) || !/toneMapping\s*=/.test(source)) v.push('color-pipeline');
  }
  const far = source.match(/camera\.far\s*=\s*([\d.]+)/);
  const nears = source.matchAll(/camera\.near\s*=\s*([\d.]+)/g);
  if (far) for (const n of nears) if (parseFloat(n[1]) >= parseFloat(far[1])) v.push('camera-frustum');
  return v;
}

const source = readFileSync(scenePath, 'utf8');
const lintViolations = lint(source);
console.log('LINT:' + JSON.stringify(lintViolations));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(await readFileSync(new URL('./hook.js', import.meta.url), 'utf8'));
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));

await page.goto('file:///' + process.cwd().replace(/\\/g, '/') + '/' + scenePath, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1200));

// early still
await page.screenshot({ path: `${outPrefix}-still.png` });

// inject the eyes
const { ERROR_HOOK, BATTERY } = await import('./eyes.mjs');
await page.evaluate(ERROR_HOOK); // late-install (pre-doc hooks already in hook.js)
const report = await page.evaluate(BATTERY);
await page.screenshot({ path: `${outPrefix}-after.png` });

writeFileSync(`${outPrefix}.perception.json`, JSON.stringify(report, null, 2));
console.log('REPORT:' + JSON.stringify(report));
await browser.close();
