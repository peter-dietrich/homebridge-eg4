# homebridge-eg4

**Development status: v0.3.1-dev.1 — split HomeKit accessories / read-only tile experiment**

Unofficial Homebridge plugin for EG4 solar and battery systems using the EG4 Monitor cloud interface.

This project is currently under active development and has been tested against an EG4 system with two 18KPV inverters, a GridBOSS, and parallel battery storage.

## Current capabilities

The plugin authenticates to the EG4 Monitor portal and uses the same cloud endpoints that power the EG4 web interface.

It currently:

- Authenticates to EG4 Monitor with the configured account.
- Discovers plants and devices from the EG4 configuration device list.
- Identifies the primary 18KPV inverter and GridBOSS.
- Reads the parallel inverter topology.
- Reads aggregate live system data from the GridBOSS runtime endpoint.
- Reads aggregate energy totals for the parallel inverter group.
- Polls EG4 at a configurable interval (120 seconds by default).
- Creates four logical HomeKit accessories from one EG4 system snapshot.
- Remains fully read-only; it does not send control commands to EG4 equipment.

## HomeKit accessories

### EG4 Grid

Quick-glance grid availability.

- Native read-only HomeKit Switch service.
- **On** = utility/grid voltage is present.
- **Off** = off-grid / utility voltage is absent.
- Grid availability is determined from GridBOSS RMS voltage, not instantaneous grid watts.

Using voltage matters because grid power may correctly be 0 W while the utility grid is still available.

### EG4 Battery

Battery state and charging information.

Native HomeKit data:

- Battery Level / State of Charge (SOC).
- Charging State.
- Low Battery status.

Current development tile:

- Native read-only HomeKit Switch service.
- **On** = battery system is actively charging.
- **Off** = battery system is not actively charging.

Additional read-only telemetry:

- Battery Power (W).
- Battery Voltage (V).

The native Battery service is retained because it works well with Siri. For example, Siri can answer questions about the battery level of the EG4 Battery accessory.

### EG4 Solar

Quick-glance PV production state.

- Native read-only HomeKit Switch service.
- **On** = meaningful PV production is present.
- **Off** = PV production is effectively zero.
- Current Power (W) is exposed as a custom characteristic.
- Total Energy (kWh) is exposed as a custom characteristic.

### EG4 House Load

Quick-glance house/load state.

- Native read-only HomeKit Switch service.
- **On** = meaningful house load is present.
- **Off** = essentially no house load is present.
- Current Power (W) is exposed as a custom characteristic.
- Total Energy (kWh) is exposed as a custom characteristic.

## Why the split accessory model?

Apple Home renders HomeKit service types differently.

Battery, contact, motion, occupancy, and similar sensor services often appear as room-status attributes rather than normal room tiles. Solar watts and whole-home load watts also do not have standard native HomeKit service types.

v0.3 splits the EG4 system into four logical accessories so Apple Home can provide a faster at-a-glance view while still preserving the real EG4 telemetry underneath.

The current v0.3.1 experiment uses native Switch services as **read-only state indicators** to encourage Apple Home to render normal tiles.

These Switch services intentionally do **not** expose write permission. Tapping a tile must not send a command to the inverter, battery system, or GridBOSS.

## Apple Home limitations

Apple Home does not provide standard native characteristics for:

- Solar power in watts.
- Whole-home load power in watts.
- Battery charge/discharge power in watts.
- Grid import/export power in watts.

The plugin therefore uses native HomeKit characteristics where the meaning is accurate and custom read-only characteristics for richer EG4 telemetry.

Apple Home may not display every custom characteristic. Third-party HomeKit applications may expose more of the underlying HAP data.

## EG4 data flow

The current discovery/runtime flow is approximately:

```text
EG4 login
   ↓
Plant list
   ↓
Configuration device list
   ↓
Primary 18KPV + GridBOSS discovery
   ↓
Parallel group details
   ↓
GridBOSS aggregate runtime
   ↓
Parallel energy totals
   ↓
Single system snapshot
   ↓
EG4 Grid / Battery / Solar / House Load
```

All four HomeKit accessories are updated from the same system snapshot. Splitting the HomeKit presentation does not multiply EG4 cloud polling.

## Configuration

Example Homebridge platform configuration:

```json
{
  "platform": "EG4",
  "name": "EG4 Energy",
  "username": "YOUR_EG4_USERNAME",
  "password": "YOUR_EG4_PASSWORD",
  "baseUrl": "https://monitor.eg4electronics.com",
  "pollInterval": 120,
  "debugApi": false
}
```

During development, running the plugin as a Homebridge child bridge is recommended so plugin changes are isolated from other Homebridge plugins.

## Local development

Requirements:

- Node.js 22 or later.
- Homebridge 2.x.
- TypeScript.
- An EG4 Monitor account with access to the target system.

Install dependencies and build:

```bash
npm install
npm run build
```

Run cloud discovery from a local `.env` file:

```bash
npm run discover
```

Example development environment:

```text
EG4_USERNAME=...
EG4_PASSWORD=...
EG4_BASE_URL=https://monitor.eg4electronics.com
```

Do not commit `.env`, HAR files, cookies, session headers, or other EG4 credentials to GitHub.

## Homebridge development workflow

A convenient development workflow is to keep a normal Git checkout outside Homebridge's plugin directory and link it into Homebridge.

Example checkout:

```bash
cd ~
mkdir -p homebridge-dev
cd homebridge-dev
git clone https://github.com/peter-dietrich/homebridge-eg4.git
cd homebridge-eg4
npm install
npm run build
```

How the development checkout is linked into Homebridge depends on the Homebridge installation. On systems where the Homebridge service owns its plugin directory, a development symlink can be used.

After each code update:

```bash
cd ~/homebridge-dev/homebridge-eg4
git pull origin main
npm install
npm run build
```

Then restart Homebridge or the EG4 child bridge.

Because `dist/` is generated locally and normally ignored by Git, **the Homebridge host must run `npm run build` after pulling new TypeScript source**.

## Read-only safety model

The current plugin is intentionally read-only.

It does not:

- Change inverter settings.
- Change battery settings.
- Start or stop charging.
- Change GridBOSS configuration.
- Start a generator.
- Control loads.
- Export power.
- Send switch commands back to EG4 equipment.

Any HomeKit services used for visual presentation are status indicators only.

## Current development notes

### v0.3.1-dev.1

- Split the original single `Dietrich-House` style accessory into:
  - EG4 Grid
  - EG4 Battery
  - EG4 Solar
  - EG4 House Load
- Preserve native HomeKit Battery Level and Charging State.
- Add read-only Switch services for room-tile presentation.
- Add custom power/energy characteristics for richer telemetry.
- Remove the legacy single-system accessory automatically.
- Keep one EG4 polling cycle for all logical accessories.

### Known limitations

- Apple Home decides tile and accessory presentation; Homebridge cannot fully control its UI.
- Custom power/energy characteristics may not appear in Apple Home.
- Battery temperature is not yet mapped from a dedicated BMS source.
- Device support outside the currently tested EG4 topology is still experimental.
- EG4 Monitor is an undocumented/private cloud interface and may change.

## License

MIT
