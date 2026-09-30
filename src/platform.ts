import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { EG4SystemAccessory } from './accessories/systemAccessory.js';
import { EG4Client } from './eg4/client.js';
import { getSystemSnapshots } from './eg4/snapshot.js';
import { DEFAULT_BASE_URL } from './settings.js';

interface EG4PlatformConfig extends PlatformConfig {
  username?: string;
  password?: string;
  baseUrl?: string;
  debugApi?: boolean;
  pollInterval?: number;
}

export class EG4Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly accessories: PlatformAccessory[] = [];
  private readonly systemAccessories = new Map<string, EG4SystemAccessory>();

  private client?: EG4Client;
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    public readonly log: Logging,
    private readonly config: EG4PlatformConfig,
    private readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.info('Initializing EG4 platform v0.2.0-dev.');

    this.api.on('didFinishLaunching', () => {
      void this.start();
    });

    this.api.on('shutdown', () => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
    this.log.debug(`Restored cached accessory: ${accessory.displayName}`);
  }

  private async start(): Promise<void> {
    if (!this.config.username || !this.config.password) {
      this.log.warn(
        'EG4 username/password are not configured. No API calls will be made.',
      );
      return;
    }

    this.client = new EG4Client({
      username: this.config.username,
      password: this.config.password,
      baseUrl: this.config.baseUrl ?? DEFAULT_BASE_URL,
      debug: this.config.debugApi
        ? (message) => this.log.debug(message)
        : undefined,
    });

    await this.refresh();

    const pollIntervalSeconds = Math.max(
      60,
      Number(this.config.pollInterval ?? 120),
    );

    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, pollIntervalSeconds * 1000);

    this.log.info(`Polling EG4 every ${pollIntervalSeconds} seconds.`);
  }

  private async refresh(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const snapshots = await getSystemSnapshots(
        this.client,
        (message) => this.log.warn(message),
      );

      for (const snapshot of snapshots) {
        const plantId = String(
          snapshot.plant.plantId ?? snapshot.plant.id ?? snapshot.plant.name,
        );

        const uuid = this.api.hap.uuid.generate(`eg4-system-${plantId}`);

        let accessory = this.accessories.find(
          (candidate) => candidate.UUID === uuid,
        );

        if (!accessory) {
          accessory = new this.api.platformAccessory(
            snapshot.plant.name ?? 'EG4 Energy',
            uuid,
          );

          accessory.context.plantName =
            snapshot.plant.name ?? 'EG4 Energy';
          accessory.context.plantId = plantId;

          this.api.registerPlatformAccessories(
            'homebridge-eg4',
            'EG4',
            [accessory],
          );

          this.accessories.push(accessory);
          this.log.success(
            `Created HomeKit accessory for ${accessory.displayName}.`,
          );
        }

        let handler = this.systemAccessories.get(uuid);
        if (!handler) {
          handler = new EG4SystemAccessory(this, accessory);
          this.systemAccessories.set(uuid, handler);
        }

        handler.update(snapshot);
      }
    } catch (error) {
      this.log.error(
        `EG4 refresh failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
