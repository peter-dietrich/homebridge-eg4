# homebridge-eg4

**Development status: v0.1.0-dev — discovery only**

A Homebridge plugin for EG4 solar and battery systems using the EG4 Monitor cloud interface.

The project goal is to automatically discover supported EG4 inverters, batteries, and GridBOSS devices and expose useful battery, solar, load, grid, and system-status information to Apple HomeKit.

> This is an unofficial community project and is not affiliated with EG4 Electronics or Luxpower.

## Current milestone

Version 0.1 does **not** create HomeKit accessories yet.

Its purpose is to validate the cloud API against real EG4 installations by:

1. Logging into the EG4 Monitor service.
2. Discovering plants/stations.
3. Discovering inverters and GridBOSS/MID devices.
4. Reading inverter runtime data.
5. Reading battery/BMS data.
6. Reading GridBOSS runtime data.
7. Producing a sanitized JSON report for development.

This deliberately keeps the first test read-only.

## Requirements

- macOS, Linux, or Windows development computer
- Node.js 22 or later
- npm
- VS Code is recommended
- An EG4 Monitor account
- Internet access to the EG4 Monitor portal

For actual Homebridge integration testing later:

- Homebridge 2.x
- A child bridge is recommended during development

## 1. Install Node.js

Check your current version:

```bash
node --version
npm --version
```

Node 22 or newer is required for this development branch.

## 2. Open the project

Open this folder in VS Code.

Then open **Terminal → New Terminal**.

## 3. Install development dependencies

```bash
npm install
```

This creates `node_modules` and `package-lock.json`.

Commit `package-lock.json` to Git once npm has generated it.

## 4. Configure credentials safely

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env`:

```text
EG4_USERNAME=your-eg4-login@example.com
EG4_PASSWORD=your-real-password
EG4_BASE_URL=https://monitor.eg4electronics.com
```

**Do not commit `.env`.**

The `.gitignore` supplied with the project excludes it.

## 5. Run discovery

```bash
npm run discover
```

Expected output will resemble:

```text
Connecting to https://monitor.eg4electronics.com ...
EG4 login successful.
Plant: Home
  Inverters discovered: 2
  GridBOSS/MID devices discovered: 1
  Reading inverter ending 0215 ...
    SOC=74% PV=6800W Load=2900W Charge=3100W Discharge=0W
  Reading inverter ending 0246 ...
    ...
Discovery complete.
Sanitized report written to: .../eg4-discovery-sanitized.json
```

Actual values and API response shapes can differ by firmware and equipment.

## 6. Share the sanitized result for development

The discovery script creates:

```text
eg4-discovery-sanitized.json
```

The sanitizer masks:

- serial/device identifiers
- plant IDs
- email/account fields
- address
- contact name/phone
- latitude/longitude fields

**Review the file manually before sharing it.**

Never send or commit:

```text
.env
```

## Optional debug output

Add this to `.env`:

```text
EG4_DEBUG=1
```

Then rerun:

```bash
npm run discover
```

The debug mode logs API endpoint activity but does not deliberately log the password or session cookie.

## Homebridge development mode

Version 0.1 also contains a minimal dynamic-platform plugin shell.

Once standalone discovery works, it can be linked into a Homebridge development environment:

```bash
npm run build
npm link
```

The initial Homebridge configuration will look like:

```json
{
  "platform": "EG4",
  "name": "EG4 Energy",
  "username": "YOUR_EG4_USERNAME",
  "password": "YOUR_EG4_PASSWORD",
  "baseUrl": "https://monitor.eg4electronics.com",
  "debugApi": false
}
```

For the development phase, use a Homebridge child bridge if possible.

### Important

At v0.1 the Homebridge platform performs discovery and logs the results, but **does not register HomeKit accessories**.

That is intentional.

## Planned milestones

### v0.1 — Cloud discovery
- EG4 authentication
- station discovery
- inverter discovery
- GridBOSS discovery
- battery information
- sanitized diagnostics

### v0.2 — HomeKit battery
- combined battery state of charge
- charging state
- low-battery state
- battery temperature

### v0.3 — Energy status
- PV production
- house/load power
- grid import/export
- grid availability

### v0.4 — Equipment detail
- optional per-inverter status
- optional individual batteries
- GridBOSS detail

### Later
- configuration UI improvements
- resilient polling/session renewal
- multiple stations
- optional local/hybrid transport
- carefully selected read/write controls

## Repository setup

Before publishing this repository, replace:

```text
YOUR-GITHUB-USERNAME
```

in `package.json` with your GitHub username.

The package is intentionally marked:

```json
"private": true
```

during development to prevent accidental npm publication.

## Security

This software interacts with an energy-management system.

The initial versions are intentionally **read-only**.

Do not add inverter, battery, generator, GridBOSS, or load-control functions without explicit review and safeguards.

## License

MIT
