# homebridge-eg4

[![npm version](https://img.shields.io/npm/v/homebridge-eg4.svg)](https://www.npmjs.com/package/homebridge-eg4)
[![CI](https://github.com/peter-dietrich/homebridge-eg4/actions/workflows/ci.yml/badge.svg)](https://github.com/peter-dietrich/homebridge-eg4/actions/workflows/ci.yml)
[![CodeQL](https://github.com/peter-dietrich/homebridge-eg4/actions/workflows/codeql.yml/badge.svg)](https://github.com/peter-dietrich/homebridge-eg4/actions/workflows/codeql.yml)
[![license](https://img.shields.io/github/license/peter-dietrich/homebridge-eg4.svg)](LICENSE)
[![node](https://img.shields.io/node/v/homebridge-eg4.svg)](package.json)

Unofficial, read-only Homebridge plugin for EG4 solar, battery, grid, load, and generator status using an EG4 Monitor-compatible interface.

> **Current release:** 0.5.0. This project is not affiliated with or endorsed by EG4 Electronics, Luxpower, Apple, or the Homebridge project.

## What it does

The plugin logs in with the account you provide, discovers accessible plants and devices, builds one shared system snapshot, normalizes the best telemetry available for the detected topology, and exposes selected logical accessories to HomeKit.

Typical Apple Home tiles include:

| Accessory | Example tile | Typical data |
| --- | --- | --- |
| Battery | `Batt 93% DIS 420W` | SOC, charging state, power, voltage, daily charge/discharge |
| Grid | `Grid OFF-GRID` or `Grid 820W` | Utility presence, grid power, grid voltage |
| Solar | `Solar 1.4kW` or `Solar OFF` | Current PV power and energy totals |
| Load | `Load 516W` | Current house/load power and energy usage |
| Generator | `Gen OFF` or `Gen 4.6kW` | Generator presence, power, voltage, frequency |

Apple Home decides which HomeKit characteristics it renders. Native Battery characteristics are shown especially well; many custom watt/voltage/kWh characteristics remain available over HAP even when Apple's Home app does not display them directly.

## Accessory selection and missing data

The Homebridge settings UI lets you independently enable or disable Battery, Grid, Solar, Load, and Generator accessories.

A selected accessory can remain visible even when the associated subsystem is inactive. This is useful, for example, when a GridBOSS has generator telemetry but no generator is currently connected: the tile can intentionally remain visible as `Gen OFF`.

The plugin distinguishes two states:

- **OFF / OFF-GRID** — valid telemetry exists and indicates that the subsystem is inactive.
- **N/A** — the user selected the accessory, but the detected topology/API does not provide enough telemetry to determine its state.

For unavailable data, the user can choose either **Show the accessory as N/A** or **Hide the accessory**.

## Compatibility

Development has been fully validated on:

- two EG4 18KPV inverters in parallel
- GridBOSS
- parallel EG4 battery storage

The compatibility layer now prefers the best telemetry source available rather than assuming every system has a GridBOSS.

| Configuration | Expected behavior |
| --- | --- |
| 18KPV + GridBOSS + batteries | Fully tested |
| 18KPV without GridBOSS | Uses inverter/parallel fallbacks where available |
| System without batteries | Battery can be hidden or shown as N/A |
| GridBOSS with no generator connected | Generator may remain visible as `Gen OFF` |
| Other EG4 hybrid inverter models | Experimental automatic discovery |
| Missing/unsupported telemetry | Selected tile shows `N/A` or is hidden |

Other EG4 inverter families remain experimental until tested with real installations. The plugin intentionally avoids inventing an OFF state when telemetry is unavailable.

## Telemetry fallback model

Whole-system GridBOSS data is preferred where available. Without it, the plugin falls back to inverter/parallel telemetry when possible.

Examples:

- Battery: GridBOSS aggregate SOC/power -> inverter SOC and charge/discharge telemetry
- Solar: GridBOSS aggregate PV power -> sum of inverter PV input power
- Load: GridBOSS aggregate load -> inverter EPS/load telemetry
- Grid: GridBOSS grid voltage/power -> other supported grid telemetry when available
- Generator: GridBOSS generator telemetry -> other compatible telemetry when supported

## Read-only safety model

This plugin does **not** use EG4 control endpoints.

It does not change inverter settings, battery settings, charge schedules, GridBOSS configuration, generator state, load state, or export behavior.

Apple Home currently renders the quick-glance status tiles as Outlet services. The Outlet `On` characteristic is advertised as writable so Apple will render a normal tile, but HomeKit write requests are intercepted locally and the observed EG4 state is restored. No corresponding control request is sent to EG4 equipment.

## Endpoint and credential security

The default endpoint is:

```text
https://monitor.eg4electronics.com
```

The official endpoint requires HTTPS on the standard port.

Advanced users may explicitly enable a **custom EG4-compatible endpoint**. This supports scenarios such as an EG4 demo/test environment or a trusted local compatibility service.

Security rules are enforced in the runtime, not only in the Homebridge UI:

- a non-official hostname requires `allowCustomEndpoint: true`
- Internet-hosted custom endpoints must use HTTPS
- plain HTTP requires a second explicit opt-in and is restricted to localhost, `.local`, or private RFC1918 addresses
- custom ports are permitted for custom endpoints
- credentials embedded in the URL are stripped
- URL query strings and fragments are stripped
- an optional base path is preserved, allowing deployments such as `https://example.test/demo`
- session cookies remain in memory only

Enabling a custom endpoint means the configured EG4 username/password will be sent to that server. Only use a server you trust.

## Security and privacy

- The plugin contains no analytics, advertising, usage tracking, or third-party telemetry.
- API diagnostics intentionally avoid logging response bodies, passwords, session cookies, or tokens.
- `.env`, logs, discovery reports, build output, and local package archives are excluded from source control/package publication.
- Homebridge stores plugin configuration according to the security of the Homebridge installation.

See [SECURITY.md](SECURITY.md) for reporting guidance.

## EG4 cloud interface

The plugin uses web endpoints observed in the EG4 Monitor web application for login, plant/device discovery, parallel inverter details, GridBOSS runtime data when available, and aggregate energy information.

This is an undocumented/private interface. EG4 can change it without notice.

Approximate flow:

```text
EG4-compatible login
  -> plant list
  -> device list
  -> primary inverter/device selection
  -> parallel topology when supported
  -> GridBOSS runtime when present
  -> energy totals when supported
  -> normalized system snapshot
  -> selected Battery / Grid / Solar / Load / Generator accessories
```

All accessories share the same polling snapshot; enabling more tiles does not create additional independent cloud polling loops.

## Requirements

- Homebridge 2.x
- supported Node.js LTS release for Homebridge (currently Node.js 22, 24, or 26)
- EG4 Monitor account or credentials accepted by the configured compatible endpoint
- network access from Homebridge to that endpoint

The default polling interval is 120 seconds. The minimum is 60 seconds.

## Installation

Install through the Homebridge plugin UI by searching for **EG4**, or:

```bash
npm install -g homebridge-eg4
```

## Configuration

The Homebridge settings UI is recommended. It groups settings into **EG4 Account & Connection**, **Apple Home Accessories**, and **Endpoint & Advanced Settings**.

Equivalent JSON:

```json
{
  "platform": "EG4",
  "name": "EG4 Energy",
  "username": "YOUR_EG4_MONITOR_USERNAME",
  "password": "YOUR_EG4_MONITOR_PASSWORD",
  "baseUrl": "https://monitor.eg4electronics.com",
  "pollInterval": 120,
  "showBattery": true,
  "showGrid": true,
  "showSolar": true,
  "showLoad": true,
  "showGenerator": true,
  "missingDataBehavior": "show-na",
  "allowCustomEndpoint": false,
  "allowInsecureLocalEndpoint": false,
  "debugApi": false
}
```

### Options

| Setting | Default | Notes |
| --- | --- | --- |
| `name` | `EG4 Energy` | Homebridge platform name |
| `username` | required | EG4-compatible login |
| `password` | required | Masked in the Homebridge UI |
| `pollInterval` | 120 | Seconds; 60-900 |
| `showBattery` | true | Show/hide Battery accessory |
| `showGrid` | true | Show/hide Grid accessory |
| `showSolar` | true | Show/hide Solar accessory |
| `showLoad` | true | Show/hide House Load accessory |
| `showGenerator` | true | Show/hide Generator accessory |
| `missingDataBehavior` | `show-na` | `show-na` or `hide` |
| `baseUrl` | official EG4 Monitor URL | Endpoint used for all EG4-compatible API calls |
| `allowCustomEndpoint` | false | Explicitly permit a non-official hostname |
| `allowInsecureLocalEndpoint` | false | Permit HTTP only to explicitly approved private/local hosts |
| `debugApi` | false | Endpoint-level diagnostics without response bodies or credentials |

Turning a tile off causes the plugin to unregister the corresponding cached HomeKit accessory on the next successful refresh.

## Support

Before opening an issue, check the [Troubleshooting](#troubleshooting) section and search existing issues.

For reproducible bugs, use the GitHub bug-report template and include:

- plugin, Homebridge, and Node.js versions
- a short description of the EG4 topology
- the expected and observed behavior
- only the relevant Homebridge log lines

Do **not** post passwords, cookies, tokens, raw HAR captures, serial numbers, plant IDs, or other sensitive identifiers.

Feature and compatibility requests are welcome through the feature-request template, particularly for EG4 topologies that have not yet been tested with real hardware.

See [SUPPORT.md](SUPPORT.md) for support scope and reporting guidance.

## Known limitations

- The EG4 Monitor interface used by this plugin is undocumented/private and can change without notice.
- Compatibility beyond the fully tested 18KPV + GridBOSS topology is currently best-effort and may depend on which telemetry fields the EG4 API exposes for a given installation.
- Grid and Generator fallbacks are more limited than Battery, Solar, and Load fallbacks on systems without GridBOSS telemetry.
- Apple Home controls which HomeKit characteristics are visible in its UI. Some watt, voltage, frequency, and energy characteristics may be available over HAP but not shown directly in the Home app.
- Status tiles use HomeKit Outlet services for Apple Home presentation. They are intentionally read-only at the EG4 side; apparent writes are intercepted locally and the observed state is restored.
- This plugin does not provide local-LAN inverter control or equipment-control features.

## Troubleshooting

If accessories do not update:

1. Confirm the account can sign in to the configured endpoint.
2. Confirm the Homebridge host can reach that endpoint.
3. Check the Homebridge log for `EG4 refresh failed`, unsupported topology warnings, or `N/A` states.
4. If using a custom URL, confirm `allowCustomEndpoint` is enabled.
5. If using local plain HTTP, confirm the hostname is private/local and `allowInsecureLocalEndpoint` is enabled.
6. Temporarily enable `debugApi` for endpoint-level diagnostics, then disable it after troubleshooting.

Do not post passwords, cookies, raw HAR captures, or Homebridge configuration files in a public issue.

## Development

```bash
git clone https://github.com/peter-dietrich/homebridge-eg4.git
cd homebridge-eg4
npm install
npm run build
```

Never commit `.env`, HAR captures, cookies, session headers, or unsanitized EG4 API data.

Development-only diagnostic helpers are intentionally excluded from the published npm build.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT-NOTES.md](DEVELOPMENT-NOTES.md).

## Publication

Before publishing a release:

```bash
npm ci
npm run build
npm pack --dry-run
```

Confirm the package contains only intended public files and that README/configuration documentation matches shipping behavior.

## License

MIT
