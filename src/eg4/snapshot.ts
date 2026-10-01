import { EG4Client } from './client.js';
import {
  EG4Device,
  EG4EnergyInfo,
  EG4InverterRuntime,
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

interface LogicalSystemCandidate {
  primary: EG4Device;
  devices: EG4Device[];
  parallel: EG4ParallelGroupResponse | null;
  gridBoss?: EG4Device;
  identitySeed: string;
}

function inverterCandidates(devices: EG4Device[]): EG4Device[] {
  return devices.filter(
    (device) =>
      Boolean(device.serialNum) &&
      !isGridBoss(device) &&
      looksLikeInverter(device),
  );
}

function serialOf(device: EG4Device): string | undefined {
  return device.serialNum ? String(device.serialNum) : undefined;
}

function parallelMemberSerials(
  parallel: EG4ParallelGroupResponse | null,
): string[] {
  return (parallel?.devices ?? [])
    .map((device) => serialOf(device))
    .filter((serial): serial is string => Boolean(serial))
    .sort();
}

function labelForDevice(device: EG4Device): string {
  const raw = String(
    device.deviceTypeText ??
      device.deviceTypeText4APP ??
      'EG4',
  ).trim();

  return raw || 'EG4';
}

function shortLabelForDevice(device: EG4Device): string {
  const label = labelForDevice(device).toUpperCase();

  if (label.includes('FLEXBOSS21')) {
    return 'FB21';
  }
  if (label.includes('18KPV')) {
    return '18K';
  }
  if (label.includes('12KPV')) {
    return '12K';
  }
  if (label.includes('6000XP')) {
    return '6KXP';
  }

  return label.replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'EG4';
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
  inverterRuntime: EG4InverterRuntime | null,
): EG4NormalizedMetrics {
  const parallelDevices = parallel?.devices ?? [];
  const system = midbox?.deviceData;
  const midboxData = midbox?.midboxData;

  const parallelSoc = averageDefined(
    parallelDevices.map((device) => numeric(device.soc)),
  );
  const soc =
    numeric(system?.soc) ??
    parallelSoc ??
    numeric(inverterRuntime?.soc);

  const parallelCharge = sumDefined(
    parallelDevices.map((device) => numeric(device.pCharge)),
  );
  const parallelDischarge = sumDefined(
    parallelDevices.map((device) => numeric(device.pDisCharge)),
  );
  const aggregateBatteryPower =
    numeric(system?.batPower) ??
    numeric(inverterRuntime?.batPower);

  const directCharge = numeric(inverterRuntime?.pCharge);
  const directDischarge = numeric(inverterRuntime?.pDisCharge);

  const chargePower =
    parallelCharge !== undefined || parallelDischarge !== undefined
      ? Math.max(0, parallelCharge ?? 0)
      : directCharge !== undefined || directDischarge !== undefined
        ? Math.max(0, directCharge ?? 0)
        : aggregateBatteryPower !== undefined && aggregateBatteryPower > 0
          ? aggregateBatteryPower
          : undefined;

  const dischargePower =
    parallelCharge !== undefined || parallelDischarge !== undefined
      ? Math.max(0, parallelDischarge ?? 0)
      : directCharge !== undefined || directDischarge !== undefined
        ? Math.max(0, directDischarge ?? 0)
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
  const directVoltageRaw = numeric(inverterRuntime?.vBat);
  const batteryVoltage =
    systemVoltageRaw !== undefined
      ? systemVoltageRaw / 10
      : parallelVoltage ??
        (directVoltageRaw === undefined ? undefined : directVoltageRaw / 10);

  const directSolar =
    numeric(inverterRuntime?.ppv) ??
    sumDefined([
      numeric(inverterRuntime?.ppv1),
      numeric(inverterRuntime?.ppv2),
      numeric(inverterRuntime?.ppv3),
    ]);

  const solarPower =
    numeric(system?.ppv) ??
    pvPowerFromParallel(parallelDevices) ??
    directSolar;

  const directImport = numeric(inverterRuntime?.pToUser);
  const directExport = numeric(inverterRuntime?.pToGrid);

  const systemBackupLoad = numeric(system?.peps);
  const systemNonBackupLoad = numeric(system?.pLoad);
  const parallelBackupLoad = sumDefined(
    parallelDevices.map((device) => numeric(device.peps)),
  );
  const directEpsLoad = numeric(inverterRuntime?.peps);
  const directNonBackupLoad =
    numeric(inverterRuntime?.pLoad) ??
    numeric(inverterRuntime?.pload170);

  const directDerivedLoad =
    inverterRuntime &&
    (directImport !== undefined ||
      directExport !== undefined ||
      solarPower !== undefined ||
      chargePower !== undefined ||
      dischargePower !== undefined)
      ? Math.max(
          0,
          (directImport ?? 0) +
            (solarPower ?? 0) +
            (dischargePower ?? 0) -
            (directExport ?? 0) -
            (chargePower ?? 0),
        )
      : undefined;

  const loadPower =
    systemBackupLoad !== undefined || systemNonBackupLoad !== undefined
      ? Math.max(0, (systemBackupLoad ?? 0) + (systemNonBackupLoad ?? 0))
      : parallelBackupLoad !== undefined
        ? Math.max(0, parallelBackupLoad)
        : directNonBackupLoad !== undefined
          ? Math.max(0, (directEpsLoad ?? 0) + directNonBackupLoad)
          : directDerivedLoad ?? directEpsLoad;

  const gridVoltageRaw =
    numeric(midboxData?.gridRmsVolt) ??
    numeric(inverterRuntime?.vacr);
  const gridVoltage =
    gridVoltageRaw === undefined ? undefined : gridVoltageRaw / 10;

  const directGridPower =
    directImport !== undefined || directExport !== undefined
      ? (directImport ?? 0) - (directExport ?? 0)
      : undefined;
  const gridPower =
    numeric(system?.gridPower) ??
    directGridPower;

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
    : numeric(inverterRuntime?.genPower);

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
        directCharge !== undefined ||
        directDischarge !== undefined ||
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
  const login = await client.initializeSession();
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
    const candidates = inverterCandidates(devices);

    if (!candidates.length) {
      log(
        `No usable inverter/device serial found for plant ${plant.name ?? plantId}.`,
      );
      continue;
    }

    const configuredGridBoss = selectGridBoss(devices);
    const candidateBySerial = new Map(
      candidates
        .map((device) => {
          const serial = serialOf(device);
          return serial ? [serial, device] as const : null;
        })
        .filter(
          (entry): entry is readonly [string, EG4Device] => entry !== null,
        ),
    );

    const logicalSystems: LogicalSystemCandidate[] = [];
    const claimedSerials = new Set<string>();
    const seenGroupKeys = new Set<string>();

    for (const candidate of candidates) {
      const serial = serialOf(candidate);
      if (!serial || claimedSerials.has(serial)) {
        continue;
      }

      const parallel = await safeCall<EG4ParallelGroupResponse>(
        'Parallel topology probe',
        () => client.getParallelGroupDetails(serial),
        log,
      );

      const memberSerials = parallelMemberSerials(parallel);

      if (memberSerials.length > 0) {
        const groupKey = memberSerials.join('|');

        if (seenGroupKeys.has(groupKey)) {
          for (const memberSerial of memberSerials) {
            claimedSerials.add(memberSerial);
          }
          continue;
        }

        seenGroupKeys.add(groupKey);

        const groupDevices = memberSerials
          .map((memberSerial) => candidateBySerial.get(memberSerial))
          .filter((device): device is EG4Device => Boolean(device));

        const primary =
          selectPrimary(groupDevices.length ? groupDevices : [candidate]) ??
          candidate;

        let gridBoss: EG4Device | undefined;
        if (parallel?.parallelMidboxSn) {
          gridBoss =
            devices.find(
              (device) =>
                serialOf(device) === String(parallel.parallelMidboxSn),
            ) ?? {
              serialNum: parallel.parallelMidboxSn,
              deviceType: 9,
              deviceTypeText: 'Grid Boss',
            };
        }

        logicalSystems.push({
          primary,
          devices: groupDevices.length ? groupDevices : [candidate],
          parallel,
          gridBoss,
          identitySeed:
            parallel?.parallelMidboxSn
              ? `midbox:${parallel.parallelMidboxSn}`
              : `parallel:${groupKey}`,
        });

        for (const memberSerial of memberSerials) {
          claimedSerials.add(memberSerial);
        }

        continue;
      }

      logicalSystems.push({
        primary: candidate,
        devices: [candidate],
        parallel,
        identitySeed: `device:${serial}`,
      });
      claimedSerials.add(serial);
    }

    if (
      logicalSystems.length === 1 &&
      !logicalSystems[0]?.gridBoss &&
      configuredGridBoss
    ) {
      logicalSystems[0]!.gridBoss = configuredGridBoss;
    }

    const multipleSystemsInPlant = logicalSystems.length > 1;

    for (const logicalSystem of logicalSystems) {
      const primarySerial = serialOf(logicalSystem.primary);
      if (!primarySerial) {
        continue;
      }

      const gridBoss = logicalSystem.gridBoss;
      const midbox = gridBoss?.serialNum
        ? await safeCall<EG4MidboxRuntime>(
            'GridBOSS runtime probe',
            () => client.getMidboxRuntime(String(gridBoss.serialNum)),
            log,
          )
        : null;

      const inverterRuntime = !gridBoss?.serialNum
        ? await safeCall<EG4InverterRuntime>(
            'Direct inverter runtime probe',
            () => client.getInverterRuntime(primarySerial),
            log,
          )
        : null;

      const parallelEnergy = logicalSystem.parallel?.devices?.length
        ? await safeCall<EG4EnergyInfo>(
            'Parallel energy probe',
            () => client.getParallelEnergyInfo(primarySerial),
            log,
          )
        : null;

      const energy =
        parallelEnergy ??
        await safeCall<EG4EnergyInfo>(
          'Direct inverter energy probe',
          () => client.getInverterEnergyInfo(primarySerial),
          log,
        );

      const systemId = multipleSystemsInPlant
        ? `${plantId}:${logicalSystem.identitySeed}`
        : plantId;

      snapshots.push({
        plant,
        systemId,
        systemLabel: labelForDevice(logicalSystem.primary),
        systemShortLabel: shortLabelForDevice(logicalSystem.primary),
        multipleSystemsInPlant,
        devices: logicalSystem.devices,
        primaryInverter: logicalSystem.primary,
        gridBoss,
        parallel: logicalSystem.parallel,
        midbox,
        inverterRuntime,
        energy,
        metrics: buildNormalizedMetrics(
          logicalSystem.parallel,
          midbox,
          inverterRuntime,
        ),
      });
    }
  }

  return snapshots;
}

