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
 * - probes read-only topology/runtime/energy endpoints
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

function numberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
