# Support

homebridge-eg4 is an unofficial, community-maintained, read-only Homebridge plugin for EG4 monitoring.

## Where to get help

Use GitHub Issues for:

- reproducible plugin bugs
- installation or configuration problems specific to this plugin
- requests for additional EG4 model/topology compatibility
- Homebridge or Apple Home presentation issues
- documentation improvements

Please search existing issues first.

## What to include

For bug reports, include:

- homebridge-eg4 version
- Homebridge version
- Node.js version
- EG4 topology, including inverter model(s), GridBOSS or other midbox if present, batteries, and parallel configuration
- expected behavior
- observed behavior
- relevant sanitized Homebridge log lines

Do not include serial numbers, plant IDs, passwords, session cookies, tokens, raw HAR files, or unsanitized API captures.

## Scope

The plugin is intentionally read-only. It does not send EG4 equipment-control commands.

Support requests involving inverter settings, battery charging schedules, generator control, GridBOSS configuration changes, export control, or other equipment-control actions are outside the current project scope.

The project uses an undocumented/private EG4 Monitor interface. Changes made by EG4 may temporarily break compatibility until the plugin is updated.

## Security issues

Do not report security vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Compatibility reports

Reports from users with different EG4 inverter families and system topologies are especially useful. If your system is not listed as fully tested in the README, please describe the topology without including unique device identifiers.
