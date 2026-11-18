import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const failures = [];
const secretPatterns = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
];
const hasSecret = (value) => typeof value === 'string' && secretPatterns.some((pattern) => pattern.test(value));
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');

function fail(message) { failures.push(message); }
function safeFile(relative) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`Path escapes dataset root: ${relative}`);
  return absolute;
}
function checkEvidence(fullName, evidence) {
  if (!Array.isArray(evidence) || evidence.length < 1) return false;
  return evidence.every((item) => {
    if (!exactKeys(item, ['kind', 'url', 'description'])) return false;
    try {
      const url = new URL(item.url);
      const expected = `/${fullName}`.toLowerCase();
      const actual = decodeURIComponent(url.pathname).toLowerCase();
      return url.protocol === 'https:'
        && ['github.com', 'raw.githubusercontent.com'].includes(url.hostname.toLowerCase())
        && (actual === expected || actual.startsWith(`${expected}/`))
        && typeof item.description === 'string' && item.description.length > 0;
    } catch { return false; }
  });
}
function validateRecord(record, where) {
  if (!exactKeys(record, ['schemaVersion', 'repository', 'analysis'])) return fail(`${where}: unexpected top-level or personal fields`);
  if (record.schemaVersion !== 1) return fail(`${where}: unsupported schema version`);
  const repo = record.repository;
  const analysis = record.analysis;
  if (!exactKeys(repo, ['canonicalId', 'githubId', 'fullName', 'htmlUrl', 'description', 'language', 'topics', 'licenseSpdx', 'stars', 'updatedAt'])) return fail(`${where}: invalid repository fields`);
  if (repo.canonicalId !== `github:${repo.githubId}` || !Number.isSafeInteger(repo.githubId) || repo.githubId <= 0) return fail(`${where}: canonical repository identity mismatch`);
  if (typeof repo.fullName !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repo.fullName)) return fail(`${where}: invalid repository fullName`);
  try {
    const url = new URL(repo.htmlUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || decodeURIComponent(url.pathname).replace(/\/$/, '').toLowerCase() !== `/${repo.fullName}`.toLowerCase()) fail(`${where}: htmlUrl does not identify the repository`);
  } catch { fail(`${where}: invalid repository htmlUrl`); }
  if (typeof repo.stars !== 'number' || !Number.isSafeInteger(repo.stars) || repo.stars < 0) fail(`${where}: invalid stars count`);
  if (!Array.isArray(repo.topics) || repo.topics.some((item) => typeof item !== 'string')) fail(`${where}: invalid topics`);
  if (!exactKeys(analysis, ['summary', 'capabilities', 'useCases', 'architecture', 'limitations', 'relationships', 'evidence', 'analyzedAt', 'analyzer'])) return fail(`${where}: invalid analysis fields`);
  if (typeof analysis.summary !== 'string' || !analysis.summary.trim()) fail(`${where}: missing summary`);
  for (const key of ['capabilities', 'useCases', 'limitations', 'relationships']) if (!Array.isArray(analysis[key])) fail(`${where}: ${key} must be an array`);
  if (!checkEvidence(repo.fullName, analysis.evidence)) fail(`${where}: evidence must be HTTPS URLs inside the analyzed repository`);
  if (!exactKeys(analysis.analyzer, ['name', 'version', ...(Object.hasOwn(analysis.analyzer ?? {}, 'provider') ? ['provider'] : []), ...(Object.hasOwn(analysis.analyzer ?? {}, 'model') ? ['model'] : [])])) fail(`${where}: invalid analyzer provenance`);
  const serialized = JSON.stringify(record);
  if (secretPatterns.some((pattern) => pattern.test(serialized))) fail(`${where}: possible credential/private-key content detected`);
  if (hasSecret(repo.fullName) || hasSecret(analysis.summary)) fail(`${where}: sensitive content detected`);
}

const manifest = JSON.parse((await readFile(path.join(root, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.shards)) fail('manifest.json: unsupported or malformed manifest');
const allIds = new Set();
let count = 0;
for (const shard of manifest.shards ?? []) {
  if (!/^repositories\/[0-9a-f]{2}\.jsonl$/.test(shard.path) || !/^[0-9a-f]{64}$/.test(shard.sha256)) {
    fail(`manifest.json: invalid shard descriptor ${JSON.stringify(shard)}`); continue;
  }
  const file = safeFile(shard.path);
  const bytes = await readFile(file);
  if (sha(bytes) !== shard.sha256) fail(`${shard.path}: SHA-256 mismatch`);
  const lines = bytes.toString('utf8').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length !== shard.records) fail(`${shard.path}: record count mismatch`);
  for (const [index, line] of lines.entries()) {
    const record = JSON.parse(line.replace(/^\uFEFF/, ''));
    validateRecord(record, `${shard.path}:${index + 1}`);
    const id = record.repository?.canonicalId;
    if (allIds.has(id)) fail(`${shard.path}:${index + 1}: duplicate repository ID ${id}`);
    allIds.add(id);
    count++;
  }
}
if (count !== manifest.recordCount) fail(`manifest recordCount ${manifest.recordCount} does not match ${count}`);

const indexManifest = JSON.parse((await readFile(path.join(root, 'search-index/manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
if (indexManifest.schemaVersion !== 1 || indexManifest.recordCount !== count || !Array.isArray(indexManifest.shards)) fail('search-index/manifest.json: malformed or stale index manifest');
const indexedIds = new Set();
for (const shard of indexManifest.shards ?? []) {
  if (!/^search-index\/shards\/[0-9a-f]{2}\.json$/.test(shard.path) || !/^[0-9a-f]{64}$/.test(shard.sha256)) {
    fail(`search-index/manifest.json: invalid index shard ${JSON.stringify(shard)}`); continue;
  }
  const bytes = await readFile(safeFile(shard.path));
  if (sha(bytes) !== shard.sha256) fail(`${shard.path}: SHA-256 mismatch`);
  const data = JSON.parse(bytes.toString('utf8'));
  if (Object.keys(data).length !== shard.terms) fail(`${shard.path}: term count mismatch`);
  for (const [term, ids] of Object.entries(data)) {
    if (sha(term).slice(0, 2) !== path.basename(shard.path, '.json')) fail(`${shard.path}: term ${term} is in the wrong hash shard`);
    if (!Array.isArray(ids)) fail(`${shard.path}: term ${term} must map to an array`);
    for (const id of ids ?? []) indexedIds.add(id);
  }
}
for (const id of allIds) if (!indexedIds.has(id)) fail(`Search index is missing repository ${id}`);
for (const id of indexedIds) if (!allIds.has(id)) fail(`Search index references unknown repository ${id}`);

const orphanedFiles = (await readdir(path.join(root, 'repositories'))).filter((name) => /^[0-9a-f]{2}\.jsonl$/.test(name));
const manifestPaths = new Set((manifest.shards ?? []).map((shard) => path.basename(shard.path)));
for (const name of orphanedFiles) if (!manifestPaths.has(name)) fail(`Unreferenced repository shard: ${name}`);

if (failures.length) {
  console.error(`Dataset validation failed (${failures.length} issue(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Dataset valid: ${count} repositories, ${manifest.shards.length} data shards, ${indexManifest.shards.length} search shards.`);
}



