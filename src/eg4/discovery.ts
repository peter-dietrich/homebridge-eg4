import { EG4Client } from './client.js';
import {
  EG4Device,
  EG4DiscoveryDump,
  EG4ParallelGroupResponse,
} from './types.js';

function getPlantId(plant: Record<string, unknown>): string | undefined {
  const id = plant.plantId ?? plant.id;
  return id === undefined || id === null ? undefined : String(id);
}

function getOverviewDevices(
  response: { devices?: EG4Device[]; rows?: EG4Device[] } | null,
): EG4Device[] {
  return response?.devices ?? response?.rows ?? [];
}

function collectInverters(
  overviewDevices: EG4Device[],
  parallel: EG4ParallelGroupResponse | null,
): EG4Device[] {
  const found = new Map<string, EG4Device>();

  const add = (device: EG4Device | undefined): void => {
    if (!device?.serialNum) {
      return;
    }
    found.set(device.serialNum, device);
  };

  for (const device of overviewDevices) {
    const label = `${device.deviceTypeText4APP ?? ''} ${device.modelText ?? ''}`.toLowerCase();
    if (!label.includes('gridboss') && !label.includes('mid')) {
      add(device);
    }
  }

  for (const group of parallel?.parallelGroups ?? []) {
    for (const inverter of group.inverters ?? []) {
      add(inverter);
    }
  }

  return [...found.values()];
}

function collectMidDevices(
  overviewDevices: EG4Device[],
  parallel: EG4ParallelGroupResponse | null,
): EG4Device[] {
  const found = new Map<string, EG4Device>();

  const add = (device: EG4Device | null | undefined): void => {
    if (!device?.serialNum) {
      return;
    }
    found.set(device.serialNum, device);
  };

  for (const device of overviewDevices) {
    const label = `${device.deviceTypeText4APP ?? ''} ${device.modelText ?? ''}`.toLowerCase();
    if (label.includes('gridboss') || label.includes('mid')) {
      add(device);
    }
  }

  for (const group of parallel?.parallelGroups ?? []) {
    add(group.midDevice);
  }

  return [...found.values()];
}

async function safeCall<T>(
  label: string,
  fn: () => Promise<T>,
  log: (message: string) => void,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    log(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function discoverEG4(
  client: EG4Client,
  log: (message: string) => void = console.log,
): Promise<EG4DiscoveryDump> {
  log(`Connecting to ${client.endpoint} ...`);
  const login = await client.login();
  log('EG4 login successful.');

  const plantResponse = await client.getPlants();
  const plants = plantResponse.rows?.length
    ? plantResponse.rows
    : login.plants ?? [];

  if (!plants.length) {
    throw new Error('Login succeeded, but no EG4 plants/stations were returned.');
  }

  const result: EG4DiscoveryDump = {
    generatedAt: new Date().toISOString(),
    baseUrl: client.endpoint,
    plants: [],
  };

  for (const plant of plants) {
    const plantId = getPlantId(plant);

    if (!plantId) {
      log(`Skipping plant "${plant.name ?? '(unnamed)'}" because it has no plant ID.`);
      continue;
    }

    log(`Plant: ${plant.name ?? plantId}`);

    const [overview, parallel] = await Promise.all([
      safeCall('Device overview', () => client.getDeviceOverview(plantId), log),
      safeCall('Parallel group discovery', () => client.getParallelGroups(plantId), log),
    ]);

    const overviewDevices = getOverviewDevices(overview);
    const inverters = collectInverters(overviewDevices, parallel);
    const midDevices = collectMidDevices(overviewDevices, parallel);

    log(`  Inverters discovered: ${inverters.length}`);
    log(`  GridBOSS/MID devices discovered: ${midDevices.length}`);

    const inverterRuntime: EG4DiscoveryDump['plants'][number]['inverterRuntime'] = [];

    for (const inverter of inverters) {
      if (!inverter.serialNum) {
        continue;
      }

      log(`  Reading inverter ending ${inverter.serialNum.slice(-4)} ...`);

      const [runtime, battery] = await Promise.all([
        safeCall(
          `Runtime ${inverter.serialNum.slice(-4)}`,
          () => client.getInverterRuntime(inverter.serialNum as string),
          log,
        ),
        safeCall(
          `Battery ${inverter.serialNum.slice(-4)}`,
          () => client.getBatteryInfo(inverter.serialNum as string),
          log,
        ),
      ]);

      inverterRuntime.push({
        serialNum: inverter.serialNum,
        runtime,
        battery,
      });

      if (runtime) {
        log(
          `    SOC=${runtime.soc ?? '?'}% PV=${runtime.ppv ?? '?'}W ` +
          `Load=${runtime.pToUser ?? runtime.consumptionPower ?? '?'}W ` +
          `Charge=${runtime.pCharge ?? '?'}W Discharge=${runtime.pDisCharge ?? '?'}W`,
        );
      }
    }

    const midRuntime: EG4DiscoveryDump['plants'][number]['midRuntime'] = [];

    for (const mid of midDevices) {
      if (!mid.serialNum) {
        continue;
      }

      log(`  Reading GridBOSS/MID ending ${mid.serialNum.slice(-4)} ...`);
      const runtime = await safeCall(
        `GridBOSS ${mid.serialNum.slice(-4)}`,
        () => client.getMidboxRuntime(mid.serialNum as string),
        log,
      );

      midRuntime.push({
        serialNum: mid.serialNum,
        runtime,
      });

      if (runtime) {
        log(
          `    Grid frequency=${
            typeof runtime.gridFrequency === 'number'
              ? (runtime.gridFrequency / 100).toFixed(2)
              : '?'
          }Hz Load=${runtime.loadPower ?? '?'}W`,
        );
      }
    }

    result.plants.push({
      plant,
      overview,
      parallel,
      inverterRuntime,
      midRuntime,
    });
  }

  return result;
}
