# Security Policy

## Supported version

Security fixes are applied to the current release line. Users should run the latest published version of `homebridge-eg4`.

## Reporting a vulnerability

Please do not publish credentials, cookies, session tokens, full HAR captures, Homebridge configuration files, or unsanitized EG4 API responses in a public issue.

If GitHub offers **Report a vulnerability** on this repository's Security tab, use that private channel for security-sensitive reports. Otherwise, open a minimal GitHub issue stating that you need a private contact path, without including exploit details or secrets.

Repository: https://github.com/peter-dietrich/homebridge-eg4

## Credential handling

The plugin requires an EG4-compatible username and password because the monitored web interface uses account authentication.

By default the production client connects only to:

```text
https://monitor.eg4electronics.com
```

The client:

- keeps session cookies in memory only
- does not intentionally log passwords, cookies, authorization tokens, or response bodies
- contains no analytics, advertising, or usage-tracking integration
- strips credentials embedded in endpoint URLs
- strips URL query strings and fragments before API use

Homebridge itself stores plugin configuration. Protect the Homebridge host, configuration directory, backups, and administrative UI accordingly.

## Custom endpoints

Custom EG4-compatible endpoints are supported only through explicit opt-in.

Security rules are enforced by runtime code:

- a non-official hostname requires `allowCustomEndpoint: true`
- Internet-hosted custom endpoints must use HTTPS
- plain HTTP additionally requires `allowInsecureLocalEndpoint: true`
- plain HTTP is restricted to localhost, `.local`, or RFC1918 private-network addresses
- the official EG4 Monitor hostname remains restricted to HTTPS on the standard port

When a custom endpoint is enabled, the configured username and password are intentionally sent to that endpoint for authentication. Only configure servers you trust.

Local HTTP protects against accidental Internet transmission but does **not** encrypt traffic on the local network. HTTPS remains preferred whenever available.

## Diagnostic data

Runtime debug logging is designed to report endpoint-level failures without response bodies or authentication material.

Do not post raw HAR files, session headers, cookies, Homebridge configuration, or unreviewed API data in public issues.

## Scope

Security issues include, but are not limited to:

- credential disclosure
- session/token disclosure
- sending credentials to an unintended host
- bypassing custom-endpoint opt-in restrictions
- command/control behavior reaching EG4 equipment
- unsafe logging
- dependency or build-chain vulnerabilities that materially affect plugin users

Feature requests and ordinary compatibility bugs can be filed through normal GitHub Issues.
