import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { EG4Platform } from '../platform.js';
import type { EG4SystemSnapshot } from '../eg4/types.js';

export class EG4SystemAccessory {
  private batteryService: Service;

  private batteryLevel = 0;
  private charging = false;
  private lowBattery = false;

  constructor(
    private readonly platform: EG4Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'EG4 Electronics',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        'EG4 Energy System',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        `EG4-${accessory.context.plantId}`,
      );

    this.batteryService =
      this.accessory.getService(this.platform.Service.Battery) ??
      this.accessory.addService(
        this.platform.Service.Battery,
        'System Battery',
      );

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(() => this.batteryLevel as CharacteristicValue);

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.ChargingState)
      .onGet(() =>
        this.charging
          ? this.platform.Characteristic.ChargingState.CHARGING
          : this.platform.Characteristic.ChargingState.NOT_CHARGING,
      );

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(() =>
        this.lowBattery
          ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );

  }

  update(snapshot: EG4SystemSnapshot): void {
    const system = snapshot.midbox?.deviceData;

    if (typeof system?.soc === 'number') {
      this.batteryLevel = Math.max(0, Math.min(100, system.soc));
    } else {
      const socValues = (snapshot.parallel?.devices ?? [])
        .map((device) => device.soc)
        .filter((value): value is number => typeof value === 'number');

      if (socValues.length) {
        this.batteryLevel = Math.round(
          socValues.reduce((sum, value) => sum + value, 0) /
            socValues.length,
        );
      }
    }

    const batPower =
      typeof system?.batPower === 'number' ? system.batPower : 0;

    this.charging = batPower > 0;
    this.lowBattery = this.batteryLevel <= 20;

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.BatteryLevel,
      this.batteryLevel,
    );

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.ChargingState,
      this.charging
        ? this.platform.Characteristic.ChargingState.CHARGING
        : this.platform.Characteristic.ChargingState.NOT_CHARGING,
    );

    this.batteryService.updateCharacteristic(
      this.platform.Characteristic.StatusLowBattery,
      this.lowBattery
        ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    );

    this.platform.log.info(
      `[${this.accessory.displayName}] SOC=${this.batteryLevel}% ` +
      `batteryPower=${batPower}W ` +
      `PV=${system?.ppv ?? '?'}W ` +
      `Grid=${system?.gridPower ?? '?'}W ` +
      `BackupLoad=${system?.peps ?? '?'}W`,
    );
  }
}
