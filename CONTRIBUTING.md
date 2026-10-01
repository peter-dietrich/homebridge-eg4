# Contributing

Thanks for helping improve `homebridge-eg4`.

## Ground rules

- Keep the plugin read-only unless a future control feature has a separate security and safety design review.
- Never commit or post EG4 credentials, cookies, tokens, HAR captures, or unsanitized customer data.
- Do not hard-code plant IDs, serial numbers, datalogger IDs, inverter labels, or user-specific topology.
- Preserve the single shared polling model.
- Prefer normalized telemetry and capability checks over topology-specific assumptions in accessory code.
- Preserve the distinction between a known OFF state and unavailable telemetry.
- Do not weaken custom-endpoint credential protections for convenience.

## Development setup

Requirements:

- Homebridge 2.x
- supported Node.js LTS release
- npm
- EG4 Monitor or another explicitly trusted EG4-compatible test endpoint

```bash
git clone https://github.com/peter-dietrich/homebridge-eg4.git
cd homebridge-eg4
npm install
npm run build
```

Development-only diagnostics must remain outside the published runtime package.

## Before opening a pull request

Run:

```bash
npm ci
npm run build
npm pack --dry-run
```

Confirm:

- no credentials or private diagnostic artifacts are included
- package contents are limited to intended public files
- read-only behavior is preserved
- README and CHANGELOG are updated for user-visible behavior
- new EG4 fields are typed and handled defensively
- accessory visibility and removal behavior remains correct
- custom endpoint changes preserve explicit opt-in and transport restrictions

## Reporting another EG4 topology

Please include:

- exact inverter model(s)
- quantity of inverters and whether they are parallel
- whether GridBOSS is present
- battery model/topology if known
- whether a generator is connected
- which HomeKit tiles show valid data, N/A, or unexpected values
- Homebridge version
- Node.js version
- plugin version

If diagnostics are requested, manually review them before sharing. Do not attach a raw HAR capture or a Homebridge configuration containing credentials.

## Custom endpoints

Custom EG4-compatible endpoints are advanced/test functionality.

When reporting an endpoint compatibility issue, share only:

- scheme (`https` or local `http`)
- hostname type (official, public custom, private IP, localhost, or `.local`)
- whether a custom base path/port is used
- resulting HTTP status/error text after removing sensitive material

Never post endpoint credentials.
