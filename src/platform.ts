import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import {
  EG4AccessoryHandler,
  EG4BatteryAccessory,
  EG4GridAccessory,
  EG4LoadAccessory,
  EG4SolarAccessory,
} from './accessories/splitAccessories.js';

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

type AccessoryRole =
  | 'grid'
  | 'battery'
  | 'solar'
  | 'load';

interface AccessoryDefinition {
  role: AccessoryRole;
  name: string;
  model: string;
}

const ACCESSORY_DEFINITIONS: AccessoryDefinition[] = [
  {
    role: 'grid',
    name: 'EG4 Grid',
    model: 'EG4 Grid',
  },
  {
    role: 'battery',
    name: 'EG4 Battery',
    model: 'EG4 Battery',
  },
  {
    role: 'solar',
    name: 'EG4 Solar',
    model: 'EG4 Solar',
  },
  {
    role: 'load',
    name: 'EG4 House Load',
    model: 'EG4 House Load',
  },
];

export class EG4Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  private readonly handlers = new Map<
    string,
    EG4AccessoryHandler
  >();

  private client?: EG4Client;
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    public readonly log: Logging,
    private readonly config: EG4PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.info(
      'Initializing EG4 platform v0.3.2-dev.',
    );

    this.api.on('didFinishLaunching', () => {
      void this.start();
    });

    this.api.on('shutdown', () => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
    });
  }

  configureAccessory(
    accessory: PlatformAccessory,
  ): void {
    this.accessories.push(accessory);
    this.log.debug(
      `Restored cached accessory: ${accessory.displayName}`,
    );
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
      baseUrl:
        this.config.baseUrl ?? DEFAULT_BASE_URL,
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

    this.log.info(
      `Polling EG4 every ${pollIntervalSeconds} seconds.`,
    );
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
          snapshot.plant.plantId ??
            snapshot.plant.id ??
            snapshot.plant.name,
        );

        this.removeLegacySystemAccessory(plantId);

        for (const definition of ACCESSORY_DEFINITIONS) {
          const accessory = this.ensureAccessory(
            plantId,
            snapshot.plant.name ?? 'EG4',
            definition,
          );

          const handler = this.ensureHandler(
            definition.role,
            accessory,
          );

          handler.update(snapshot);
        }
      }
    } catch (error) {
      this.log.error(
        `EG4 refresh failed: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  private ensureAccessory(
    plantId: string,
    plantName: string,
    definition: AccessoryDefinition,
  ): PlatformAccessory {
    const uuid = this.api.hap.uuid.generate(
      `eg4-${definition.role}-${plantId}`,
    );

    let accessory = this.accessories.find(
      (candidate) => candidate.UUID === uuid,
    );

    if (!accessory) {
      accessory = new this.api.platformAccessory(
        definition.name,
        uuid,
      );

      accessory.context.plantId = plantId;
      accessory.context.plantName = plantName;
      accessory.context.role = definition.role;

      this.api.registerPlatformAccessories(
        'homebridge-eg4',
        'EG4',
        [accessory],
      );

      this.accessories.push(accessory);

      this.log.success(
        `Created HomeKit accessory: ${definition.name}.`,
      );
    }

    return accessory;
  }

  private ensureHandler(
    role: AccessoryRole,
    accessory: PlatformAccessory,
  ): EG4AccessoryHandler {
    const existing = this.handlers.get(accessory.UUID);

    if (existing) {
      return existing;
    }

    let handler: EG4AccessoryHandler;

    switch (role) {
      case 'grid':
        handler = new EG4GridAccessory(
          this,
          accessory,
        );
        break;

      case 'battery':
        handler = new EG4BatteryAccessory(
          this,
          accessory,
        );
        break;

      case 'solar':
        handler = new EG4SolarAccessory(
          this,
          accessory,
        );
        break;

      case 'load':
        handler = new EG4LoadAccessory(
          this,
          accessory,
        );
        break;
    }

    this.handlers.set(accessory.UUID, handler);
    return handler;
  }

  private removeLegacySystemAccessory(
    plantId: string,
  ): void {
    const legacyUuid = this.api.hap.uuid.generate(
      `eg4-system-${plantId}`,
    );

    const legacy = this.accessories.find(
      (candidate) => candidate.UUID === legacyUuid,
    );

    if (!legacy) {
      return;
    }

    this.api.unregisterPlatformAccessories(
      'homebridge-eg4',
      'EG4',
      [legacy],
    );

    const index = this.accessories.indexOf(legacy);

    if (index >= 0) {
      this.accessories.splice(index, 1);
    }

    this.handlers.delete(legacy.UUID);

    this.log.info(
      'Removed legacy single EG4 system accessory.',
    );
  }
}
