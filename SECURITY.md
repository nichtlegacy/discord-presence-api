# Security Policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/nichtlegacy/discord-presence-api/security/advisories/new).
Do not open a public issue.

Expect a first reply within a week.

## Scope

The service is internet-facing and fetches remote images on behalf of whoever
sets a Discord presence, so the interesting classes are:

- **SSRF** — anything that makes the container reach a host outside the
  allowlist in `src/lib/http.ts`, or reach an address chosen by an activity's
  asset fields.
- **Injection into the rendered document** — a card parameter or an upstream
  string that escapes into the SVG, a CSS declaration or an attribute.
- **Access control** — rendering a card for a user ID outside
  `ALLOWED_USER_IDS`.
- **Resource exhaustion** — a request that bypasses the per-IP rate limit, the
  5 s upstream timeout or the 2 MB response cap.

Known and accepted: the host allowlist has no DNS pinning. A rebinding attack
would need control over one of the four Discord/Lanyard domains.

## Out of scope

Upstream outages or bad data from Lanyard and dcdn.dstn.to, and anything that
requires an operator to have already set a hostile `DEFAULT_PARAMS` or
`ALLOWED_USER_IDS`.
