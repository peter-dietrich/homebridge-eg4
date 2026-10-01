# homebridge-eg4

Unofficial, read-only Homebridge plugin for EG4 solar, battery, GridBOSS, load, and generator status using the EG4 Monitor cloud interface.

> **Release candidate:** 0.4.0. The project is being prepared for its first public npm release. It is not affiliated with or endorsed by EG4 Electronics, Luxpower, Apple, or the Homebridge project.

## What it does

The plugin logs in to EG4 Monitor with the account you provide, discovers the accessible plant and devices, builds one aggregate system snapshot, and exposes that snapshot to HomeKit through separate logical accessories.

Current HomeKit presentation:

| Accessory | Example tile | Data |
| --- | --- | --- |
| Battery | `Batt 93% DIS 420W` | SOC, charging state, low-battery state, charge/discharge power, battery voltage, daily charged/discharged energy |
| Grid | `Grid OFF-GRID` or `Grid 820W` | Utility presence from GridBOSS RMS voltage, grid power, grid voltage |
| Solar | `Solar 1.4kW` or `Solar OFF` | Current PV power, today's solar energy, total solar energy |
| Load | `Load 516W` | Current aggregate house load, today's usage, total usage |
| Generator | `Gen OFF` or `Gen 4.6kW` | Generator presence, power, voltage, frequency |

Apple Home decides which HomeKit characteristics it renders. Native Battery characteristics are shown particularly well; many custom watt/voltage/kWh characteristics are retained in HAP but may not appear in Apple's Home app.

## Tested topology

Development has been validated on an EG4 installation using:

- two EG4 18KPV inverters in parallel
- GridBOSS
- parallel EG4 battery storage

Other EG4 topologies may work but should be considered experimental until reported by additional users.

## Read-only safety model

This plugin does **not** use EG4 control endpoints.

It does not change inverter settings, battery settings, charge schedules, GridBOSS configuration, generator state, load state, or export behavior.

Apple Home currently renders the quick-glance status tiles as Outlet services. The Outlet `On` characteristic is advertised as writable so Apple will render a normal tile, but any HomeKit write request is intercepted locally and the real observed EG4 state is immediately restored. No corresponding write request is sent to EG4 equipment.

## Security and privacy

- EG4 username and password are used only to authenticate directly to the configured EG4 Monitor service.
- The production client requires HTTPS and currently permits credentials to be sent only to `monitor.eg4electronics.com`.
- Session cookies are kept in memory only.
- The plugin contains no analytics, advertising, usage tracking, or third-party telemetry.
- API diagnostics intentionally avoid logging response bodies, passwords, session cookies, or tokens.
- The optional discovery tool sanitizes common personal fields and masks device identifiers before writing its report.
- `.env`, logs, discovery reports, build output, and local package archives are excluded from source control/package publication.

Homebridge stores plugin configuration, including credentials, according to the security of your Homebridge installation. Protect access to Homebridge UI, its configuration directory, and host operating system.

See [SECURITY.md](SECURITY.md) for reporting guidance.

## EG4 cloud interface

The plugin uses the same web endpoints observed in the EG4 Monitor web application, including plant/device discovery, parallel inverter details, GridBOSS runtime data, and aggregate energy information.

This is an undocumented/private cloud interface. EG4 can change it without notice, which may break the plugin until an update is released.

Approximate flow:

```text
EG4 Monitor login
  -> plant list
  -> device list
  -> primary inverter + GridBOSS discovery
  -> parallel inverter details
  -> GridBOSS aggregate runtime
  -> parallel energy totals
  -> one shared system snapshot
  -> Battery / Grid / Solar / Load / Generator
```

Splitting the HomeKit presentation into five accessories does not create five independent EG4 polling loops.

## Requirements

- Homebridge 2.x
- Supported Node.js LTS release for Homebridge (currently Node.js 22, 24, or 26)
- EG4 Monitor account with access to the target installation
- Internet access from the Homebridge host to EG4 Monitor

The default polling interval is 120 seconds. The minimum is 60 seconds to avoid unnecessarily aggressive cloud polling.

## Installation

After the first npm release, installation will be available through the Homebridge plugin UI by searching for **EG4**, or from a shell with:

```bash
npm install -g homebridge-eg4
```

Until the npm release is published, use the GitHub development checkout described under **Development** below.

## Configuration

The Homebridge settings UI is the recommended configuration method.

Equivalent JSON:

```json
{
  "platform": "EG4",
  "name": "EG4 Energy",
  "username": "YOUR_EG4_MONITOR_USERNAME",
  "password": "YOUR_EG4_MONITOR_PASSWORD",
  "baseUrl": "https://monitor.eg4electronics.com",
  "pollInterval": 120,
  "debugApi": false
}
```

### Options

| Setting | Default | Notes |
| --- | --- | --- |
| `name` | `EG4 Energy` | Homebridge platform name |
| `username` | required | EG4 Monitor login |
| `password` | required | Masked in the Homebridge settings UI |
| `baseUrl` | official EG4 Monitor URL | HTTPS only; production code currently allows only the official EG4 Monitor host |
| `pollInterval` | 120 | Seconds; accepted range 60-900 |
| `debugApi` | false | Logs endpoint-level diagnostics without response bodies or credentials |

## HomeKit behavior

### Battery

The Battery accessory retains a native HomeKit Battery service so Apple Home and Siri can expose:

- Battery Level / state of charge
- Charging State
- Low Battery

The tile name adds power direction and magnitude where available:

- `Batt 93% CHG 1.3kW`
- `Batt 93% DIS 420W`
- `Batt 93% IDLE`

### Grid

Grid availability is based on GridBOSS RMS voltage rather than instantaneous grid watts. This matters because grid power can be 0 W while utility voltage is still present.

- below the grid-voltage threshold: `Grid OFF-GRID`
- grid present: `Grid <power>`

The power value is intentionally shown without an import/export label until EG4 sign semantics have been validated across more systems.

### Solar and Load

Solar and Load use concise dynamic names because Apple Home does not provide native standard characteristics for arbitrary whole-home watts:

- `Solar 1.4kW`
- `Solar OFF`
- `Load 516W`

Custom current/total energy characteristics remain available to HomeKit controllers that choose to expose them.

### Generator

Generator status uses GridBOSS generator voltage and phase power where available:

- `Gen OFF`
- `Gen ON`
- `Gen 4.6kW`

The generator accessory is status-only and never starts or stops a generator.

## Troubleshooting

If accessories do not update:

1. Confirm the same account can sign in to EG4 Monitor.
2. Confirm the Homebridge host can reach `https://monitor.eg4electronics.com`.
3. Check the Homebridge log for `EG4 refresh failed` or discovery warnings.
4. Temporarily enable `debugApi` for endpoint-level diagnostics.
5. Disable `debugApi` after troubleshooting.

Do not post passwords, cookies, full HAR captures, unsanitized discovery output, or Homebridge configuration files in a public issue.

## Development

Clone and build:

```bash
git clone https://github.com/peter-dietrich/homebridge-eg4.git
cd homebridge-eg4
npm install
npm run build
```

For local discovery testing:

```bash
cp .env.example .env
# edit .env locally
npm run discover
```

Never commit `.env`, HAR captures, cookies, session headers, or unsanitized EG4 API data.

A development Homebridge host can update from GitHub with:

```bash
cd ~/homebridge-dev/homebridge-eg4
git pull origin main
npm install
npm run build
```

Then restart Homebridge or the plugin child bridge.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT-NOTES.md](DEVELOPMENT-NOTES.md).

## Publication

The package is structured for npm/Homebridge discovery:

- package name begins with `homebridge-`
- includes the required `homebridge-plugin` keyword
- advertises HAP support
- contains a Homebridge `config.schema.json`
- builds as ESM for Homebridge 2
- npm publication is restricted to an explicit file allowlist

Publishing to npm is a separate maintainer action and should only be done after a clean build/test of the release candidate.

## License

MIT
