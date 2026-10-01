import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getSystemSnapshots } from '../dist/eg4/snapshot.js';

async function fixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

class FixtureClient {
  constructor(data) {
    this.data = data;
  }

  async initializeSession() {
    return this.data.login ?? { success: true };
  }

  async getPlants() {
    return this.data.plants ?? { rows: [] };
  }

  async getConfigDevices(plantId) {
    return this.data.devices?.[plantId] ?? { rows: [] };
  }

  async getParallelGroupDetails(serialNum) {
    const value = this.data.parallel?.[serialNum];
    if (!value) {
      throw new Error('parallel topology unavailable');
    }
    return value;
  }

  async getMidboxRuntime(serialNum) {
    const value = this.data.midbox?.[serialNum];
    if (!value) {
      throw new Error('midbox runtime unavailable');
    }
    return value;
  }

  async getInverterRuntime(serialNum) {
    const value = this.data.runtime?.[serialNum];
    if (!value) {
      throw new Error('direct inverter runtime unavailable');
    }
    return value;
  }

  async getParallelEnergyInfo(serialNum) {
    const value = this.data.parallelEnergy?.[serialNum];
    if (!value) {
      throw new Error('parallel energy unavailable');
    }
    return value;
  }

  async getInverterEnergyInfo(serialNum) {
    const value = this.data.directEnergy?.[serialNum];
    if (!value) {
      throw new Error('direct inverter energy unavailable');
    }
    return value;
  }
}

test('parallel 18KPV + GridBOSS remains one logical HomeKit system', async () => {
  const data = await fixture('parallel-gridboss.json');
  const snapshots = await getSystemSnapshots(new FixtureClient(data));

  assert.equal(snapshots.length, 1);

  const snapshot = snapshots[0];
  assert.equal(snapshot.systemId, 'PLANT-PARALLEL');
  assert.equal(snapshot.multipleSystemsInPlant, false);
  assert.equal(snapshot.systemShortLabel, undefined);
  assert.equal(snapshot.devices.length, 2);
  assert.equal(snapshot.gridBoss?.serialNum, 'MIDBOX-A');

  assert.deepEqual(snapshot.metrics.battery, {
    available: true,
    soc: 85,
    chargePower: 0,
    dischargePower: 800,
    signedPower: -800,
    voltage: 54,
  });

  assert.equal(snapshot.metrics.solar.available, true);
  assert.equal(snapshot.metrics.solar.power, 1700);
  assert.equal(snapshot.metrics.load.available, true);
  assert.equal(snapshot.metrics.load.power, 405);
  assert.equal(snapshot.metrics.grid.available, true);
  assert.equal(snapshot.metrics.grid.connected, false);
  assert.equal(snapshot.metrics.generator.available, true);
  assert.equal(snapshot.metrics.generator.active, false);
});

test('two standalone demo inverters become separate A/B logical systems', async () => {
  const data = await fixture('demo-two-systems.json');
  const snapshots = await getSystemSnapshots(new FixtureClient(data));

  assert.equal(snapshots.length, 2);

  const [a, b] = snapshots;

  assert.equal(a.multipleSystemsInPlant, true);
  assert.equal(b.multipleSystemsInPlant, true);
  assert.equal(a.systemShortLabel, 'A');
  assert.equal(b.systemShortLabel, 'B');
  assert.equal(a.systemLabel, '18KPV');
  assert.equal(b.systemLabel, 'FlexBOSS21');
  assert.notEqual(a.systemId, b.systemId);

  assert.equal(a.metrics.battery.soc, 83);
  assert.equal(a.metrics.battery.chargePower, 6500);
  assert.equal(a.metrics.grid.connected, true);
  assert.equal(a.metrics.grid.voltage, 236.2);
  assert.equal(a.metrics.grid.power, 6800);
  assert.equal(a.metrics.solar.power, 0);
  assert.equal(a.metrics.load.power, 300);
  assert.equal(a.metrics.generator.active, false);

  assert.equal(b.metrics.battery.soc, 98);
  assert.equal(b.metrics.battery.dischargePower, 98);
  assert.equal(b.metrics.grid.connected, false);
  assert.equal(b.metrics.grid.voltage, 0);
  assert.equal(b.metrics.grid.power, 0);
  assert.equal(b.metrics.solar.power, 134);
  assert.equal(b.metrics.load.power, 232);
  assert.equal(b.metrics.generator.active, false);
});
