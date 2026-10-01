## Summary

Describe what this pull request changes and why.

## Type of change

- [ ] Bug fix
- [ ] Compatibility/topology improvement
- [ ] Homebridge or Apple Home UI change
- [ ] Documentation
- [ ] Security hardening
- [ ] Developer tooling
- [ ] Other

## Validation

Describe how you tested the change.

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm pack --dry-run`
- [ ] Tested on a live Homebridge installation when applicable
- [ ] Confirmed existing accessories retain stable UUIDs when applicable

## EG4 topology

If this affects device discovery or telemetry, describe the tested topology without posting serial numbers, plant IDs, credentials, cookies, or other private identifiers.

## Read-only safety

- [ ] This change does not add EG4 equipment-control requests.
- [ ] HomeKit writes, if exposed for presentation purposes, remain locally intercepted and do not translate into EG4 control commands.

## Privacy and security

- [ ] No credentials, cookies, tokens, HAR files, private API captures, serial numbers, or unsanitized discovery output are included.
- [ ] Logs and diagnostics avoid response bodies and sensitive identifiers.

## Documentation

- [ ] README/configuration documentation was updated if user-facing behavior changed.
- [ ] CHANGELOG was updated when appropriate.
