import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { EG4Client } from '../eg4/client.js';
import { getSystemSnapshots } from '../eg4/snapshot.js';
import { sanitizeForSharing } from '../eg4/sanitize.js';
import { DEFAULT_BASE_URL } from '../settings.js';

const username = process.env.EG4_USERNAME;
const password = process.env.EG4_PASSWORD;
const baseUrl = process.env.EG4_BASE_URL ?? DEFAULT_BASE_URL;
const output =
  process.env.EG4_DISCOVERY_OUTPUT ??
  'eg4-discovery-sanitized.json';

if (!username || !password) {
  console.error('Missing EG4 credentials in .env.');
  process.exitCode = 1;
} else {
  try {
    const client = new EG4Client({
      username,
      password,
      baseUrl,
      debug:
        process.env.EG4_DEBUG === '1'
          ? (message) => console.log(`[debug] ${message}`)
          : undefined,
    });

    const snapshots = await getSystemSnapshots(
      client,
      (message) => console.warn(message),
    );

    for (const snapshot of snapshots) {
      console.log(`Plant: ${snapshot.plant.name ?? '(unnamed)'}`);
      console.log(
        `  Devices: ${snapshot.devices
          .map(
            (device) =>
              `${device.deviceTypeText ?? device.deviceType ?? '?'} ` +
              `...${device.serialNum?.slice(-4) ?? '????'}`,
          )
          .join(', ')}`,
      );

      console.log(
        `  Primary inverter: ...${
          snapshot.primaryInverter.serialNum?.slice(-4) ?? '????'
        }`,
      );

      if (snapshot.gridBoss?.serialNum) {
        console.log(
          `  GridBOSS: ...${snapshot.gridBoss.serialNum.slice(-4)}`,
        );
      }

      const system = snapshot.midbox?.deviceData;
      if (system) {
        console.log(
          `  System SOC=${system.soc ?? '?'}% PV=${system.ppv ?? '?'}W ` +
          `Battery=${system.batPower ?? '?'}W ` +
          `Grid=${system.gridPower ?? '?'}W ` +
          `BackupLoad=${system.peps ?? '?'}W`,
        );
      }
    }

    const outputPath = resolve(process.cwd(), output);
    await writeFile(
      outputPath,
      `${JSON.stringify(sanitizeForSharing(snapshots), null, 2)}\n`,
      'utf8',
    );

    console.log(`Sanitized report written to: ${outputPath}`);
  } catch (error) {
    console.error(
      `Discovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
