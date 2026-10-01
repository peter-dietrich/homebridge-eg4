# Changelog

All notable changes to this project are documented here.

## 0.4.1 - Homebridge verification fixes

### Fixed
- Corrected `config.schema.json` to use JSON Schema's object-level `required` array.
- Catches and logs startup configuration failures instead of allowing rejected startup promises.
- Excludes development-only discovery/environment tooling from the compiled npm package.
- Removes discovery commands that read environment files from the published package scripts.

### Security
- Keeps the installed Homebridge runtime limited to its configured Homebridge settings and EG4 cloud connection.
- Reduces automated-review surface by excluding diagnostic report tooling from the release build.

## 0.4.0 - Release candidate

### Added
- Five logical HomeKit accessories: Battery, Grid, Solar, Load, and Generator.
- Dynamic compact tile labels such as `Batt 93% DIS 420W`, `Grid OFF-GRID`, `Solar 1.4kW`, `Load 516W`, and `Gen OFF`.
- Native HomeKit Battery Level, Charging State, and Low Battery characteristics.
- GridBOSS generator voltage, frequency, and phase-power status.
- Daily solar, usage, battery charge, and battery discharge telemetry.
- Native status characteristics where HomeKit service definitions support them.
- Security policy, contributor guide, CI, CodeQL, and dependency-update configuration.

### Changed
- Tile-facing status services use HomeKit Outlet services because Apple Home renders them as useful quick-glance tiles.
- HomeKit writes to status-only Outlet tiles are intercepted locally and never translated into EG4 control calls.
- Grid availability is determined from GridBOSS RMS voltage rather than grid watts.
- Battery charge/discharge direction prefers inverter-level charge/discharge telemetry with aggregate fallback.
- Runtime version reporting is centralized.
- npm package metadata and Homebridge configuration schema are prepared for public publication.
- npm publication uses an explicit file allowlist.

### Security
- EG4 credentials may only be sent over HTTPS to the approved EG4 Monitor host.
- API error diagnostics no longer include response body samples.
- Discovery-output redaction covers additional token/session, identity, datalogger, and device identifier fields.
- Homebridge configuration renders the password as a password field.
- No analytics, advertising, tracking, or third-party telemetry is included.

### Removed
- Obsolete single-system accessory implementation.
- Obsolete v0.2 patch instructions.

## 0.3.6-dev
- Replaced experimental Switch tiles with Outlet tiles.
- Added Generator accessory.
- Added compact dynamic labels and removed spaces before W/kW.
- Removed the separate Grid Contact Sensor presentation.

## 0.3.5-dev
- Added richer native status characteristics.
- Added custom daily-energy, battery-power, battery-voltage, and grid-voltage characteristics.
- Confirmed Apple Home exposes native Battery and selected native status characteristics while hiding many custom characteristics.

## 0.3.4-dev
- Added dynamic HomeKit accessory naming so live watts/SOC appear in Apple Home tiles.
- Added writable-looking status tiles whose writes are intercepted locally.
- Restored Grid status alongside the tile experiment.

## 0.3.3-dev
- Added dynamic Solar tile naming.

## 0.3.2-dev
- Experimented with writable-looking Solar status tile behavior to obtain a full Apple Home tile.

## 0.3.1-dev
- Split the original system accessory into Grid, Battery, Solar, and House Load accessories.
- Preserved a shared polling snapshot so split accessories do not multiply cloud polling.

## 0.2.2-dev
- Added native Grid Contact Sensor experiment.
- Preserved native Battery service for SOC, Charging State, and Low Battery.
- Determined grid availability from GridBOSS RMS voltage.

## 0.2.1-dev
- Fixed TypeScript build issues in the early HomeKit implementation.
- Removed obsolete discovery code from compilation.

## 0.2.0-dev
- First HomeKit accessory implementation.
- Added authoritative device discovery, GridBOSS aggregate runtime data, parallel energy totals, polling, and native battery status.

## 0.1.2-dev
- Added behavior-based device classification and sanitized discovery output.

## 0.1.1-dev
- Preserved all EG4 login cookies.
- Added browser-like request headers and sanitized diagnostics.

## 0.1.0-dev
- Initial EG4 cloud authentication and discovery prototype.
