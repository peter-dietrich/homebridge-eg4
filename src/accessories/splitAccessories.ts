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

export interface EG4AccessoryHandler {
  update(snapshot: EG4SystemSnapshot): void;
}

export class EG4GridAccessory implements EG4AccessoryHandler {
  private readonly service: Service;
  private connected = false;

  constructor(
    private readonly platform: EG4Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    setAccessoryInformation(platform, accessory, 'EG4 Grid');

    const legacyService =
      accessory.getService(platform.Service.ContactSensor);

    if (legacyService) {
      accessory.removeService(legacyService);
    }

    this.service =
      accessory.getService(platform.Service.Switch) ??
      accessory.addService(
        platform.Service.Switch,
        'Grid Connection',
      );

    this.service.setPrimaryService(true);

    this.service
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
      .onGet(() => this.connected as CharacteristicValue);
  }

  update(snapshot: EG4SystemSnapshot): void {
    const voltage = gridVoltage(snapshot);
    this.connected = voltage >= 180;

    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.connected,
    );

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

  private soc = 0;
  private charging = false;

  constructor(
    private readonly platform: EG4Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    setAccessoryInformation(platform, accessory, 'EG4 Battery');

    const existingChargeService =
      accessory.getService('Battery Charging');

    if (
      existingChargeService &&
      existingChargeService.UUID !== platform.Service.Switch.UUID
    ) {
      accessory.removeService(existingChargeService);
    }

    this.chargeStateService =
      accessory.getService('Battery Charging') ??
      accessory.addService(
        platform.Service.Switch,
        'Battery Charging',
        'battery-charging',
      );

    this.chargeStateService.setPrimaryService(true);

    this.chargeStateService
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
      .onGet(() => this.charging as CharacteristicValue);

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

    this.charging = batteryPower > 50;

    const voltage =
      typeof system?.vBat === 'number'
        ? system.vBat / 10
        : 0;

    this.chargeStateService.updateCharacteristic(
      this.platform.Characteristic.On,
      this.charging,
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

    if (
      existingStateService &&
      existingStateService.UUID !== platform.Service.Switch.UUID
    ) {
      accessory.removeService(existingStateService);
    }

    this.stateService =
      accessory.getService(serviceName) ??
      accessory.addService(
        platform.Service.Switch,
        serviceName,
        serviceName.toLowerCase().replace(/\s+/g, '-'),
      );

    this.stateService.setPrimaryService(true);

    this.stateService
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
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

    /*
     * Solar-only UI experiment:
     *
     * Apple Home tends to render a full room tile only for a genuinely
     * writable control service. We therefore advertise the Solar switch as
     * writable to HomeKit, but intercept every write locally. No EG4 write
     * endpoint is called from this handler.
     */
    this.stateService
      .getCharacteristic(platform.Characteristic.On)
      .setProps({
        perms: [
          platform.api.hap.Perms.PAIRED_READ,
          platform.api.hap.Perms.PAIRED_WRITE,
          platform.api.hap.Perms.NOTIFY,
        ],
      })
      .onSet((requestedValue) => {
        const requested = Boolean(requestedValue);

        this.platform.log.warn(
          `[EG4 Solar] HomeKit requested ${requested ? 'ON' : 'OFF'}; ` +
            'ignored because EG4 Solar is status-only.',
        );

        // Let HomeKit complete the write transaction, then restore the real
        // solar state. This never calls an EG4 control endpoint.
        setTimeout(() => {
          this.stateService.updateCharacteristic(
            this.platform.Characteristic.On,
            this.active,
          );
        }, 150);
      });
  }

  update(snapshot: EG4SystemSnapshot): void {
    const power =
      typeof snapshot.midbox?.deviceData?.ppv === 'number'
        ? snapshot.midbox.deviceData.ppv
        : 0;

    const totalEnergy = numberFromText(
      snapshot.energy?.totalYieldingText,
    );

    this.updateValues(power, totalEnergy);
    this.updateDynamicName(power);

    this.platform.log.info(
      `[EG4 Solar] Power=${power}W ` +
        `Total=${totalEnergy.toFixed(1)}kWh`,
    );
  }

  private updateDynamicName(power: number): void {
    const name =
      power <= 50
        ? 'EG4 Solar OFF'
        : power >= 1000
          ? `EG4 Solar ${(power / 1000).toFixed(1)} kW`
          : `EG4 Solar ${Math.round(power)} W`;

    if (name === this.lastAdvertisedName) {
      return;
    }

    this.lastAdvertisedName = name;

    this.stateService.setCharacteristic(
      this.platform.Characteristic.Name,
      name,
    );

    /*
     * Keep the accessory's configured display name in step with the primary
     * service. Apple Home may cache controller-side names, so this is an
     * experiment rather than a guaranteed UI refresh mechanism.
     */
    this.accessory.displayName = name;
  }
}

export class EG4LoadAccessory extends EG4PowerAccessory {
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
  }

  update(snapshot: EG4SystemSnapshot): void {
    const power = totalHouseLoad(snapshot);

    const totalEnergy = numberFromText(
      snapshot.energy?.totalUsageText,
    );

    this.updateValues(power, totalEnergy);

    this.platform.log.info(
      `[EG4 House Load] Power=${power}W ` +
        `Total=${totalEnergy.toFixed(1)}kWh`,
    );
  }
}
