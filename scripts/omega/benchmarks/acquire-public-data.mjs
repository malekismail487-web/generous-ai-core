import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, lstat, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { pathToFileURL } from 'node:url';

// Acquisition only: never imports downloaded code, reads answer values, accepts
// access conditions, sends credentials, or claims that a harness is a full set.
export const PUBLIC_DATASETS = Object.freeze([
  ['MATH-500', 'HuggingFaceH4/MATH-500'],
  ['AIME-2025', 'MathArena/aime_2025'],
  ['AIME-2026', 'MathArena/aime_2026'],
  ['MMLU-Pro', 'TIGER-Lab/MMLU-Pro'],
  ['MMLU-ProX', 'li-lab/MMLU-ProX'],
  ['HumanEval', 'openai/openai_humaneval'],
  ['MBPP', 'google-research-datasets/mbpp'],
  ['LiveCodeBench', 'livecodebench/code_generation_lite'],
  ['HLE', 'cais/hle'],
  ['HLE-Diamond', 'cais/hle-diamond'],
  ['GAIA', 'gaia-benchmark/GAIA'],
  ['LAB-Bench', 'futurehouse/lab-bench'],
  ['BixBench', 'futurehouse/BixBench'],
  ['GDPval', 'openai/gdpval'],
  ['LongBench-v2', 'THUDM/LongBench-v2'],
  ['AA-LCR', 'ArtificialAnalysis/AA-LCR'],
]);

export function publicDatasetPath(root, dataset, revision, filename) {
  if (!isAbsolute(root) || !/^[A-Za-z0-9_][\w.-]*\/[A-Za-z0-9_][\w.-]*$/.test(dataset)
    || !/^[a-f0-9]{40}$/.test(revision) || typeof filename !== 'string'
    || !filename || /[\\:%?#]/.test(filename)
    || filename.split('/').some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
    || /[\x00-\x1f]/.test(filename)) throw Error('public_dataset_path_rejected');
  const base = resolve(root, 'public-datasets', dataset.replace('/', '--'), revision);
  const target = resolve(base, filename);
  const inside = relative(base, target);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw Error('public_dataset_path_rejected');
  return target;
}

async function publicFetch(url, fetcher = fetch, timeoutMs = 120_000) {
  if (url.origin !== 'https://huggingface.co') throw Error('public_dataset_origin_rejected');
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'NYX-public-evaluation-acquisition/1' } });
  // Redirected CDN URLs stay internal; never persist or log their signed query.
  return response;
}

async function regularParents(root, target) {
  let current = dirname(target);
  while (current !== root) {
    const relation = relative(root, current);
    if (!relation || relation.startsWith('..') || isAbsolute(relation)) throw Error('public_dataset_parent_rejected');
    try { const entry = await lstat(current); if (entry.isSymbolicLink() || !entry.isDirectory()) throw Error('public_dataset_parent_rejected'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(current); if (parent === current) throw Error('public_dataset_parent_rejected'); current = parent;
  }
  const entry = await lstat(root);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw Error('public_dataset_root_rejected');
}

export async function acquirePublicDatasets(root, options = {}) {
  root = resolve(root);
  const maxFileBytes = options.maxFileBytes ?? 256 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 4 * 1024 * 1024 * 1024;
  const downloadTimeoutMs = options.downloadTimeoutMs ?? 900_000;
  const datasets = options.datasets ?? PUBLIC_DATASETS;
  const fetcher = options.fetcher ?? fetch;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1
    || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < maxFileBytes
    || !Number.isSafeInteger(downloadTimeoutMs) || downloadTimeoutMs < 1000 || downloadTimeoutMs > 1_800_000)
    throw Error('public_dataset_limits_invalid');
  const rootEntry = await lstat(root);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) throw Error('public_dataset_root_rejected');
  const report = { schemaVersion: 1, identity: 'NYX-PUBLIC-DATA-ACQUISITION-2026-10-15',
    observedAt: new Date().toISOString(), root, maxFileBytes, maxTotalBytes, downloadTimeoutMs, downloadedBytes: 0,
    credentialsUsed: false, rawExamplesPrinted: false, sourceCodeExecuted: false,
    benchmarkScoreClaim: false, sources: [] };
  for (const [benchmark, dataset] of datasets) {
    if (!/^[A-Za-z0-9_][\w.-]*\/[A-Za-z0-9_][\w.-]*$/.test(dataset)) throw Error('public_dataset_identity_rejected');
    const source = { benchmark, dataset, revision: null, gated: null, license: null,
      state: 'METADATA_PENDING', artifacts: [], deferred: [] };
    report.sources.push(source);
    try {
      const metadataResponse = await publicFetch(new URL(`https://huggingface.co/api/datasets/${dataset}?blobs=true`), fetcher);
      if (!metadataResponse.ok) { source.state = `METADATA_HTTP_${metadataResponse.status}`; continue; }
      const metadata = await metadataResponse.json();
      if (!/^[a-f0-9]{40}$/.test(metadata.sha) || !Array.isArray(metadata.siblings)) throw Error('public_dataset_metadata_invalid');
      source.revision = metadata.sha; source.gated = metadata.gated ?? false;
      source.license = metadata.cardData?.license ?? null;
      if (source.gated !== false) { source.state = 'BLOCKED_AUTHOR_ACCESS_CONDITIONS'; continue; }
      const artifacts = metadata.siblings.filter(file => /\.(parquet|jsonl|jsonl\.gz|csv|json)$/i.test(file.rfilename)
        && !/(^|\/)(?:dataset_infos|config|package|tokenizer_config)\.json$/.test(file.rfilename));
      for (const file of artifacts) {
        const filename = file.rfilename, declaredBytes = file.lfs?.size ?? file.size ?? null;
        const expectedSha256 = file.lfs?.sha256 ?? null;
        if (declaredBytes !== null && (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0
          || declaredBytes > maxFileBytes || report.downloadedBytes + declaredBytes > maxTotalBytes)) {
          source.deferred.push({ filename, declaredBytes, reason: 'RESOURCE_LIMIT_NOT_FULL_ACQUISITION' }); continue;
        }
        const target = publicDatasetPath(root, dataset, metadata.sha, filename);
        await regularParents(root, target); await mkdir(dirname(target), { recursive: true });
        try {
          const entry = await lstat(target);
          if (!entry.isFile() || entry.isSymbolicLink() || entry.size > maxFileBytes) throw Error('public_dataset_existing_target_rejected');
          const hasher = createHash('sha256');
          for await (const chunk of createReadStream(target)) hasher.update(chunk);
          const sha256 = hasher.digest('hex');
          if (expectedSha256 && sha256 !== expectedSha256 || declaredBytes !== null && declaredBytes !== entry.size)
            throw Error('public_dataset_existing_digest_mismatch');
          source.artifacts.push({ filename, bytes: entry.size, sha256, state: 'EXISTING_BYTES_REHASHED', authorLfsVerified: !!expectedSha256 }); continue;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const response = await publicFetch(new URL(`https://huggingface.co/datasets/${dataset}/resolve/${metadata.sha}/${filename}`), fetcher, downloadTimeoutMs);
        if (!response.ok) { source.deferred.push({ filename, reason: `DOWNLOAD_HTTP_${response.status}` }); continue; }
        const announced = response.headers.get('content-length');
        if (announced && (!/^\d+$/.test(announced) || Number(announced) > maxFileBytes)) throw Error('public_dataset_response_size_rejected');
        const partial = `${target}.download-${process.pid}`;
        let size = 0; const hash = createHash('sha256');
        const bounded = new Transform({ transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > maxFileBytes || report.downloadedBytes + size > maxTotalBytes) { callback(Error('public_dataset_stream_limit')); return; }
          hash.update(chunk); callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body), bounded, createWriteStream(partial, { flags: 'wx' }));
        const sha256 = hash.digest('hex');
        if (expectedSha256 && sha256 !== expectedSha256 || declaredBytes !== null && declaredBytes !== size) throw Error('public_dataset_author_digest_or_size_mismatch');
        await rename(partial, target); report.downloadedBytes += size;
        source.artifacts.push({ filename, bytes: size, sha256, state: 'DOWNLOADED', authorLfsVerified: !!expectedSha256 });
      }
      source.state = source.deferred.length ? 'PARTIAL_PUBLIC_DATA_ACQUIRED' : source.artifacts.length
        ? 'PUBLIC_TABLES_ACQUIRED_ASSETS_AND_EVALUATOR_NOT_CERTIFIED' : 'METADATA_ONLY_NO_MATCHING_TABLES';
    } catch (error) {
      // Network errors can contain signed redirect URLs. Persist only an owned code.
      source.state = 'ACQUISITION_ERROR'; source.error = /^[a-z_]+$/.test(error.message) ? error.message : 'public_dataset_transport_or_io_failure';
      source.errorClass = ['Error', 'TypeError', 'AbortError', 'TimeoutError'].includes(error.name) ? error.name : 'Other';
    } finally {
      const receipt = join(root, 'public-data-acquisition-2026-10-15.json');
      await regularParents(root, receipt);
      try { const entry = await lstat(receipt); if (!entry.isFile() || entry.isSymbolicLink()) throw Error('public_dataset_receipt_target_rejected'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await writeFile(receipt, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'w' });
      options.onSource?.({ benchmark, state: source.state, artifacts: source.artifacts.length, deferred: source.deferred.length });
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2];
  if (!root || !isAbsolute(root)) throw Error('public_dataset_absolute_cache_root_required');
  const result = await acquirePublicDatasets(root, { onSource: value => console.log(JSON.stringify(value)) });
  console.log(JSON.stringify({ identity: result.identity, downloadedBytes: result.downloadedBytes,
    sources: result.sources.length, completeBenchmarkClaim: false }));
}
