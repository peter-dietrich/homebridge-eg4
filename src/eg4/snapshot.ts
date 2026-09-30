import { EG4Client } from './client.js';
import {
  EG4Device,
  EG4EnergyInfo,
  EG4MidboxRuntime,
  EG4ParallelGroupResponse,
  EG4SystemSnapshot,
} from './types.js';

function plantIdOf(plant: Record<string, unknown>): string | undefined {
  const id = plant.plantId ?? plant.id;
  return id === undefined || id === null ? undefined : String(id);
}

function selectPrimary(devices: EG4Device[]): EG4Device | undefined {
  return (
    devices.find(
      (device) =>
        String(device.deviceTypeText ?? '').toLowerCase() === '18kpv' &&
        Number(device.masterOrSlave) === 1,
    ) ??
    devices.find(
      (device) =>
        String(device.deviceTypeText ?? '').toLowerCase() === '18kpv',
    )
  );
}

function selectGridBoss(devices: EG4Device[]): EG4Device | undefined {
  return devices.find((device) => {
    const text = String(
      device.deviceTypeText ?? device.deviceTypeText4APP ?? '',
    ).toLowerCase();
    return text.includes('grid boss') || Number(device.deviceType) === 9;
  });
}

async function safeCall<T>(
  label: string,
  fn: () => Promise<T>,
  log: (message: string) => void,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    log(
      `${label} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

export async function getSystemSnapshots(
  client: EG4Client,
  log: (message: string) => void = () => undefined,
): Promise<EG4SystemSnapshot[]> {
  const login = await client.login();
  const plantResponse = await client.getPlants();
  const plants = plantResponse.rows?.length
    ? plantResponse.rows
    : login.plants ?? [];

  const snapshots: EG4SystemSnapshot[] = [];

  for (const plant of plants) {
    const plantId = plantIdOf(plant);
    if (!plantId) {
      continue;
    }

    const deviceList = await client.getConfigDevices(plantId);
    const devices = deviceList.rows ?? [];

    const primaryInverter = selectPrimary(devices);
    if (!primaryInverter?.serialNum) {
      log(`No primary 18KPV found for plant ${plant.name ?? plantId}.`);
      continue;
    }

    const parallel = await safeCall<EG4ParallelGroupResponse>(
      'Parallel topology',
      () =>
        client.getParallelGroupDetails(
          primaryInverter.serialNum as string,
        ),
      log,
    );

    let gridBoss = selectGridBoss(devices);

    if (!gridBoss?.serialNum && parallel?.parallelMidboxSn) {
      gridBoss = {
        serialNum: parallel.parallelMidboxSn,
        deviceType: 9,
        deviceTypeText: 'Grid Boss',
      };
    }

    const midbox = gridBoss?.serialNum
      ? await safeCall<EG4MidboxRuntime>(
          'GridBOSS runtime',
          () => client.getMidboxRuntime(gridBoss!.serialNum as string),
          log,
        )
      : null;

    const energy = await safeCall<EG4EnergyInfo>(
      'Parallel energy',
      () =>
        client.getParallelEnergyInfo(
          primaryInverter.serialNum as string,
        ),
      log,
    );

    snapshots.push({
      plant,
      devices,
      primaryInverter,
      gridBoss,
      parallel,
      midbox,
      energy,
    });
  }

  return snapshots;
}
