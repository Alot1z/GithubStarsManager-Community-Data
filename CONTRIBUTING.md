# Contribution policy

## Eligible content

- Findings about a repository verified by the GitHub API as `visibility=public`.
- Concise summaries, capabilities, use cases, architecture notes, limitations, and relationships.
- Evidence URLs that point to the analyzed public repository and support the finding.
- Analyzer name/version and analysis timestamp.

## Never contribute

- Private or internal repositories, or findings derived from them.
- A user's starred-repository list, star timestamps, GitHub login, user ID, personal notes, or local paths.
- API tokens, credentials, private keys, environment files, database files, or model weights.
- Full source-code mirrors or large copied README/source passages.
- Claims without provenance or evidence.

## Required workflow

1. Analyze a repository in your own GithubStarsManager installation.
2. Inspect the proposed public record and evidence.
3. Explicitly approve sharing in the application (`gsm share owner/repo --approve`).
4. The application verifies repository visibility and validates the record, then saves an approved draft locally. This step does not publish anything.
5. Use the separate contribution-submit action to open a pull request. The pull request must be reviewed before merge.
6. Maintainers run `npm run rebuild` and `npm run validate` after adding or updating records.

## Validation and review

Every pull request must pass the dataset validator. Maintainers should review source visibility, evidence, accuracy, duplicates, license implications, and accidental personal or sensitive data. The automated secret-pattern scan is defense in depth, not a guarantee; human review remains required.

## Licensing

A dataset-specific license has not yet been selected. Record contributions are disabled for merge until the maintainers add and document the dataset license.

