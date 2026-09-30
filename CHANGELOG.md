# Changelog


## 0.2.1-dev.1

- Fix TypeScript build errors introduced by stale `src/eg4/discovery.ts`.
- Remove obsolete discovery code from compilation.
- Fix `PlatformAccessory` context typing.
- Confirm HAP battery service uses `Service.Battery`.
- Remove placeholder battery-temperature service.
- Use `ReturnType<typeof setInterval>` for the poll timer.



## 0.2.0-dev.1

- First HomeKit accessory implementation.
- Use `/WManage/web/config/inverter/list` for authoritative device discovery.
- Use primary inverter serial for `getParallelGroupDetails`.
- Use GridBOSS `getMidboxRuntime` as aggregate system source.
- Use `getInverterEnergyInfoParallel` for aggregate energy totals.
- Expose native HomeKit battery SOC, charging state, and low-battery status.
- Log aggregate PV, battery, grid, and backup-load values.
- Add polling interval configuration.
- Keep implementation read-only.



## 0.1.2-dev.1

- Add behavior-based device classification.
- Probe inverter runtime first, then GridBOSS/MID runtime when inverter data is absent.
- Preserve sanitized source device metadata in discovery output.
- Separate device records into `inverter`, `gridboss`, and `unknown`.
- Avoid hard-coding any serial-number suffixes.
- Prepare discovery output for HomeKit mapping in v0.2.


## 0.1.1-dev.1

- Preserve all cookies returned by EG4 login instead of only `JSESSIONID`.
- Add `language=ENGLISH` to login request.
- Add browser-like AJAX headers used by the EG4 web interface.
- Add sanitized diagnostics for non-JSON HTTP responses.
- Log only the final digits of plant/device identifiers.
- Fall back to `plants[].inverters[]` from the login response if overview discovery fails.
- Restore `.env.example`, `.gitignore`, and `.npmignore` in the downloadable package.

## 0.1.0-dev.1

- Initial cloud authentication and discovery prototype.
