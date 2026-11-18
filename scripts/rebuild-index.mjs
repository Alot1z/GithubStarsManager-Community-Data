import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const tokenPattern = /[\p{L}\p{N}][\p{L}\p{N}._+-]{1,}/gu;
const secretPatterns = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
];

function tokens(record) {
  const text = [
    record.repository.fullName,
    record.repository.description ?? '',
    record.repository.language ?? '',
    ...(record.repository.topics ?? []),
    record.analysis.summary,
    ...(record.analysis.capabilities ?? []),
    ...(record.analysis.useCases ?? []),
    record.analysis.architecture ?? '',
    ...(record.analysis.limitations ?? []),
  ].join(' ').toLowerCase();
  return [...new Set(text.match(tokenPattern) ?? [])].filter((item) => item.length >= 2);
}

const sourceFiles = (await readdir(path.join(root, 'repositories'), { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /^[0-9a-f]{2}\.jsonl$/.test(entry.name))
  .map((entry) => path.join(root, 'repositories', entry.name));
const all = [];
for (const file of sourceFiles) {
  const raw = await readFile(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const record = JSON.parse(line.replace(/^\uFEFF/, ''));
    if (record.repository?.canonicalId !== `github:${record.repository?.githubId}`) {
      throw new Error(`Invalid canonical identity in ${path.relative(root, file)}`);
    }
    all.push(record);
  }
}

const byRepoShard = new Map();
const tokenIndex = new Map();
const seen = new Set();
for (const record of all) {
  const id = record.repository.canonicalId;
  if (seen.has(id)) throw new Error(`Duplicate repository identity: ${id}`);
  seen.add(id);
  const repoPrefix = sha(id).slice(0, 2);
  if (!byRepoShard.has(repoPrefix)) byRepoShard.set(repoPrefix, []);
  byRepoShard.get(repoPrefix).push(record);
  for (const token of tokens(record)) {
    const prefix = sha(token).slice(0, 2);
    if (!tokenIndex.has(prefix)) tokenIndex.set(prefix, new Map());
    const terms = tokenIndex.get(prefix);
    if (!terms.has(token)) terms.set(token, new Set());
    terms.get(token).add(id);
  }
}

const generatedAt = new Date().toISOString();
const repositoryShards = [];
for (const [prefix, records] of [...byRepoShard.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  records.sort((a, b) => a.repository.canonicalId.localeCompare(b.repository.canonicalId));
  const content = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const relative = `repositories/${prefix}.jsonl`;
  await writeFile(path.join(root, relative), content, 'utf8');
  repositoryShards.push({ path: relative, sha256: sha(content), records: records.length });
}

const indexShards = [];
for (const [prefix, terms] of [...tokenIndex.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const data = Object.fromEntries([...terms.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([term, ids]) => [term, [...ids].sort()]));
  const content = `${JSON.stringify(data, null, 2)}\n`;
  const relative = `search-index/shards/${prefix}.json`;
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), content, 'utf8');
  indexShards.push({ path: relative, sha256: sha(content), terms: Object.keys(data).length });
}

await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt, recordCount: all.length, shards: repositoryShards }, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'search-index/manifest.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt, recordCount: all.length, shards: indexShards }, null, 2)}\n`, 'utf8');
console.log(`Indexed ${all.length} repositories into ${repositoryShards.length} data shards and ${indexShards.length} search shards.`);



