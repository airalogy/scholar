# Security Policy

## Supported versions

Security updates are provided for the latest released minor version. A deployment should report its exact version and commit through `GET /version`; unreleased source snapshots and modified forks may require their maintainers to reproduce an issue before it can be investigated.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue. Use the repository's private vulnerability reporting feature under **Security → Advisories → New draft security advisory** and include:

- the affected Scholar version, Git commit, and deployment mode;
- the affected endpoint or component;
- reproduction steps and expected impact;
- whether real institutional or personal data may be involved.

Remove access tokens, passwords, personal data, institution data, and private URLs from screenshots and logs. Maintainers will acknowledge a complete report, coordinate remediation, and publish an advisory when a fix is available.

Operational support, incident response SLAs, and security maintenance for a private institutional deployment are commercial services and are not implied by the open-source license.
