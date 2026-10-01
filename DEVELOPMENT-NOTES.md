# Development Notes

## Architecture

`EG4Platform` performs one poll per configured interval and builds shared snapshots. Each snapshot is normalized before it reaches the HomeKit presentation layer.

The five logical accessory roles are:

- Grid
- Battery
- Solar
- Load
- Generator

Accessory visibility is user-configurable. Do not add independent polling loops inside accessory handlers.

## Normalized telemetry model

`snapshot.ts` is responsible for translating topology-specific EG4 data into normalized capability metrics.

Presentation handlers should consume `snapshot.metrics` rather than assuming a GridBOSS or a particular inverter model.

Preferred source order:

- Battery: GridBOSS aggregate -> inverter/parallel SOC and charge/discharge telemetry
- Solar: GridBOSS aggregate PV -> sum of inverter PV input power
- Load: GridBOSS aggregate load -> inverter EPS/load telemetry
- Grid: reliable grid voltage/power telemetry where available
- Generator: GridBOSS generator voltage/frequency/power, with future compatible sources allowed

A metric with `available: false` must not be represented as a known OFF state.

## Accessory lifecycle

Selected accessories are created/updated from the shared snapshot.

- enabled + data available -> create/update with observed state
- enabled + no data + `show-na` -> create/update as N/A
- enabled + no data + `hide` -> unregister/remove
- disabled -> unregister/remove

Stable UUIDs remain `eg4-<role>-<plantId>`.

## Endpoint handling

The default endpoint is `https://monitor.eg4electronics.com`.

Runtime validation rules:

1. Official EG4 host: HTTPS, standard port.
2. Any non-official host requires `allowCustomEndpoint`.
3. Internet-hosted custom endpoints require HTTPS.
4. Plain HTTP requires `allowInsecureLocalEndpoint` and is restricted to localhost, `.local`, or private RFC1918 hosts.
5. Custom ports are allowed for custom endpoints.
6. URL username/password, query, and fragment are stripped.
7. A custom base path is preserved.
8. `Origin` is generated from URL origin, while `Referer` follows the selected base path.

Never silently weaken these checks to support a new topology.

## Data sources

Current flow may use:

- EG4-compatible login
- plant list
- inverter/device configuration list
- parallel-group details
- GridBOSS runtime when present
- parallel energy information when supported

All undocumented API calls must fail gracefully because endpoint availability varies by topology and firmware.

## Safety rules

This project is intentionally read-only.

Do not add EG4 configuration/control endpoints without a separate design/security review. HomeKit Outlet writes exist only to obtain useful Apple Home tiles; handlers must ignore requested state and restore observed state without issuing device/cloud control requests.

Never log:

- passwords
- cookies
- authorization/session tokens
- full unsanitized response bodies
- full HAR captures

## OFF versus N/A

This semantic distinction is required:

- `OFF` / `OFF-GRID`: valid telemetry exists and indicates inactive/disconnected.
- `N/A`: telemetry required to determine the state is unavailable.

Do not infer OFF from missing fields.

## Testing new EG4 topologies

A useful topology report includes:

1. inverter model(s)
2. whether GridBOSS is present
3. battery topology
4. whether generator input is physically connected
5. Homebridge / Node.js / plugin versions
6. manually reviewed, sanitized diagnostics when needed

Treat unknown device types conservatively. Do not hard-code user serials, plant IDs, or one installation's device labels.

## Release validation

Before publishing:

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm pack --dry-run`
- [ ] package and lockfile versions match
- [ ] Homebridge starts without plugin errors
- [ ] official EG4 endpoint authentication succeeds
- [ ] custom HTTPS endpoint rejection/opt-in behavior is tested
- [ ] local HTTP is rejected unless both local/private and explicitly enabled
- [ ] all five accessory visibility toggles are tested
- [ ] disabled cached accessories are removed
- [ ] `show-na` and `hide` behavior are tested
- [ ] tested 18KPV + GridBOSS values still match EG4 Monitor
- [ ] no-GridBOSS fallback is tested where hardware/API data is available
- [ ] tile taps do not cause EG4 equipment changes
- [ ] debug logs contain no credentials/session material
- [ ] README/config schema match shipping behavior

## Compatibility

Homebridge 2 is ESM-based. Keep imports compatible with `NodeNext` module resolution and import Homebridge/HAP types from `homebridge`.

CI covers supported even-numbered Node.js LTS lines.

## Apple Home notes

Apple Home controls presentation. Custom characteristics may be available over HAP but not rendered by Apple's Home app.

Do not represent watts/kWh as unrelated native characteristics merely to force them into Apple's UI.
