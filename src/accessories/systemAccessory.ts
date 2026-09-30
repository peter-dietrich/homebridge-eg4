import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { EG4Platform } from '../platform.js';
import type { EG4SystemSnapshot } from '../eg4/types.js';

interface EG4AccessoryContext {
  plantName?: string;
  plantId?: string;
}

export class EG4SystemAccessory {
  private readonly batteryService: Service;
  private readonly gridService: Service;

  private batteryLevel = 0;
  private charging = false;
  private lowBattery = false;

  private gridConnected = false;
  private gridVoltage = 0;
  private systemHealthy = true;

  constructor(
    private readonly platform: EG4Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    const context = this.accessory.context as EG4AccessoryContext;

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
        `EG4-${context.plantId ?? 'system'}`,
      );

    /*
     * Apple Home does not render a standalone Battery service as a normal
     * accessory tile. Use a real, read-only Contact Sensor as the primary
     * service to represent whether utility-grid voltage is present.
     *
     * CONTACT_DETECTED  = grid present / electrical contact closed
     * CONTACT_NOT_DETECTED = grid absent / electrical contact open
     *
     * The native Battery service remains attached to the same accessory, so
     * Apple Home still shows Battery Level and Charging in accessory details.
     */
    this.gridService =
      this.accessory.getService('Grid Connection') ??
      this.accessory.addService(
        this.platform.Service.ContactSensor,
        'Grid Connection',
        'grid-connection',
      );

    this.gridService.setPrimaryService(true);

    this.gridService
      .getCharacteristic(
        this.platform.Characteristic.ContactSensorState,
      )
      .onGet(
        () =>
          (this.gridConnected
            ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
            : this.platform.Characteristic.ContactSensorState
                .CONTACT_NOT_DETECTED) as CharacteristicValue,
      );

    this.gridService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(() => true);

    this.gridService
      .getCharacteristic(this.platform.Characteristic.StatusFault)
      .onGet(
        () =>
          (this.systemHealthy
            ? this.platform.Characteristic.StatusFault.NO_FAULT
            : this.platform.Characteristic.StatusFault.GENERAL_FAULT) as CharacteristicValue,
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
      .onGet(
        () =>
          (this.charging
            ? this.platform.Characteristic.ChargingState.CHARGING
            : this.platform.Characteristic.ChargingState
                .NOT_CHARGING) as CharacteristicValue,
      );

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(
        () =>
          (this.lowBattery
            ? this.platform.Characteristic.StatusLowBattery
                .BATTERY_LEVEL_LOW
            : this.platform.Characteristic.StatusLowBattery
                .BATTERY_LEVEL_NORMAL) as CharacteristicValue,
      );

    // Tell HAP that the battery service belongs to the primary Grid Connection
    // service. Apps are free to decide how much of this relationship to show.
    this.gridService.addLinkedService(this.batteryService);
  }

  update(snapshot: EG4SystemSnapshot): void {
    const system = snapshot.midbox?.deviceData;
    const midboxData = snapshot.midbox?.midboxData;

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

    /*
     * GridBOSS reports gridRmsVolt in tenths of a volt.
     * Example: 2400 ~= 240.0 V.
     *
     * Treat >180 V line-to-line as utility grid present. This is intentionally
     * voltage-based instead of gridPower-based because gridPower can correctly
     * be 0 W even while the grid is available.
     */
    const rawGridVoltage =
      typeof midboxData?.gridRmsVolt === 'number'
        ? midboxData.gridRmsVolt
        : 0;

    this.gridVoltage = rawGridVoltage / 10;
    this.gridConnected = this.gridVoltage >= 180;

    this.systemHealthy =
      snapshot.midbox?.lost !== true &&
      snapshot.midbox?.hasRuntimeData !== false;

    this.gridService.updateCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      this.gridConnected
        ? this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
        : this.platform.Characteristic.ContactSensorState
            .CONTACT_NOT_DETECTED,
    );

    this.gridService.updateCharacteristic(
      this.platform.Characteristic.StatusActive,
      true,
    );

    this.gridService.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      this.systemHealthy
        ? this.platform.Characteristic.StatusFault.NO_FAULT
        : this.platform.Characteristic.StatusFault.GENERAL_FAULT,
    );

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
      `[${this.accessory.displayName}] ` +
        `SOC=${this.batteryLevel}% ` +
        `batteryPower=${batPower}W ` +
        `PV=${system?.ppv ?? '?'}W ` +
        `Grid=${system?.gridPower ?? '?'}W ` +
        `BackupLoad=${system?.peps ?? '?'}W ` +
        `GridVoltage=${this.gridVoltage.toFixed(1)}V ` +
        `GridConnected=${this.gridConnected ? 'Yes' : 'No'}`,
    );
  }
}
