export type JsonObject = Record<string, unknown>;

export interface EG4ClientOptions {
  username: string;
  password: string;
  baseUrl?: string;
  debug?: (message: string) => void;
}

export interface EG4Plant extends JsonObject {
  id?: number | string;
  plantId?: number | string;
  name?: string;
  timezone?: string;
}

export interface EG4Device extends JsonObject {
  serialNum?: string;
  datalogSn?: string;
  deviceType?: number | string;
  deviceTypeText?: string;
  deviceTypeText4APP?: string;
  masterOrSlave?: number | string;
  status?: number | string;
  statusText?: string;
  lost?: boolean;
  fwCode?: string;
  powerRatingText?: string;
  batParallelNum?: number | string;
  batCapacity?: number | string;
  plantId?: number | string;
  plantName?: string;
}

export interface EG4LoginResponse extends JsonObject {
  success?: boolean;
  plants?: EG4Plant[];
}

export interface EG4PlantListResponse extends JsonObject {
  rows?: EG4Plant[];
  total?: number;
}

export interface EG4DeviceListResponse extends JsonObject {
  rows?: EG4Device[];
  total?: number;
}

export interface EG4ParallelDevice extends EG4Device {
  roleText?: string;
  parallelIndex?: number | string;
  parallelNumText?: string;
  vpv1?: number;
  ppv1?: number;
  vpv2?: number;
  ppv2?: number;
  vpv3?: number;
  ppv3?: number;
  soc?: number;
  vBat?: number;
  pCharge?: number;
  pDisCharge?: number;
  peps?: number;
}

export interface EG4ParallelGroupResponse extends JsonObject {
  success?: boolean;
  deviceType?: number | string;
  parallelMidboxSn?: string;
  inverterCount?: number;
  total?: number;
  devices?: EG4ParallelDevice[];
}

export interface EG4MidboxData extends JsonObject {
  gridRmsVolt?: number;
  upsRmsVolt?: number;
  genRmsVolt?: number;
  gridFreq?: number;
  genFreq?: number;
  upsL1ActivePower?: number;
  upsL2ActivePower?: number;
  gridL1ActivePower?: number;
  gridL2ActivePower?: number;
  genL1ActivePower?: number;
  genL2ActivePower?: number;
  loadL1ActivePower?: number;
  loadL2ActivePower?: number;
  hybridPower?: number;
  phaseLockFreq?: number;
}

export interface EG4SystemDeviceData extends JsonObject {
  success?: boolean;
  serialNum?: string;
  hasRuntimeData?: boolean;
  statusText?: string;
  ppv?: number;
  batPower?: number;
  soc?: number;
  vBat?: number;
  gridPower?: number;
  peps?: number;
  pLoad?: number;
  pEpsL1N?: number;
  pEpsL2N?: number;
  batteryType?: string;
  batteryColor?: string;
  batShared?: boolean;
  batParallelNum?: number | string;
  batCapacity?: number | string;
  maxChgCurrValue?: number;
  maxDischgCurrValue?: number;
  bmsCharge?: boolean;
  bmsDischarge?: boolean;
  deviceArray?: JsonObject[];
}

export interface EG4MidboxRuntime extends JsonObject {
  success?: boolean;
  serialNum?: string;
  datalogSn?: string;
  systemType?: string;
  fwCode?: string;
  powerRatingText?: string;
  lost?: boolean;
  hasRuntimeData?: boolean;
  statusText?: string;
  midboxData?: EG4MidboxData;
  deviceDataType?: string;
  deviceData?: EG4SystemDeviceData;
}

export interface EG4EnergyInfo extends JsonObject {
  success?: boolean;
  hasRuntimeData?: boolean;
  todayYielding?: number;
  todayYieldingText?: string;
  totalYielding?: number;
  totalYieldingText?: string;
  todayDischarging?: number;
  todayDischargingText?: string;
  totalDischarging?: number;
  totalDischargingText?: string;
  todayCharging?: number;
  todayChargingText?: string;
  totalCharging?: number;
  totalChargingText?: string;
  todayExport?: number;
  todayExportText?: string;
  totalExport?: number;
  totalExportText?: string;
  todayImport?: number;
  todayImportText?: string;
  totalImport?: number;
  totalImportText?: string;
  todayUsage?: number;
  todayUsageText?: string;
  totalUsage?: number;
  totalUsageText?: string;
}

export interface EG4SystemSnapshot {
  plant: EG4Plant;
  devices: EG4Device[];
  primaryInverter: EG4Device;
  gridBoss?: EG4Device;
  parallel: EG4ParallelGroupResponse | null;
  midbox: EG4MidboxRuntime | null;
  energy: EG4EnergyInfo | null;
}
