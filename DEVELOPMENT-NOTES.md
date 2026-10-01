# Development Notes

## Architecture

`EG4Platform` performs one poll per configured interval and builds shared snapshots. Each snapshot is passed to five presentation handlers:

- Grid
- Battery
- Solar
- Load
- Generator

Do not create independent polling loops inside accessory handlers.

## Data sources

Current cloud flow uses:

- EG4 login
- plant list
- inverter/device configuration list
- parallel-group details
- GridBOSS runtime
- parallel energy information

GridBOSS aggregate runtime data is preferred for whole-system values where available.

## Safety rules

This project is intentionally read-only.

Do not add EG4 configuration/control endpoints without a separate design/security review. HomeKit Outlet writes currently exist only to obtain useful Apple Home tiles; handlers must ignore the requested state and restore observed state without issuing a device/cloud control request.

Never log:
- passwords
- cookies
- authorization/session tokens
- full unsanitized response bodies
- full HAR captures

## Release validation

Before publishing:

- [ ] `npm ci` succeeds
- [ ] `npm run build` succeeds
- [ ] `npm pack --dry-run` contains only intended public files
- [ ] package and lockfile versions match
- [ ] Homebridge starts without plugin errors
- [ ] EG4 authentication succeeds
- [ ] expected inverter count and GridBOSS are discovered
- [ ] Battery SOC roughly matches EG4 Monitor
- [ ] PV/load/grid values roughly match EG4 Monitor
- [ ] Grid switches between connected/off-grid correctly
- [ ] Generator remains OFF when no generator input is present
- [ ] tile taps do not cause any EG4 equipment change
- [ ] debug logs contain no credentials/session material
- [ ] discovery report is manually reviewed before sharing
- [ ] README/config schema match the shipping behavior

## Compatibility

Homebridge 2 is ESM-based. Keep imports compatible with `NodeNext` module resolution and import Homebridge/HAP types from `homebridge`.

Homebridge supports current even-numbered Node.js LTS lines. CI covers Node.js 22, 24, and 26 for this release candidate.

## Apple Home notes

Apple Home controls presentation. Custom characteristics may be available over HAP but not rendered by Apple's Home app.

Do not represent watts/kWh as unrelated native characteristics (temperature, humidity, motion, etc.) merely to force them into the Apple UI.

## Testing new EG4 topologies

When receiving diagnostics from another user:

1. Ask for the output of the built-in discovery tool, not a HAR capture.
2. Require manual review of the sanitized file before sharing.
3. Treat unknown device types conservatively.
4. Avoid hard-coded user serial numbers or plant IDs.
5. Add new topology support without weakening the official-host credential restriction.
