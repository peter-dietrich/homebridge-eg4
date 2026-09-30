# Development Notes

## v0.1 validation checklist

- [ ] `node --version` is 22+
- [ ] `npm install` succeeds
- [ ] `.env` created locally and remains untracked
- [ ] `npm run build` succeeds
- [ ] `npm run discover` authenticates
- [ ] Correct station is listed
- [ ] Expected inverter count is listed
- [ ] GridBOSS is discovered, if present
- [ ] Runtime values roughly match EG4 Monitor
- [ ] Battery count/details appear
- [ ] Sanitized report contains no password or session cookie
- [ ] Sanitized report manually reviewed before sharing

## First data questions for v0.2

Once the discovery report is available, inspect:

1. Whether system SOC is duplicated across inverters or independently reported.
2. Which inverter owns/reports each battery bank.
3. Whether GridBOSS load is a better whole-house load source than inverter `pToUser`.
4. Whether grid import/export is best read from inverter runtime or GridBOSS.
5. Which fields remain stable across refreshes.
6. Whether `deviceTypeText4APP` identifies 18KPV reliably.
7. Whether battery module arrays contain unique stable IDs.

No write/control endpoints should be implemented before the read-only model is stable.
