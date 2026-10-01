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

## Logical systems within a plant

An EG4 Monitor plant can contain more than one electrical system. The plugin must not assume that every inverter listed under one plant participates in the same power flow.

Discovery rules:

- inverters reported together by the parallel-group endpoint are treated as one logical electrical system
- a GridBOSS is associated with the logical system identified by the parallel group's midbox serial
- an inverter with no usable parallel-group membership is treated as a standalone logical system
- one logical system in a plant preserves the historical plant-based HomeKit UUIDs
- multiple logical systems in one plant receive separate system identities and therefore separate Battery, Grid, Solar, Load, and Generator accessories
- multi-system accessory names use deterministic short prefixes `A`, `B`, `C`, etc. so Apple Home can distinguish systems without tying labels to a specific inverter model
- accessories belonging to systems no longer returned by successful discovery are explicitly unregistered

This means a two-inverter parallel installation remains one five-accessory HomeKit system, while two independent inverter systems under the same EG4 Monitor plant can expose two separate five-accessory sets.

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

## Public demo topology discovery

The repository includes a development-only utility for exercising the public EG4 demo plant without using a personal EG4 account:

```bash
node tools/demo-discover.mjs
```

The script:

- establishes the public EG4 guest/demo session
- enumerates visible demo plants and devices
- probes the same read-only parallel, midbox, and energy endpoints used by the plugin
- applies the current device-selection and telemetry-normalization rules
- prints a sanitized compatibility report to stdout
- never sends EG4 control commands

The tool intentionally lives outside `src/` and is not included in the npm `files` allowlist, so it is not shipped with the production package.

Use the report to identify additional inverter/topology combinations and telemetry-field differences before changing production compatibility logic. Do not treat public demo telemetry as a substitute for testing on real customer hardware.

### End-to-end Homebridge demo mode

For development only, Homebridge can use the public EG4 guest demo session instead of account credentials. This setting is intentionally omitted from `config.schema.json` and is not a supported end-user option.

Add the following property manually to the EG4 platform configuration:

```json
"demoMode": true
```

Alternatively, start Homebridge with:

```bash
HOMEBRIDGE_EG4_DEMO=1
```

When enabled, the plugin ignores EG4 account credentials for authentication, establishes the public demo guest session, and runs the normal snapshot/accessory pipeline. This is intended for end-to-end validation from EG4 demo telemetry through Homebridge and Apple Home.

Do not document demo mode as a normal production feature.

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
