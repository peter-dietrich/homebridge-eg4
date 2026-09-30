# homebridge-eg4

**Development status: v0.2.1-dev — first HomeKit accessory**

Unofficial Homebridge plugin for EG4 solar and battery systems using the EG4 Monitor cloud interface.

## What v0.2 does

- Authenticates to EG4 Monitor.
- Discovers plants and devices from the portal's configuration device list.
- Identifies the primary 18KPV and GridBOSS.
- Reads parallel topology from the primary inverter.
- Reads aggregate live system data from the GridBOSS runtime endpoint.
- Reads parallel energy totals.
- Creates one read-only HomeKit accessory per plant.
- Exposes native HomeKit Battery Level, Charging State, and Low Battery status.
- Logs aggregate PV, battery power, grid power, and backup load values.
- Polls at 120 seconds by default.

## Important limitation

Apple HomeKit does not provide native characteristics for solar watts, grid watts, or load watts. v0.2 logs those values but does not yet force them into misleading HomeKit service types.

Battery temperature is not yet mapped because the aggregate GridBOSS payload does not expose a trustworthy temperature field. That will be added from a dedicated BMS source.

## Local test

```bash
npm install
npm run build
npm run discover
```

## Homebridge test

Copy the project to the Homebridge host or clone the Git repository there, then from the plugin folder:

```bash
npm install
npm run build
sudo npm link
```

Configure the plugin:

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

During development, run the plugin as a child bridge.

## Safety

v0.2 is read-only. It does not send inverter, battery, GridBOSS, generator, or load-control commands.

## License

MIT


## v0.2.1 development fix

This build corrects a packaging error in v0.2.0-dev:

- Removes the obsolete pre-v0.2 discovery implementation that referenced deleted API methods/types.
- Uses the current snapshot/discovery path only.
- Corrects Homebridge `PlatformAccessory` typing.
- Uses the current HAP `Service.Battery` service.
- Removes the unimplemented battery-temperature service rather than publishing a false 0°C value.
- Uses a portable interval timer type.

