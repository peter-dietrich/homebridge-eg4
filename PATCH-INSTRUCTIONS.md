# homebridge-eg4 v0.2.2 UI patch

This is an incremental patch. Do **not** replace your repository folder.

## On your Mac repository

Copy:

```text
src/accessories/systemAccessory.ts
```

over the existing file at:

```text
<repo>/src/accessories/systemAccessory.ts
```

Then edit `package.json` and change only:

```json
"version": "0.2.1-dev.1"
```

to:

```json
"version": "0.2.2-dev.1"
```

If `src/platform.ts` contains:

```text
Initializing EG4 platform v0.2.0-dev.
```

change that text to:

```text
Initializing EG4 platform v0.2.2-dev.
```

Build locally:

```bash
npm run build
```

Commit/push normally:

```bash
git add src/accessories/systemAccessory.ts package.json src/platform.ts
git commit -m "Add HomeKit grid status primary service"
git push origin main
```

## On the Homebridge host

Your existing symlink remains in place. Update the checkout:

```bash
cd ~/homebridge-dev/homebridge-eg4
git pull origin main
npm install
npm run build
```

Restart Homebridge from the UI.

## Expected HomeKit behavior

The existing Dietrich-House accessory keeps the same UUID and room assignment.

It gains a primary read-only Contact Sensor service named:

```text
Grid Connection
```

HomeKit semantics:

- Closed / Contact Detected = utility grid voltage present
- Open / Contact Not Detected = utility grid voltage absent

The native Battery service remains on the same accessory and should continue to show:

- Battery Level
- Charging
- Low Battery

Grid status uses GridBOSS `gridRmsVolt`, not grid watts. This matters because grid power can be 0 W while the utility grid is still connected.

The threshold is 180 V line-to-line. EG4 reports this field in tenths of a volt.

## Scope

This patch is still read-only. It sends no commands to EG4 equipment.
