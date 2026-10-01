# Security Policy

## Supported version

Security fixes are applied to the current release line. Users should run the latest published version of `homebridge-eg4`.

## Reporting a vulnerability

Please do not publish credentials, cookies, session tokens, full HAR captures, Homebridge configuration files, or unsanitized EG4 API responses in a public issue.

If GitHub offers **Report a vulnerability** on this repository's Security tab, use that private channel for security-sensitive reports. Otherwise, open a minimal GitHub issue stating that you need a private contact path, without including exploit details or secrets.

Repository: https://github.com/peter-dietrich/homebridge-eg4

## Credential handling

The plugin requires an EG4 Monitor username and password because the EG4 web interface uses account authentication.

The production client:

- requires HTTPS
- restricts authentication to the approved EG4 Monitor host
- keeps session cookies in memory only
- does not intentionally log passwords, cookies, authorization tokens, or response bodies
- contains no analytics, advertising, or usage-tracking integration

Homebridge itself stores plugin configuration. Protect the Homebridge host, configuration directory, backups, and administrative UI accordingly.

## Diagnostic data

The optional discovery tool applies redaction to common personal information, account fields, tokens, location data, plant/device identifiers, and datalogger identifiers.

Redaction is defense in depth, not a guarantee that an undocumented API can never add a new sensitive field. Always inspect a diagnostic file manually before sharing it.

## Scope

Security issues include, but are not limited to:

- credential disclosure
- session/token disclosure
- sending credentials to an unintended host
- command/control behavior reaching EG4 equipment
- unsafe logging
- dependency or build-chain vulnerabilities that materially affect plugin users

Feature requests and ordinary compatibility bugs can be filed through normal GitHub Issues.
