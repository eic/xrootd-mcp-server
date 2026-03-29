# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have found a security vulnerability in this project, please report it privately using one of the following methods:

1. **GitHub Private Vulnerability Reporting** – Use the [Report a vulnerability](https://github.com/eic/xrootd-mcp-server/security/advisories/new) button on the Security tab of this repository. This is the preferred method.

2. **Email** – If you cannot use GitHub Private Vulnerability Reporting, contact us at [eic-projdet-compsw-l-request@lists.bnl.gov](mailto:eic-projdet-compsw-l-request@lists.bnl.gov) with the details described below.

3. **EIC Organization Admins (for EIC members only)** – If you are a member of the EIC GitHub organization, you may also contact the [EIC GitHub Admins team](https://github.com/orgs/eic/teams/admins) for further escalation if needed.

## What to Include

Please include as much of the following information as possible to help us understand and reproduce the issue:

- Type of vulnerability (e.g., credential exposure, injection, denial of service)
- Full paths of the source file(s) related to the vulnerability
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if available)
- Impact assessment — what an attacker could achieve by exploiting it

## Responsible Disclosure Policy

We follow a **90-day responsible disclosure** timeline:

| Milestone | Timeframe |
|-----------|-----------|
| Acknowledgment of your report | Within **5 business days** |
| Initial triage and severity assessment | Within **10 business days** |
| Fix developed and validated | Within **90 days** of report |
| Public disclosure | After a fix is released, or at the 90-day deadline — whichever comes first |

If a vulnerability is especially severe or complex, we may request a short, mutually agreed extension before public disclosure. We will keep you informed of our progress throughout.

We ask that you:

- Give us the full 90-day period to resolve the issue before any public disclosure.
- Avoid accessing, modifying, or deleting data that does not belong to you during testing.
- Act in good faith and not exploit the vulnerability beyond what is necessary to demonstrate the issue.

## Scope

This policy applies to the `xrootd-mcp-server` source code and its published Docker images. Vulnerabilities in upstream dependencies (e.g., the XRootD server software, `@modelcontextprotocol/sdk`) should be reported to their respective maintainers.

## Recognition

We appreciate responsible disclosure. With your permission, we are happy to acknowledge your contribution in the release notes when the fix is published.
