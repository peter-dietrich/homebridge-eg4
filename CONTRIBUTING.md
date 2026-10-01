# Contributing

Thanks for helping improve `homebridge-eg4`.

## Ground rules

- Keep the plugin read-only unless a future control feature has a separate security and safety design review.
- Never commit or post EG4 credentials, cookies, tokens, HAR captures, or unsanitized customer data.
- Do not hard-code plant IDs, serial numbers, datalogger IDs, or user-specific topology.
- Preserve the single shared polling model; accessory handlers should not add independent cloud polling loops.
- Prefer accurate HomeKit semantics over forcing data into unrelated native service types.

## Development setup

Requirements:

- Homebridge 2.x
- supported Node.js LTS release
- npm
- EG4 Monitor test account/system for integration testing

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

`.env` must remain untracked.

## Before opening a pull request

Run:

```bash
npm ci
npm run build
npm pack --dry-run
```

Then confirm:

- no credentials or private diagnostic artifacts are included
- package contents are limited to intended public files
- read-only behavior is preserved
- README and CHANGELOG are updated for user-visible behavior
- new EG4 fields are typed and handled defensively

## Reporting support for another EG4 topology

A useful report includes:

- inverter model(s)
- whether GridBOSS is present
- approximate battery topology
- Homebridge / Node.js / plugin versions
- manually reviewed sanitized discovery output when needed

Do not attach a raw HAR capture.
