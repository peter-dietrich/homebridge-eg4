import type {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { EG4Platform } from '../platform.js';
import type { EG4SystemSnapshot } from '../eg4/types.js';

const EVE_CURRENT_CONSUMPTION_UUID =
  'E863F10D-079E-48FF-8F27-9C2605A29F52';

const EVE_TOTAL_CONSUMPTION_UUID =
  'E863F10C-079E-48FF-8F27-9C2605A29F52';

const BATTERY_POWER_UUID =
  '6D7C3A02-1F27-4D6C-A04C-9F7AC4A0E401';

const BATTERY_VOLTAGE_UUID =
  '6D7C3A03-1F27-4D6C-A04C-9F7AC4A0E401';

const GRID_VOLTAGE_UUID =
  '6D7C3A04-1F27-4D6C-A04C-9F7AC4A0E401';

const TODAY_SOLAR_UUID =
  '6D7C3A05-1F27-4D6C-A04C-9F7AC4A0E401';

const TODAY_USAGE_UUID =
  '6D7C3A06-1F27-4D6C-A04C-9F7AC4A0E401';

const TODAY_CHARGE_UUID =
  '6D7C3A07-1F27-4D6C-A04C-9F7AC4A0E401';

const TODAY_DISCHARGE_UUID =
  '6D7C3A08-1F27-4D6C-A04C-9F7AC4A0E401';

const GENERATOR_VOLTAGE_UUID =
  '6D7C3A09-1F27-4D6C-A04C-9F7AC4A0E401';

const GENERATOR_FREQUENCY_UUID =
  '6D7C3A0A-1F27-4D6C-A04C-9F7AC4A0E401';

interface EG4AccessoryContext {
  plantId?: string;
  plantName?: string;
  role?: string;
}

function contextOf(
  accessory: PlatformAccessory,
): EG4AccessoryContext {
  return accessory.context as EG4AccessoryContext;
}

function setAccessoryInformation(
  platform: EG4Platform,
  accessory: PlatformAccessory,
  model: string,
): void {
  const context = contextOf(accessory);

  accessory
    .getService(platform.Service.AccessoryInformation)!
    .setCharacteristic(
      platform.Characteristic.Manufacturer,
      'EG4 Electronics',
    )
    .setCharacteristic(platform.Characteristic.Model, model)
    .setCharacteristic(
      platform.Characteristic.SerialNumber,
      `EG4-${context.plantId ?? 'system'}-${context.role ?? 'device'}`,
    );
}

function addReadOnlyFloatCharacteristic(
  platform: EG4Platform,
  service: Service,
  displayName: string,
  uuid: string,
  minValue: number,
  maxValue: number,
  minStep: number,
): Characteristic {
  const existing = service.characteristics.find(
    (characteristic) => characteristic.UUID === uuid,
  );

  if (existing) {
    return existing;
  }

  const characteristic = new platform.Characteristic(
    displayName,
    uuid,
    {
      format: platform.api.hap.Formats.FLOAT,
      perms: [
        platform.api.hap.Perms.PAIRED_READ,
        platform.api.hap.Perms.NOTIFY,
      ],
      minValue,
      maxValue,
      minStep,
    },
  );

  characteristic.updateValue(0);
  service.addCharacteristic(characteristic);

  return characteristic;
}

function addNativeStatusCharacteristics(
  platform: EG4Platform,
  service: Service,
): void {
  service.addOptionalCharacteristic(
    platform.Characteristic.StatusActive,
  );
  service.addOptionalCharacteristic(
    platform.Characteristic.StatusFault,
  );

  service
    .getCharacteristic(platform.Characteristic.StatusActive)
    .onGet(() => true);

  service
    .getCharacteristic(platform.Characteristic.StatusFault)
    .onGet(
      () =>
        platform.Characteristic.StatusFault.NO_FAULT,
    );
}

function gridVoltage(snapshot: EG4SystemSnapshot): number {
  const raw = snapshot.midbox?.midboxData?.gridRmsVolt;
  return typeof raw === 'number' ? raw / 10 : 0;
}

function totalHouseLoad(snapshot: EG4SystemSnapshot): number {
  const system = snapshot.midbox?.deviceData;

  const backup =
    typeof system?.peps === 'number' ? system.peps : 0;

  const nonBackup =
    typeof system?.pLoad === 'number' ? system.pLoad : 0;

  return Math.max(0, backup + nonBackup);
}

function systemSoc(snapshot: EG4SystemSnapshot): number {
  const system = snapshot.midbox?.deviceData;

  if (typeof system?.soc === 'number') {
    return Math.max(0, Math.min(100, system.soc));
  }

  const values = (snapshot.parallel?.devices ?? [])
    .map((device) => device.soc)
    .filter((value): value is number => typeof value === 'number');

  if (!values.length) {
    return 0;
  }

  return Math.round(
    values.reduce((sum, value) => sum + value, 0) /
      values.length,
  );
}

function numberFromText(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function advertiseDynamicName(
  platform: EG4Platform,
  accessory: PlatformAccessory,
  service: Service,
  name: string,
): void {
  service.updateCharacteristic(
    platform.Characteristic.Name,
    name,
  );

  service.updateCharacteristic(
    platform.Characteristic.ConfiguredName,
    name,
  );

  accessory
    .getService(platform.Service.AccessoryInformation)
    ?.updateCharacteristic(
      platform.Characteristic.Name,
      name,
    );

  accessory.displayName = name;
}

function compactPower(power: number): string {
  const value = Math.max(0, Math.abs(power));

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} kW`;
  }

  return `${Math.round(value)} W`;
}

function powerDisplayName(
  prefix: string,
  power: number,
  offBelowThreshold = false,
): string {
  if (offBelowThreshold && Math.abs(power) <= 50) {
    return `${prefix} OFF`;
  }

  return `${prefix} ${compactPower(power)}`;
}

function batteryFlows(
  snapshot: EG4SystemSnapshot,
): { charge: number; discharge: number } {
  const devices = snapshot.parallel?.devices ?? [];

  const charge = devices.reduce(
    (sum, device) =>
      sum +
      (typeof device.pCharge === 'number'
        ? Math.max(0, device.pCharge)
        : 0),
    0,
  );

  const discharge = devices.reduce(
    (sum, device) =>
      sum +
      (typeof device.pDisCharge === 'number'
        ? Math.max(0, device.pDisCharge)
        : 0),
    0,
  );

  if (charge > 0 || discharge > 0) {
    return { charge, discharge };
  }

  const aggregate =
    typeof snapshot.midbox?.deviceData?.batPower === 'number'
      ? snapshot.midbox.deviceData.batPower
      : 0;

  return {
    charge: aggregate > 0 ? aggregate : 0,
    discharge: aggregate < 0 ? Math.abs(aggregate) : 0,
  };
}

function generatorVoltage(snapshot: EG4SystemSnapshot): number {
  const raw = snapshot.midbox?.midboxData?.genRmsVolt;
  return typeof raw === 'number' ? raw / 10 : 0;
}

function generatorFrequency(snapshot: EG4SystemSnapshot): number {
  const raw = snapshot.midbox?.midboxData?.genFreq;

  if (typeof raw !== 'number') {
    return 0;
  }

  return raw > 100 ? raw / 100 : raw;
}

function generatorPower(snapshot: EG4SystemSnapshot): number {
  const data = snapshot.midbox?.midboxData;

  const l1 =
    typeof data?.genL1ActivePower === 'number'
      ? data.genL1ActivePower
      : 0;

  const l2 =
    typeof data?.genL2ActivePower === 'number'
      ? data.genL2ActivePower
      : 0;

  return Math.abs(l1) + Math.abs(l2);
}

export interface EG4AccessoryHandler {
  update(snapshot: EG4SystemSnapshot): void;
}

export class EG4GridAccessory implements EG4AccessoryHandler {
  private readonly service: Service;
  private readonly statusService: Service;
  private readonly voltageCharacteristic: Characteristic;
  private connected = false;
  private lastAdvertisedName = '';

  constructor(
    private readonly platform: EG4Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    setAccessoryInformation(platform, accessory, 'EG4 Grid');

    const legacySwitch =
      accessory.getService(platform.Service.Switch);

    if (legacySwitch) {
      accessory.removeService(legacySwitch);
    }

    this.service =
      accessory.getService(platform.Service.Outlet) ??
      accessory.addService(
        platform.Service.Outlet,
        'Grid Connection',
      );

    this.service.setPrimaryService(true);

    this.service
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.PAIRED_WRITE,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
      .onGet(() => this.connected as CharacteristicValue)
      .onSet((requestedValue) => {
        const requested = Boolean(requestedValue);

        this.platform.log.warn(
          `[EG4 Grid] HomeKit requested ${requested ? 'ON' : 'OFF'}; ` +
            'ignored because EG4 Grid is status-only.',
        );

        setTimeout(() => {
          this.service.updateCharacteristic(
            this.platform.Characteristic.On,
            this.connected,
          );
        }, 150);
      });

    this.service
      .getCharacteristic(platform.Characteristic.OutletInUse)
      .onGet(() => this.connected as CharacteristicValue);

    this.statusService =
      accessory.getService('Grid Status') ??
      accessory.addService(
        platform.Service.ContactSensor,
        'Grid Status',
        'grid-status',
      );

    this.statusService
      .getCharacteristic(
        platform.Characteristic.ContactSensorState,
      )
      .onGet(
        () =>
          (this.connected
            ? platform.Characteristic.ContactSensorState.CONTACT_DETECTED
            : platform.Characteristic.ContactSensorState
                .CONTACT_NOT_DETECTED) as CharacteristicValue,
      );

    addNativeStatusCharacteristics(
      platform,
      this.statusService,
    );

    this.voltageCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.statusService,
      'Grid Voltage (V)',
      GRID_VOLTAGE_UUID,
      0,
      300,
      0.1,
    );

    this.service.addLinkedService(this.statusService);
  }

  update(snapshot: EG4SystemSnapshot): void {
    const voltage = gridVoltage(snapshot);
    this.connected = voltage >= 180;

    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.connected,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.OutletInUse,
      this.connected,
    );

    this.statusService.updateCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      this.connected
        ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
        : this.platform.Characteristic.ContactSensorState
            .CONTACT_NOT_DETECTED,
    );

    this.statusService.updateCharacteristic(
      this.platform.Characteristic.StatusActive,
      true,
    );

    this.statusService.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      this.platform.Characteristic.StatusFault.NO_FAULT,
    );

    this.voltageCharacteristic.updateValue(voltage);

    const gridPower =
      typeof snapshot.midbox?.deviceData?.gridPower === 'number'
        ? snapshot.midbox.deviceData.gridPower
        : 0;

    const name = this.connected
      ? `EG4 Grid ${compactPower(gridPower)}`
      : 'EG4 Grid OFF-GRID';

    if (name !== this.lastAdvertisedName) {
      this.lastAdvertisedName = name;
      advertiseDynamicName(
        this.platform,
        this.accessory,
        this.service,
        name,
      );
    }

    this.platform.log.info(
      `[EG4 Grid] ${this.connected ? 'Connected' : 'Off-grid'} ` +
        `(${voltage.toFixed(1)}V)`,
    );
  }
}

export class EG4BatteryAccessory
  implements EG4AccessoryHandler
{
  private readonly chargeStateService: Service;
  private readonly batteryService: Service;
  private readonly powerCharacteristic: Characteristic;
  private readonly voltageCharacteristic: Characteristic;
  private readonly todayChargeCharacteristic: Characteristic;
  private readonly todayDischargeCharacteristic: Characteristic;

  private soc = 0;
  private charging = false;
  private lastAdvertisedName = '';

  constructor(
    private readonly platform: EG4Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    setAccessoryInformation(platform, accessory, 'EG4 Battery');

    const existingChargeService =
      accessory.getService('Battery Charging');

    const legacyBatterySwitch =
      accessory.getService(platform.Service.Switch);

    if (legacyBatterySwitch) {
      accessory.removeService(legacyBatterySwitch);
    } else if (
      existingChargeService &&
      existingChargeService.UUID !== platform.Service.Outlet.UUID
    ) {
      accessory.removeService(existingChargeService);
    }

    this.chargeStateService =
      accessory.getService(platform.Service.Outlet) ??
      accessory.addService(
        platform.Service.Outlet,
        'Battery Charging',
        'battery-charging',
      );

    this.chargeStateService.setPrimaryService(true);

    this.chargeStateService
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.PAIRED_WRITE,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
      .onGet(() => this.charging as CharacteristicValue)
      .onSet((requestedValue) => {
        const requested = Boolean(requestedValue);

        this.platform.log.warn(
          `[EG4 Battery] HomeKit requested ${requested ? 'ON' : 'OFF'}; ` +
            'ignored because EG4 Battery is status-only.',
        );

        setTimeout(() => {
          this.chargeStateService.updateCharacteristic(
            this.platform.Characteristic.On,
            this.charging,
          );
        }, 150);
      });

    this.chargeStateService
      .getCharacteristic(platform.Characteristic.OutletInUse)
      .onGet(
        () =>
          (this.charging as CharacteristicValue),
      );

    this.batteryService =
      accessory.getService(platform.Service.Battery) ??
      accessory.addService(
        platform.Service.Battery,
        'Battery State',
      );

    this.batteryService
      .getCharacteristic(platform.Characteristic.BatteryLevel)
      .onGet(() => this.soc);

    this.batteryService
      .getCharacteristic(platform.Characteristic.ChargingState)
      .onGet(
        () =>
          (this.charging
            ? platform.Characteristic.ChargingState.CHARGING
            : platform.Characteristic.ChargingState
                .NOT_CHARGING) as CharacteristicValue,
      );

    this.batteryService
      .getCharacteristic(platform.Characteristic.StatusLowBattery)
      .onGet(
        () =>
          (this.soc <= 20
            ? platform.Characteristic.StatusLowBattery
                .BATTERY_LEVEL_LOW
            : platform.Characteristic.StatusLowBattery
                .BATTERY_LEVEL_NORMAL) as CharacteristicValue,
      );

    this.powerCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.batteryService,
      'Battery Power (W)',
      BATTERY_POWER_UUID,
      -100000,
      100000,
      1,
    );

    this.voltageCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.batteryService,
      'Battery Voltage (V)',
      BATTERY_VOLTAGE_UUID,
      0,
      1000,
      0.1,
    );

    this.todayChargeCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.batteryService,
      'Today Charged (kWh)',
      TODAY_CHARGE_UUID,
      0,
      100000,
      0.001,
    );

    this.todayDischargeCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.batteryService,
      'Today Discharged (kWh)',
      TODAY_DISCHARGE_UUID,
      0,
      100000,
      0.001,
    );

    addNativeStatusCharacteristics(
      platform,
      this.batteryService,
    );

    this.chargeStateService.addLinkedService(
      this.batteryService,
    );
  }

  update(snapshot: EG4SystemSnapshot): void {
    const system = snapshot.midbox?.deviceData;

    this.soc = systemSoc(snapshot);

    const batteryPower =
      typeof system?.batPower === 'number'
        ? system.batPower
        : 0;

    const flows = batteryFlows(snapshot);
    this.charging = flows.charge > 50;
    const discharging = flows.discharge > 50;
    const batteryActive = this.charging || discharging;

    const voltage =
      typeof system?.vBat === 'number'
        ? system.vBat / 10
        : 0;

    this.chargeStateService.updateCharacteristic(
      this.platform.Characteristic.On,
      batteryActive,
    );

    this.chargeStateService.updateCharacteristic(
      this.platform.Characteristic.OutletInUse,
      batteryActive,
    );

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.BatteryLevel,
      this.soc,
    );

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.ChargingState,
      this.charging
        ? this.platform.Characteristic.ChargingState.CHARGING
        : this.platform.Characteristic.ChargingState.NOT_CHARGING,
    );

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.StatusLowBattery,
      this.soc <= 20
        ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.platform.Characteristic.StatusLowBattery
            .BATTERY_LEVEL_NORMAL,
    );

    this.powerCharacteristic.updateValue(batteryPower);
    this.voltageCharacteristic.updateValue(voltage);

    const todayCharged = numberFromText(
      snapshot.energy?.todayChargingText,
    );
    const todayDischarged = numberFromText(
      snapshot.energy?.todayDischargingText,
    );

    this.todayChargeCharacteristic.updateValue(todayCharged);
    this.todayDischargeCharacteristic.updateValue(todayDischarged);

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.StatusActive,
      true,
    );

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      this.platform.Characteristic.StatusFault.NO_FAULT,
    );

    const name = this.charging
      ? `EG4 Battery ${this.soc}% CHG ${compactPower(flows.charge)}`
      : discharging
        ? `EG4 Battery ${this.soc}% DIS ${compactPower(flows.discharge)}`
        : `EG4 Battery ${this.soc}% IDLE`;

    if (name !== this.lastAdvertisedName) {
      this.lastAdvertisedName = name;
      advertiseDynamicName(
        this.platform,
        this.accessory,
        this.chargeStateService,
        name,
      );
    }

    this.platform.log.info(
      `[EG4 Battery] SOC=${this.soc}% ` +
        `Charging=${this.charging ? 'Yes' : 'No'} ` +
        `Power=${batteryPower}W Voltage=${voltage.toFixed(1)}V`,
    );
  }
}

abstract class EG4PowerAccessory
  implements EG4AccessoryHandler
{
  protected readonly stateService: Service;
  protected readonly powerCharacteristic: Characteristic;
  protected readonly totalEnergyCharacteristic: Characteristic;

  protected active = false;

  constructor(
    protected readonly platform: EG4Platform,
    protected readonly accessory: PlatformAccessory,
    model: string,
    serviceName: string,
  ) {
    setAccessoryInformation(platform, accessory, model);

    const existingStateService =
      accessory.getService(serviceName);

    const legacySwitch =
      accessory.getService(platform.Service.Switch);

    if (legacySwitch) {
      accessory.removeService(legacySwitch);
    } else if (
      existingStateService &&
      existingStateService.UUID !== platform.Service.Outlet.UUID
    ) {
      accessory.removeService(existingStateService);
    }

    this.stateService =
      accessory.getService(platform.Service.Outlet) ??
      accessory.addService(
        platform.Service.Outlet,
        serviceName,
        serviceName.toLowerCase().replace(/\s+/g, '-'),
      );

    this.stateService.setPrimaryService(true);

    addNativeStatusCharacteristics(
      platform,
      this.stateService,
    );

    this.stateService
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.PAIRED_WRITE,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
      .onGet(() => this.active as CharacteristicValue)
      .onSet((requestedValue) => {
        const requested = Boolean(requestedValue);

        this.platform.log.warn(
          `[${model}] HomeKit requested ${requested ? 'ON' : 'OFF'}; ` +
            `ignored because ${model} is status-only.`,
        );

        setTimeout(() => {
          this.stateService.updateCharacteristic(
            this.platform.Characteristic.On,
            this.active,
          );
        }, 150);
      });

    this.stateService
      .getCharacteristic(platform.Characteristic.OutletInUse)
      .onGet(() => this.active as CharacteristicValue);

    this.powerCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.stateService,
      'Current Power (W)',
      EVE_CURRENT_CONSUMPTION_UUID,
      0,
      100000,
      1,
    );

    this.totalEnergyCharacteristic =
      addReadOnlyFloatCharacteristic(
        platform,
        this.stateService,
        'Total Energy (kWh)',
        EVE_TOTAL_CONSUMPTION_UUID,
        0,
        100000000,
        0.001,
      );
  }

  protected updateValues(
    power: number,
    totalEnergyKwh: number,
  ): void {
    this.active = power > 50;

    this.stateService.updateCharacteristic(
      this.platform.Characteristic.On,
      this.active,
    );

    this.stateService.updateCharacteristic(
      this.platform.Characteristic.OutletInUse,
      this.active,
    );

    this.stateService.updateCharacteristic(
      this.platform.Characteristic.StatusActive,
      true,
    );

    this.stateService.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      this.platform.Characteristic.StatusFault.NO_FAULT,
    );

    this.powerCharacteristic.updateValue(
      Math.max(0, power),
    );

    this.totalEnergyCharacteristic.updateValue(
      Math.max(0, totalEnergyKwh),
    );
  }

  abstract update(snapshot: EG4SystemSnapshot): void;
}

export class EG4SolarAccessory extends EG4PowerAccessory {
  private readonly todayEnergyCharacteristic: Characteristic;
  private lastAdvertisedName = '';

  constructor(
    platform: EG4Platform,
    accessory: PlatformAccessory,
  ) {
    super(
      platform,
      accessory,
      'EG4 Solar',
      'Solar Production',
    );

    this.todayEnergyCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.stateService,
      'Today Solar (kWh)',
      TODAY_SOLAR_UUID,
      0,
      100000,
      0.001,
    );
  }

  update(snapshot: EG4SystemSnapshot): void {
    const power =
      typeof snapshot.midbox?.deviceData?.ppv === 'number'
        ? snapshot.midbox.deviceData.ppv
        : 0;

    const totalEnergy = numberFromText(
      snapshot.energy?.totalYieldingText,
    );
    const todayEnergy = numberFromText(
      snapshot.energy?.todayYieldingText,
    );

    this.updateValues(power, totalEnergy);
    this.todayEnergyCharacteristic.updateValue(todayEnergy);
    this.updateDynamicName(power);

    this.platform.log.info(
      `[EG4 Solar] Power=${power}W ` +
        `Total=${totalEnergy.toFixed(1)}kWh`,
    );
  }

  private updateDynamicName(power: number): void {
    const name = powerDisplayName(
      'EG4 Solar',
      power,
      true,
    );

    if (name === this.lastAdvertisedName) {
      return;
    }

    this.lastAdvertisedName = name;

    advertiseDynamicName(
      this.platform,
      this.accessory,
      this.stateService,
      name,
    );

    this.platform.log.debug(
      `[EG4 Solar] Advertised HomeKit name: ${name}`,
    );
  }
}

export class EG4LoadAccessory extends EG4PowerAccessory {
  private readonly todayUsageCharacteristic: Characteristic;
  private lastAdvertisedName = '';

  constructor(
    platform: EG4Platform,
    accessory: PlatformAccessory,
  ) {
    super(
      platform,
      accessory,
      'EG4 House Load',
      'House Load',
    );

    this.todayUsageCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.stateService,
      'Today Usage (kWh)',
      TODAY_USAGE_UUID,
      0,
      100000,
      0.001,
    );
  }

  update(snapshot: EG4SystemSnapshot): void {
    const power = totalHouseLoad(snapshot);

    const totalEnergy = numberFromText(
      snapshot.energy?.totalUsageText,
    );
    const todayUsage = numberFromText(
      snapshot.energy?.todayUsageText,
    );

    this.updateValues(power, totalEnergy);
    this.todayUsageCharacteristic.updateValue(todayUsage);

    const name = powerDisplayName(
      'EG4 Load',
      power,
    );

    if (name !== this.lastAdvertisedName) {
      this.lastAdvertisedName = name;
      advertiseDynamicName(
        this.platform,
        this.accessory,
        this.stateService,
        name,
      );
    }

    this.platform.log.info(
      `[EG4 House Load] Power=${power}W ` +
        `Total=${totalEnergy.toFixed(1)}kWh`,
    );
  }
}


export class EG4GeneratorAccessory
  implements EG4AccessoryHandler
{
  private readonly service: Service;
  private readonly powerCharacteristic: Characteristic;
  private readonly voltageCharacteristic: Characteristic;
  private readonly frequencyCharacteristic: Characteristic;

  private active = false;
  private lastAdvertisedName = '';

  constructor(
    private readonly platform: EG4Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    setAccessoryInformation(
      platform,
      accessory,
      'EG4 Generator',
    );

    const legacySwitch =
      accessory.getService(platform.Service.Switch);

    if (legacySwitch) {
      accessory.removeService(legacySwitch);
    }

    this.service =
      accessory.getService(platform.Service.Outlet) ??
      accessory.addService(
        platform.Service.Outlet,
        'Generator',
        'generator',
      );

    this.service.setPrimaryService(true);

    addNativeStatusCharacteristics(
      platform,
      this.service,
    );

    this.service
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.PAIRED_WRITE,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
      .onGet(() => this.active as CharacteristicValue)
      .onSet((requestedValue) => {
        const requested = Boolean(requestedValue);

        this.platform.log.warn(
          `[EG4 Generator] HomeKit requested ${requested ? 'ON' : 'OFF'}; ` +
            'ignored because EG4 Generator is status-only.',
        );

        setTimeout(() => {
          this.service.updateCharacteristic(
            this.platform.Characteristic.On,
            this.active,
          );
        }, 150);
      });

    this.service
      .getCharacteristic(platform.Characteristic.OutletInUse)
      .onGet(() => this.active as CharacteristicValue);

    this.powerCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.service,
      'Generator Power (W)',
      EVE_CURRENT_CONSUMPTION_UUID,
      0,
      100000,
      1,
    );

    this.voltageCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.service,
      'Generator Voltage (V)',
      GENERATOR_VOLTAGE_UUID,
      0,
      300,
      0.1,
    );

    this.frequencyCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.service,
      'Generator Frequency (Hz)',
      GENERATOR_FREQUENCY_UUID,
      0,
      100,
      0.01,
    );
  }

  update(snapshot: EG4SystemSnapshot): void {
    const voltage = generatorVoltage(snapshot);
    const frequency = generatorFrequency(snapshot);
    const power = generatorPower(snapshot);

    this.active = voltage >= 180 || power > 50;

    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.active,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.OutletInUse,
      this.active,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.StatusActive,
      true,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      this.platform.Characteristic.StatusFault.NO_FAULT,
    );

    this.powerCharacteristic.updateValue(power);
    this.voltageCharacteristic.updateValue(voltage);
    this.frequencyCharacteristic.updateValue(frequency);

    const name = this.active
      ? power > 50
        ? `EG4 Generator ${compactPower(power)}`
        : 'EG4 Generator ON'
      : 'EG4 Generator OFF';

    if (name !== this.lastAdvertisedName) {
      this.lastAdvertisedName = name;
      advertiseDynamicName(
        this.platform,
        this.accessory,
        this.service,
        name,
      );
    }

    this.platform.log.info(
      `[EG4 Generator] ${this.active ? 'Active' : 'Off'} ` +
        `Power=${power}W Voltage=${voltage.toFixed(1)}V ` +
        `Frequency=${frequency.toFixed(2)}Hz`,
    );
  }
}
