import { EG4Client } from './client.js';
import {
  EG4Device,
  EG4EnergyInfo,
  EG4MidboxRuntime,
  EG4NormalizedMetrics,
  EG4ParallelDevice,
  EG4ParallelGroupResponse,
  EG4SystemSnapshot,
} from './types.js';

function plantIdOf(plant: Record<string, unknown>): string | undefined {
  const id = plant.plantId ?? plant.id;
  return id === undefined || id === null ? undefined : String(id);
}

function deviceText(device: EG4Device): string {
  return String(
    device.deviceTypeText ??
      device.deviceTypeText4APP ??
      '',
  ).toLowerCase();
}

function isGridBoss(device: EG4Device): boolean {
  const text = deviceText(device);
  return text.includes('grid boss') || Number(device.deviceType) === 9;
}

function looksLikeInverter(device: EG4Device): boolean {
  const text = deviceText(device);

  return (
    text.includes('inverter') ||
    text.includes('18kpv') ||
    text.includes('12kpv') ||
    text.includes('6000xp') ||
    text.includes('flexboss')
  );
}

function selectPrimary(devices: EG4Device[]): EG4Device | undefined {
  const candidates = devices.filter(
    (device) => Boolean(device.serialNum) && !isGridBoss(device),
  );

  return (
    candidates.find(
      (device) =>
        looksLikeInverter(device) &&
        Number(device.masterOrSlave) === 1,
    ) ??
    candidates.find(
      (device) => Number(device.masterOrSlave) === 1,
    ) ??
    candidates.find(looksLikeInverter) ??
    candidates[0]
  );
}

function selectGridBoss(devices: EG4Device[]): EG4Device | undefined {
  return devices.find(isGridBoss);
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

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter(
    (value): value is number => typeof value === 'number',
  );

  return defined.length
    ? defined.reduce((sum, value) => sum + value, 0)
    : undefined;
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter(
    (value): value is number => typeof value === 'number',
  );

  return defined.length
    ? defined.reduce((sum, value) => sum + value, 0) / defined.length
    : undefined;
}

function pvPowerFromParallel(
  devices: EG4ParallelDevice[],
): number | undefined {
  const perDevice = devices.map((device) =>
    sumDefined([
      numeric(device.ppv1),
      numeric(device.ppv2),
      numeric(device.ppv3),
    ]),
  );

  return sumDefined(perDevice);
}

function buildNormalizedMetrics(
  parallel: EG4ParallelGroupResponse | null,
  midbox: EG4MidboxRuntime | null,
): EG4NormalizedMetrics {
  const parallelDevices = parallel?.devices ?? [];
  const system = midbox?.deviceData;
  const midboxData = midbox?.midboxData;

  const parallelSoc = averageDefined(
    parallelDevices.map((device) => numeric(device.soc)),
  );
  const soc = numeric(system?.soc) ?? parallelSoc;

  const parallelCharge = sumDefined(
    parallelDevices.map((device) => numeric(device.pCharge)),
  );
  const parallelDischarge = sumDefined(
    parallelDevices.map((device) => numeric(device.pDisCharge)),
  );
  const aggregateBatteryPower = numeric(system?.batPower);

  const chargePower =
    parallelCharge !== undefined || parallelDischarge !== undefined
      ? Math.max(0, parallelCharge ?? 0)
      : aggregateBatteryPower !== undefined && aggregateBatteryPower > 0
        ? aggregateBatteryPower
        : undefined;

  const dischargePower =
    parallelCharge !== undefined || parallelDischarge !== undefined
      ? Math.max(0, parallelDischarge ?? 0)
      : aggregateBatteryPower !== undefined && aggregateBatteryPower < 0
        ? Math.abs(aggregateBatteryPower)
        : undefined;

  const parallelVoltage = averageDefined(
    parallelDevices.map((device) => {
      const raw = numeric(device.vBat);
      return raw === undefined ? undefined : raw / 10;
    }),
  );
  const systemVoltageRaw = numeric(system?.vBat);
  const batteryVoltage =
    systemVoltageRaw !== undefined
      ? systemVoltageRaw / 10
      : parallelVoltage;

  const solarPower =
    numeric(system?.ppv) ?? pvPowerFromParallel(parallelDevices);

  const backupLoad =
    numeric(system?.peps) ??
    sumDefined(parallelDevices.map((device) => numeric(device.peps)));
  const nonBackupLoad = numeric(system?.pLoad);
  const loadPower =
    backupLoad !== undefined || nonBackupLoad !== undefined
      ? Math.max(0, (backupLoad ?? 0) + (nonBackupLoad ?? 0))
      : undefined;

  const gridVoltageRaw = numeric(midboxData?.gridRmsVolt);
  const gridVoltage =
    gridVoltageRaw === undefined ? undefined : gridVoltageRaw / 10;
  const gridPower = numeric(system?.gridPower);

  const genVoltageRaw = numeric(midboxData?.genRmsVolt);
  const generatorVoltage =
    genVoltageRaw === undefined ? undefined : genVoltageRaw / 10;
  const genFrequencyRaw = numeric(midboxData?.genFreq);
  const generatorFrequency =
    genFrequencyRaw === undefined
      ? undefined
      : genFrequencyRaw > 100
        ? genFrequencyRaw / 100
        : genFrequencyRaw;
  const generatorPowerParts = [
    numeric(midboxData?.genL1ActivePower),
    numeric(midboxData?.genL2ActivePower),
  ];
  const generatorPowerDefined = generatorPowerParts.some(
    (value) => value !== undefined,
  );
  const generatorPower = generatorPowerDefined
    ? generatorPowerParts.reduce<number>(
        (sum, value) => sum + Math.abs(value ?? 0),
        0,
      )
    : undefined;

  const generatorAvailable =
    generatorVoltage !== undefined ||
    generatorFrequency !== undefined ||
    generatorPower !== undefined;

  return {
    battery: {
      available:
        soc !== undefined ||
        aggregateBatteryPower !== undefined ||
        parallelCharge !== undefined ||
        parallelDischarge !== undefined ||
        batteryVoltage !== undefined,
      soc:
        soc === undefined
          ? undefined
          : Math.max(0, Math.min(100, Math.round(soc))),
      chargePower,
      dischargePower,
      signedPower: aggregateBatteryPower,
      voltage: batteryVoltage,
    },
    grid: {
      available: gridVoltage !== undefined || gridPower !== undefined,
      connected:
        gridVoltage === undefined ? undefined : gridVoltage >= 180,
      power: gridPower,
      voltage: gridVoltage,
    },
    solar: {
      available: solarPower !== undefined,
      power: solarPower,
    },
    load: {
      available: loadPower !== undefined,
      power: loadPower,
    },
    generator: {
      available: generatorAvailable,
      active: generatorAvailable
        ? (generatorVoltage ?? 0) >= 180 || (generatorPower ?? 0) > 50
        : undefined,
      power: generatorPower,
      voltage: generatorVoltage,
      frequency: generatorFrequency,
    },
  };
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
      log(
        `No usable inverter/device serial found for plant ${
          plant.name ?? plantId
        }.`,
      );
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
      metrics: buildNormalizedMetrics(parallel, midbox),
    });
  }

  return snapshots;
}
