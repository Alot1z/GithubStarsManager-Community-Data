const $ = (selector) => document.querySelector(selector);
const state = { manifest: null, indexManifest: null, indexCache: new Map(), repoCache: new Map() };
const tokenPattern = /[\p{L}\p{N}][\p{L}\p{N}._+-]{1,}/gu;

async function hashPrefix(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('').slice(0, 2);
}

async function json(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return response.json();
}

async function loadIndexShard(prefix) {
  if (!state.indexCache.has(prefix)) {
    const path = `./search-index/shards/${prefix}.json`;
    const exists = state.indexManifest.shards.some((shard) => shard.path === path.replace('./', ''));
    state.indexCache.set(prefix, exists ? json(path) : Promise.resolve({}));
  }
  return state.indexCache.get(prefix);
}

async function loadRepoShard(prefix) {
  if (!state.repoCache.has(prefix)) {
    const path = `./repositories/${prefix}.jsonl`;
    const exists = state.manifest.shards.some((shard) => shard.path === path.replace('./', ''));
    state.repoCache.set(prefix, exists ? fetch(path).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
      const text = await response.text();
      return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    }) : Promise.resolve([]));
  }
  return state.repoCache.get(prefix);
}

function tokens(query) {
  return [...new Set(query.toLowerCase().match(tokenPattern) ?? [])];
}

function card(record) {
  const article = document.createElement('article');
  article.className = 'card';
  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = record.repository.htmlUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = record.repository.fullName;
  title.append(link);
  const summary = document.createElement('p');
  summary.textContent = record.analysis.summary;
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const label of [record.repository.language, ...record.repository.topics, ...record.analysis.capabilities.slice(0, 3)].filter(Boolean).slice(0, 8)) {
    const chip = document.createElement('span');
    chip.textContent = label;
    chips.append(chip);
  }
  const evidence = document.createElement('p');
  evidence.className = 'evidence';
  evidence.textContent = `${record.analysis.evidence.length} evidence source(s) · analyzed ${new Date(record.analysis.analyzedAt).toLocaleDateString()}`;
  article.append(title, summary, chips, evidence);
  return article;
}

function render(records, title) {
  $('#results-title').textContent = title;
  const root = $('#results');
  root.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No matching public repository findings are available yet.';
    root.append(empty);
    return;
  }
  for (const record of records) root.append(card(record));
}

async function search(query) {
  const words = tokens(query);
  if (!words.length) {
    $('#status').textContent = 'Enter one or more search terms.';
    return;
  }
  $('#status').textContent = 'Searching only the relevant public index shards…';
  const prefixes = [...new Set(await Promise.all(words.map(hashPrefix)))];
  const indexes = await Promise.all(prefixes.map(loadIndexShard));
  let ids = null;
  for (const word of words) {
    const shard = indexes[prefixes.indexOf(await hashPrefix(word))];
    const matches = new Set(shard[word] ?? []);
    ids = ids === null ? matches : new Set([...ids].filter((id) => matches.has(id)));
  }
  const canonicalIds = [...(ids ?? [])];
  const repoPrefixes = [...new Set(await Promise.all(canonicalIds.map(hashPrefix)))];
  const repoShards = await Promise.all(repoPrefixes.map(loadRepoShard));
  const records = repoShards.flat().filter((record) => ids.has(record.repository.canonicalId));
  render(records, `Results for “${query}”`);
  $('#status').textContent = `${records.length} matching public finding(s).`;
}

async function browse() {
  $('#status').textContent = 'Loading a small sample of public records…';
  const prefixes = state.manifest.shards.slice(0, 8).map((shard) => shard.path.split('/').at(-1).slice(0, 2));
  const shards = await Promise.all(prefixes.map(loadRepoShard));
  const records = shards.flat().slice(0, 40);
  render(records, 'Sample records');
  $('#status').textContent = `Showing ${records.length} sample record(s). Search loads only relevant index and data shards.`;
}

async function init() {
  try {
    [state.manifest, state.indexManifest] = await Promise.all([json('./manifest.json'), json('./search-index/manifest.json')]);
    $('#dataset-count').textContent = `${state.manifest.recordCount.toLocaleString()} public repositories`;
    $('#dataset-updated').textContent = `Dataset generated ${new Date(state.manifest.generatedAt).toLocaleString()}`;
    $('#status').textContent = state.manifest.recordCount
      ? 'Search by project name, capability, use case, or technology.'
      : 'The public dataset is initialized and currently empty. No personal repository list has been published.';
  } catch (error) {
    $('#status').textContent = error instanceof Error ? error.message : String(error);
  }
}

$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  search($('#query').value.trim()).catch((error) => { $('#status').textContent = String(error); });
});
$('#browse-button').addEventListener('click', () => browse().catch((error) => { $('#status').textContent = String(error); }));
void init();

