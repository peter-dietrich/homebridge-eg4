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
  systemId?: string;
  plantId?: string;
  plantName?: string;
  systemLabel?: string;
  systemShortLabel?: string;
  multipleSystemsInPlant?: boolean;
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
      `EG4-${context.systemId ?? context.plantId ?? 'system'}-${context.role ?? 'device'}`,
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
  return snapshot.metrics.grid.voltage ?? 0;
}

function totalHouseLoad(snapshot: EG4SystemSnapshot): number {
  return Math.max(0, snapshot.metrics.load.power ?? 0);
}

function systemSoc(snapshot: EG4SystemSnapshot): number {
  return snapshot.metrics.battery.soc ?? 0;
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


function snapshotPrefix(snapshot: EG4SystemSnapshot): string {
  return snapshot.multipleSystemsInPlant && snapshot.systemShortLabel
    ? `${snapshot.systemShortLabel} `
    : '';
}

function compactPower(power: number): string {
  const value = Math.max(0, Math.abs(power));

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}kW`;
  }

  return `${Math.round(value)}W`;
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
  return {
    charge: Math.max(0, snapshot.metrics.battery.chargePower ?? 0),
    discharge: Math.max(0, snapshot.metrics.battery.dischargePower ?? 0),
  };
}

function generatorVoltage(snapshot: EG4SystemSnapshot): number {
  return snapshot.metrics.generator.voltage ?? 0;
}

function generatorFrequency(snapshot: EG4SystemSnapshot): number {
  return snapshot.metrics.generator.frequency ?? 0;
}

function generatorPower(snapshot: EG4SystemSnapshot): number {
  return Math.max(0, snapshot.metrics.generator.power ?? 0);
}

export interface EG4AccessoryHandler {
  update(snapshot: EG4SystemSnapshot): void;
}

export class EG4GridAccessory implements EG4AccessoryHandler {
  private readonly service: Service;
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

    const legacyGridStatus =
      accessory.getService('Grid Status');

    if (legacyGridStatus) {
      accessory.removeService(legacyGridStatus);
    }

    addNativeStatusCharacteristics(
      platform,
      this.service,
    );

    this.voltageCharacteristic = addReadOnlyFloatCharacteristic(
      platform,
      this.service,
      'Grid Voltage (V)',
      GRID_VOLTAGE_UUID,
      0,
      300,
      0.1,
    );
  }

  update(snapshot: EG4SystemSnapshot): void {
    const voltage = gridVoltage(snapshot);
    const available = snapshot.metrics.grid.available;
    this.connected = snapshot.metrics.grid.connected ?? false;

    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.connected,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.OutletInUse,
      this.connected,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.StatusActive,
      true,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      this.platform.Characteristic.StatusFault.NO_FAULT,
    );

    this.voltageCharacteristic.updateValue(voltage);

    const gridPower = snapshot.metrics.grid.power ?? 0;

    const prefix = snapshotPrefix(snapshot);
    const name = !available
      ? `${prefix}Grid N/A`
      : this.connected
        ? `${prefix}Grid ${compactPower(gridPower)}`
        : `${prefix}Grid OFF-GRID`;

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
      `[EG4 Grid] ${!available ? 'Unavailable' : this.connected ? 'Connected' : 'Off-grid'} ` +
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
    const available = snapshot.metrics.battery.available;

    this.soc = systemSoc(snapshot);

    const batteryPower =
      snapshot.metrics.battery.signedPower ??
      ((snapshot.metrics.battery.chargePower ?? 0) -
        (snapshot.metrics.battery.dischargePower ?? 0));

    const flows = batteryFlows(snapshot);
    this.charging = flows.charge > 50;
    const discharging = flows.discharge > 50;
    const batteryActive = this.charging || discharging;

    const voltage = snapshot.metrics.battery.voltage ?? 0;

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

    const prefix = snapshotPrefix(snapshot);
    const name = !available
      ? `${prefix}Batt N/A`
      : this.charging
        ? `${prefix}Batt ${this.soc}% CHG ${compactPower(flows.charge)}`
        : discharging
          ? `${prefix}Batt ${this.soc}% DIS ${compactPower(flows.discharge)}`
          : `${prefix}Batt ${this.soc}% IDLE`;

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
    const available = snapshot.metrics.solar.available;
    const power = snapshot.metrics.solar.power ?? 0;

    const totalEnergy = numberFromText(
      snapshot.energy?.totalYieldingText,
    );
    const todayEnergy = numberFromText(
      snapshot.energy?.todayYieldingText,
    );

    this.updateValues(power, totalEnergy);
    this.todayEnergyCharacteristic.updateValue(todayEnergy);
    this.updateDynamicName(snapshot, power, available);

    this.platform.log.info(
      `[EG4 Solar] Power=${power}W ` +
        `Total=${totalEnergy.toFixed(1)}kWh`,
    );
  }

  private updateDynamicName(
    snapshot: EG4SystemSnapshot,
    power: number,
    available: boolean,
  ): void {
    const prefix = snapshotPrefix(snapshot);
    const name = available
      ? powerDisplayName(`${prefix}Solar`, power, true)
      : `${prefix}Solar N/A`;

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
    const available = snapshot.metrics.load.available;
    const power = totalHouseLoad(snapshot);

    const totalEnergy = numberFromText(
      snapshot.energy?.totalUsageText,
    );
    const todayUsage = numberFromText(
      snapshot.energy?.todayUsageText,
    );

    this.updateValues(power, totalEnergy);
    this.todayUsageCharacteristic.updateValue(todayUsage);

    const prefix = snapshotPrefix(snapshot);
    const name = available
      ? powerDisplayName(`${prefix}Load`, power)
      : `${prefix}Load N/A`;

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

    const available = snapshot.metrics.generator.available;
    this.active = snapshot.metrics.generator.active ?? false;

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

    const prefix = snapshotPrefix(snapshot);
    const name = !available
      ? `${prefix}Gen N/A`
      : this.active
        ? power > 50
          ? `${prefix}Gen ${compactPower(power)}`
          : `${prefix}Gen ON`
        : `${prefix}Gen OFF`;

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
      `[EG4 Generator] ${!available ? 'Unavailable' : this.active ? 'Active' : 'Off'} ` +
        `Power=${power}W Voltage=${voltage.toFixed(1)}V ` +
        `Frequency=${frequency.toFixed(2)}Hz`,
    );
  }
}
