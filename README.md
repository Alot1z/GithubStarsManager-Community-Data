# GithubStarsManager Community Data

This repository is the **public, shared knowledge dataset** for GithubStarsManager. It contains compact, evidence-backed findings about public GitHub repositories so users do not need to repeat the same discovery and analysis.

It is separate from each user's personal database. It does not contain anyone's starred-repository list, personal notes, private-repository data, local analysis history, credentials, or model weights.

## Current state

The repository is initialized with versioned schemas, an empty manifest, a static public explorer, and automated dataset validation. No personal star list or repository analysis has been published.

## Browse

The repository root is designed to be served as a static GitHub Pages site. The explorer reads only the public manifest and the index/data shards needed for a search. It does not request GitHub credentials and has no private-data functionality.

## Data layout

- `schema/`: versioned JSON Schemas for records and manifests.
- `manifest.json`: public catalogue of data shards, record counts, and checksums.
- `repositories/`: partitioned JSONL records, keyed by a SHA-256 prefix of the canonical repository ID.
- `search-index/`: token index shards that map search terms to stable repository IDs.
- `scripts/rebuild-index.mjs`: deterministic shard and search-index generation.
- `scripts/validate.mjs`: schema-shape, provenance, checksum, privacy, and duplicate checks.
- `CONTRIBUTING.md`: public contribution and review policy.

## Stable identity

Each repository is identified by `github:<immutable numeric repository id>`. Names and URLs are metadata and may change when a repository is renamed or transferred.

## Contribute

Only findings about verified public repositories are eligible initially. A user must explicitly approve each finding in their own GithubStarsManager installation. The application saves the approved contribution locally; a separate submit action creates a pull request. Analysis and synchronization never publish automatically.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full policy.

## Rebuild and validate

```powershell
npm run rebuild
npm run validate
```

The rebuild command reads only repository JSONL files and regenerates the manifest and token index. It does not fetch repositories or access user accounts.

## Dataset license

The dataset-specific license has not yet been selected. Until that is resolved, this repository publishes only its schemas, validation code, and empty manifest. Do not contribute third-party-derived records until a dataset license is added.
