import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, relative, isAbsolute} from 'node:path';
import {PUBLIC_DATASETS, publicDatasetPath, acquirePublicDatasets} from './omega/benchmarks/acquire-public-data.mjs';

let passed = 0, failed = 0;
function check(name, action) {
  try {action(); passed++;} catch {failed++; console.error(`FAILED ${name}`);}
}
const root = resolve(tmpdir(), 'nyx-acquisition-development-paths');
const revision = 'a'.repeat(40);
check('public catalog preserves canonical SWE variants without duplicate identities or model-output datasets', () => {
  assert.equal(new Set(PUBLIC_DATASETS.map(([, dataset]) => dataset)).size, PUBLIC_DATASETS.length);
  for (const name of ['SWE-bench', 'SWE-bench_Lite', 'SWE-bench_Verified', 'SWE-bench_Multilingual', 'SWE-bench_Multimodal'])
    assert(PUBLIC_DATASETS.some(([, dataset]) => dataset === `SWE-bench/${name}`));
  assert(!PUBLIC_DATASETS.some(([, dataset]) => /(?:_outputs|model[-_]trajectories)/i.test(dataset)));
});
check('public data path remains below the dedicated immutable revision', () =>
  assert.equal(publicDatasetPath(root, 'author/data', revision, 'data/test.jsonl'),
    resolve(root, 'public-datasets', 'author--data', revision, 'data/test.jsonl')));
for (const filename of ['../escape', '/escape', 'data/../escape', 'data\\escape', 'data/file:stream',
  'data/%2e%2e/escape', 'data/x?redirect=other', 'data/x#fragment', 'data/NUL', 'data/CON.txt', 'data/name.',
  'data/name ', '', 'data//file', 'data/./file'])
  check(`unsafe artifact filename rejected ${filename}`, () =>
    assert.throws(() => publicDatasetPath(root, 'author/data', revision, filename)));
for (const dataset of ['../escape', 'author/data/other', 'https://host/x', '', 'author\\data'])
  check(`unsafe dataset identity rejected ${dataset}`, () =>
    assert.throws(() => publicDatasetPath(root, dataset, revision, 'table.json')));

const temporary = await mkdtemp(resolve(tmpdir(), 'nyx-acquisition-test-'));
try {
  const bytes = Buffer.from('{"syntheticDevelopmentOnly":true}\n');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let networkCalls = 0;
  const fetcher = async (url, options) => {
    networkCalls++;
    assert.equal(url.origin, 'https://huggingface.co');
    assert(!Object.keys(options.headers).some(key => /authorization|cookie/i.test(key)));
    if (url.pathname.startsWith('/api/')) return Response.json({sha: revision, gated: false,
      siblings: [{rfilename: 'table.jsonl', lfs: {size: bytes.length, sha256}}], cardData: {license: 'mit'}});
    return new Response(bytes);
  };
  const acquired = await acquirePublicDatasets(temporary, {datasets: [['DEVELOPMENT', 'author/data']],
    maxFileBytes: 1000, maxTotalBytes: 2000, fetcher});
  check('acquisition verifies author bytes without executing or exposing examples', () => {
    assert.equal(acquired.downloadedBytes, bytes.length); assert.equal(acquired.sources[0].artifacts[0].sha256, sha256);
    assert.equal(acquired.sources[0].artifacts[0].authorLfsVerified, true);
    assert.equal(acquired.benchmarkScoreClaim, false); assert.equal(acquired.credentialsUsed, false);
    assert.equal(acquired.sourceCodeExecuted, false); assert.equal(networkCalls, 2);
  });
  const replay = await acquirePublicDatasets(temporary, {datasets: [['DEVELOPMENT', 'author/data']],
    maxFileBytes: 1000, maxTotalBytes: 2000, fetcher});
  check('existing immutable bytes are rehashed and not redownloaded', () => {
    assert.equal(networkCalls, 3); assert.equal(replay.downloadedBytes, 0);
    assert.equal(replay.sources[0].artifacts[0].state, 'EXISTING_BYTES_REHASHED');
  });
  let gatedCalls = 0;
  const gated = await acquirePublicDatasets(temporary, {datasets: [['GATED-DEVELOPMENT', 'author/gated']],
    fetcher: async () => {gatedCalls++; return Response.json({sha: revision, gated: 'auto', siblings: []});}});
  check('author access conditions are respected without credential discovery or gate bypass', () => {
    assert.equal(gatedCalls, 1); assert.equal(gated.sources[0].state, 'BLOCKED_AUTHOR_ACCESS_CONDITIONS');
    assert.equal(gated.sources[0].artifacts.length, 0);
  });
  const failedFetch = await acquirePublicDatasets(temporary, {datasets: [['DEVELOPMENT', 'author/failed']],
    fetcher: async () => {throw Error('failed https://cdn.invalid/private?signature=do-not-log');}});
  check('network exception text and signed URLs never enter saved receipts', () => {
    const encoded = JSON.stringify(failedFetch);
    assert(!encoded.includes('signature=')); assert(!encoded.includes('cdn.invalid'));
    assert.equal(failedFetch.sources[0].error, 'public_dataset_transport_or_io_failure');
  });
  const limited = await acquirePublicDatasets(temporary, {datasets: [['DEVELOPMENT', 'author/large']],
    maxFileBytes: 10, maxTotalBytes: 20,
    fetcher: async () => Response.json({sha: revision, gated: false,
      siblings: [{rfilename: 'table.jsonl', lfs: {size: 10000, sha256}}]})});
  check('a deferred oversized file is reported as partial rather than full benchmark acquisition', () => {
    assert.equal(limited.sources[0].state, 'PARTIAL_PUBLIC_DATA_ACQUIRED');
    assert.equal(limited.sources[0].artifacts.length, 0); assert.equal(limited.sources[0].deferred.length, 1);
  });
  const receipt = JSON.parse(await readFile(resolve(temporary, 'public-data-acquisition-2026-10-15.json'), 'utf8'));
  check('saved receipt records metadata only and does not contain synthetic file content', () => {
    assert.equal(receipt.rawExamplesPrinted, false); assert(!JSON.stringify(receipt).includes('syntheticDevelopmentOnly'));
  });
} finally {
  const relationship = relative(resolve(tmpdir()), temporary), entry = await lstat(temporary);
  if (!relationship.startsWith('nyx-acquisition-test-') || relationship.includes('/') || relationship.includes('\\')
    || isAbsolute(relationship) || !entry.isDirectory() || entry.isSymbolicLink()) throw Error('test_cleanup_boundary_rejected');
  await rm(temporary, {recursive: true});
}
console.log(`OMEGA_BENCHMARK_ACQUISITION_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
