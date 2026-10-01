#!/usr/bin/env node

/**
 * Development-only EG4 public demo topology discovery.
 *
 * Usage:
 *   node tools/demo-discover.mjs
 *
 * This script:
 * - establishes the public EG4 demo/guest session
 * - enumerates visible demo plants/devices
 * - probes read-only topology/runtime/energy/battery endpoints
 * - inventories which demo endpoints return usable telemetry
 * - prints a sanitized compatibility report
 *
 * It does not send EG4 control commands and is excluded from npm publication.
 */

const BASE_URL = 'https://monitor.eg4electronics.com';
const cookies = new Map();

function captureCookies(response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const setCookies = getSetCookie ? getSetCookie() : [response.headers.get('set-cookie') ?? ''];

  for (const raw of setCookies) {
    if (!raw) continue;
    const first = raw.split(';', 1)[0] ?? '';
    const i = first.indexOf('=');
    if (i <= 0) continue;
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    if (name && value) cookies.set(name, value);
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function browserHeaders() {
  const h = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'homebridge-eg4 demo-topology-discovery',
  };
  if (cookies.size) h.Cookie = cookieHeader();
  return h;
}

function apiHeaders() {
  const h = {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'User-Agent': 'homebridge-eg4 demo-topology-discovery',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: BASE_URL,
    Referer: `${BASE_URL}/WManage/`,
  };
  if (cookies.size) h.Cookie = cookieHeader();
  return h;
}

async function startDemoSession() {
  let url = new URL('/WManage/web/login/viewDemoPlant?customCompany=', BASE_URL);

  for (let count = 0; count < 6; count += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: browserHeaders(),
      redirect: 'manual',
    });

    captureCookies(response);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Demo redirect missing Location header.');
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) throw new Error(`Demo page HTTP ${response.status}`);
    if (!cookies.size) throw new Error('Demo page did not establish a guest session cookie.');
    return;
  }

  throw new Error('Demo redirect limit exceeded.');
}

async function postForm(path, form) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: new URLSearchParams(form),
  });

  captureCookies(response);
  const text = await response.text();

  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON content.`);
  }
}

function mask(value) {
  const text = String(value ?? '');
  if (!text) return undefined;
  if (text.length <= 4) return '***';
  return `***${text.slice(-4)}`;
}

function deviceText(device) {
  return String(device?.deviceTypeText ?? device?.deviceTypeText4APP ?? '').trim();
}

function isGridBoss(device) {
  const text = deviceText(device).toLowerCase();
  return text.includes('grid boss') || Number(device?.deviceType) === 9;
}

function looksLikeInverter(device) {
  const text = deviceText(device).toLowerCase();
  return ['inverter', '18kpv', '12kpv', '6000xp', 'flexboss']
    .some((value) => text.includes(value));
}

function selectPrimary(devices) {
  const candidates = devices.filter((d) => d?.serialNum && !isGridBoss(d));
  return (
    candidates.find((d) => looksLikeInverter(d) && Number(d.masterOrSlave) === 1) ??
    candidates.find((d) => Number(d.masterOrSlave) === 1) ??
    candidates.find(looksLikeInverter) ??
    candidates[0]
  );
}

const TELEMETRY_KEYS = new Set([
  'soc',
  'vBat',
  'batPower',
  'batteryPower',
  'pCharge',
  'pDisCharge',
  'ppv',
  'ppv1',
  'ppv2',
  'ppv3',
  'ppv4',
  'ppv5',
  'ppv6',
  'ppv7',
  'ppv8',
  'vpv1',
  'vpv2',
  'vpv3',
  'vpv4',
  'vpv5',
  'vpv6',
  'vpv7',
  'vpv8',
  'pac',
  'peps',
  'pinv',
  'prec',
  'pLoad',
  'pload170',
  'pToGrid',
  'pToUser',
  'gridPower',
  'vacr',
  'fac',
  'acCouplePower',
  'genPower',
]);

function numberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function summarizePayload(value, depth = 0) {
  if (!value || typeof value !== 'object') {
    return {
      kind: Array.isArray(value) ? 'array' : typeof value,
      telemetry: {},
      keys: [],
    };
  }

  const telemetry = {};
  const keys = Array.isArray(value) ? [] : Object.keys(value).slice(0, 60);

  function visit(node, level) {
    if (!node || typeof node !== 'object' || level > 3) return;

    if (Array.isArray(node)) {
      for (const item of node.slice(0, 10)) visit(item, level + 1);
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if (TELEMETRY_KEYS.has(key) && (typeof child === 'number' || typeof child === 'string')) {
        if (!(key in telemetry)) telemetry[key] = child;
      }

      if (child && typeof child === 'object') {
        visit(child, level + 1);
      }
    }
  }

  visit(value, depth);

  return {
    kind: Array.isArray(value) ? 'array' : 'object',
    success: typeof value.success === 'boolean' ? value.success : undefined,
    keys,
    telemetry,
    telemetryFields: Object.keys(telemetry),
  };
}

function sumDefined(values) {
  const defined = values.filter((v) => typeof v === 'number');
  return defined.length ? defined.reduce((a, b) => a + b, 0) : undefined;
}

function avgDefined(values) {
  const defined = values.filter((v) => typeof v === 'number');
  return defined.length ? defined.reduce((a, b) => a + b, 0) / defined.length : undefined;
}

function normalize(parallel, midbox) {
  const devices = parallel?.devices ?? [];
  const system = midbox?.deviceData ?? {};
  const mid = midbox?.midboxData ?? {};

  const soc = numberOrUndefined(system.soc) ??
    avgDefined(devices.map((d) => numberOrUndefined(d.soc)));

  const solar = numberOrUndefined(system.ppv) ??
    sumDefined(devices.map((d) => sumDefined([
      numberOrUndefined(d.ppv1),
      numberOrUndefined(d.ppv2),
      numberOrUndefined(d.ppv3),
    ])));

  const backupLoad = numberOrUndefined(system.peps) ??
    sumDefined(devices.map((d) => numberOrUndefined(d.peps)));
  const nonBackupLoad = numberOrUndefined(system.pLoad);
  const load = backupLoad !== undefined || nonBackupLoad !== undefined
    ? Math.max(0, (backupLoad ?? 0) + (nonBackupLoad ?? 0))
    : undefined;

  const gridVoltageRaw = numberOrUndefined(mid.gridRmsVolt);
  const gridVoltage = gridVoltageRaw === undefined ? undefined : gridVoltageRaw / 10;
  const gridPower = numberOrUndefined(system.gridPower);

  const genVoltageRaw = numberOrUndefined(mid.genRmsVolt);
  const genVoltage = genVoltageRaw === undefined ? undefined : genVoltageRaw / 10;
  const genPowerParts = [
    numberOrUndefined(mid.genL1ActivePower),
    numberOrUndefined(mid.genL2ActivePower),
  ];
  const genPower = genPowerParts.some((v) => v !== undefined)
    ? genPowerParts.reduce((sum, v) => sum + Math.abs(v ?? 0), 0)
    : undefined;

  return {
    battery: {
      available: soc !== undefined ||
        devices.some((d) => numberOrUndefined(d.pCharge) !== undefined ||
          numberOrUndefined(d.pDisCharge) !== undefined ||
          numberOrUndefined(d.vBat) !== undefined),
      soc,
    },
    solar: { available: solar !== undefined, power: solar },
    load: { available: load !== undefined, power: load },
    grid: {
      available: gridVoltage !== undefined || gridPower !== undefined,
      connected: gridVoltage === undefined ? undefined : gridVoltage >= 180,
      voltage: gridVoltage,
      power: gridPower,
    },
    generator: {
      available: genVoltage !== undefined || genPower !== undefined,
      active: genVoltage !== undefined || genPower !== undefined
        ? (genVoltage ?? 0) >= 180 || (genPower ?? 0) > 50
        : undefined,
      voltage: genVoltage,
      power: genPower,
    },
  };
}

async function safe(label, fn) {
  try {
    return await fn();
  } catch (error) {
    return { _probeError: `${label}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function main() {
  console.log('EG4 public demo topology discovery');
  console.log('Establishing guest session...');
  await startDemoSession();

  const plantResponse = await postForm('/WManage/web/config/plant/list/viewer', {
    sort: 'createDate',
    order: 'desc',
    searchText: '',
  });

  const plants = plantResponse.rows ?? [];
  const report = {
    endpoint: BASE_URL,
    mode: 'public-demo',
    discoveredPlants: plants.length,
    plants: [],
  };

  for (const plant of plants) {
    const plantId = plant?.plantId ?? plant?.id;
    if (plantId === undefined || plantId === null) continue;

    const deviceResponse = await postForm('/WManage/web/config/inverter/list', {
      page: '1',
      rows: '100',
      plantId: String(plantId),
      searchText: '',
      targetSerialNum: '',
    });

    const devices = deviceResponse.rows ?? [];
    const primary = selectPrimary(devices);
    const gridBoss = devices.find(isGridBoss);

    let parallel = null;
    let midbox = null;
    let energy = null;

    const overviewList = await safe('inverter overview list', () => postForm(
      '/WManage/api/inverterOverview/list',
      { plantId: String(plantId) },
    ));

    const directDeviceProbes = [];

    if (primary?.serialNum) {
      parallel = await safe('parallel', () => postForm(
        '/WManage/api/inverterOverview/getParallelGroupDetails',
        { serialNum: String(primary.serialNum) },
      ));

      energy = await safe('energy', () => postForm(
        '/WManage/api/inverter/getInverterEnergyInfoParallel',
        { serialNum: String(primary.serialNum) },
      ));
    }

    for (const device of devices) {
      if (!device?.serialNum || !looksLikeInverter(device)) continue;

      const serialNum = String(device.serialNum);
      const runtime = await safe('inverter runtime', () => postForm(
        '/WManage/api/inverter/getInverterRuntime',
        { serialNum },
      ));
      const directEnergy = await safe('inverter energy', () => postForm(
        '/WManage/api/inverter/getInverterEnergyInfo',
        { serialNum },
      ));
      const battery = await safe('battery info', () => postForm(
        '/WManage/api/battery/getBatteryInfo',
        { serialNum },
      ));

      directDeviceProbes.push({
        serial: mask(serialNum),
        deviceType: device.deviceType,
        deviceTypeText: deviceText(device),
        runtime: runtime?._probeError
          ? { error: runtime._probeError }
          : summarizePayload(runtime),
        energy: directEnergy?._probeError
          ? { error: directEnergy._probeError }
          : summarizePayload(directEnergy),
        battery: battery?._probeError
          ? { error: battery._probeError }
          : summarizePayload(battery),
      });
    }

    const midboxSerial = gridBoss?.serialNum ?? parallel?.parallelMidboxSn;
    if (midboxSerial) {
      midbox = await safe('midbox', () => postForm(
        '/WManage/api/midbox/getMidboxRuntime',
        { serialNum: String(midboxSerial) },
      ));
    }

    report.plants.push({
      plant: {
        id: mask(plantId),
        name: '[DEMO]',
      },
      devices: devices.map((d) => ({
        serial: mask(d.serialNum),
        deviceType: d.deviceType,
        deviceTypeText: deviceText(d),
        masterOrSlave: d.masterOrSlave,
        statusText: d.statusText,
        powerRatingText: d.powerRatingText,
      })),
      selectedPrimary: primary ? {
        serial: mask(primary.serialNum),
        deviceType: primary.deviceType,
        deviceTypeText: deviceText(primary),
      } : null,
      gridBossDetected: Boolean(gridBoss || parallel?.parallelMidboxSn),
      endpointInventory: {
        inverterOverviewList: overviewList?._probeError
          ? { error: overviewList._probeError }
          : summarizePayload(overviewList),
        directDeviceProbes,
      },
      parallel: parallel?._probeError ? { error: parallel._probeError } : {
        deviceType: parallel?.deviceType,
        inverterCount: parallel?.inverterCount ?? parallel?.total,
        devices: (parallel?.devices ?? []).map((d) => ({
          serial: mask(d.serialNum),
          deviceType: d.deviceType,
          deviceTypeText: deviceText(d),
          roleText: d.roleText,
          masterOrSlave: d.masterOrSlave,
          fieldsPresent: [
            'soc','vBat','pCharge','pDisCharge','peps','ppv1','ppv2','ppv3',
          ].filter((k) => d[k] !== undefined),
        })),
      },
      midboxProbe: midbox?._probeError ? { error: midbox._probeError } : {
        systemType: midbox?.systemType,
        deviceDataType: midbox?.deviceDataType,
        hasRuntimeData: midbox?.hasRuntimeData,
      },
      energyProbe: energy?._probeError ? { error: energy._probeError } : {
        hasRuntimeData: energy?.hasRuntimeData,
        availableFields: Object.keys(energy ?? {})
          .filter((k) => !['success'].includes(k) && energy?.[k] !== undefined),
        summary: summarizePayload(energy ?? {}),
      },
      normalizedMetrics: normalize(
        parallel?._probeError ? null : parallel,
        midbox?._probeError ? null : midbox,
      ),
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
