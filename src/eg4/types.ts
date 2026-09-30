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
  model?: number | string;
  modelText?: string;
  deviceTypeText4APP?: string;
  status?: string;
  lost?: boolean;
}

export interface EG4ParallelGroup extends JsonObject {
  groupId?: string | number;
  name?: string;
  inverters?: EG4Device[];
  midDevice?: EG4Device | null;
}

export interface EG4LoginResponse extends JsonObject {
  success?: boolean;
  plants?: EG4Plant[];
  user?: JsonObject;
}

export interface EG4PlantListResponse extends JsonObject {
  rows?: EG4Plant[];
  total?: number;
}

export interface EG4ParallelGroupResponse extends JsonObject {
  success?: boolean;
  parallelGroups?: EG4ParallelGroup[];
}

export interface EG4DeviceListResponse extends JsonObject {
  success?: boolean;
  devices?: EG4Device[];
  rows?: EG4Device[];
}

export interface EG4Runtime extends JsonObject {
  success?: boolean;
  serialNum?: string;
  statusText?: string;
  lost?: boolean;
  hasRuntimeData?: boolean;
  ppv?: number;
  pToGrid?: number;
  pToUser?: number;
  consumptionPower?: number;
  pCharge?: number;
  pDisCharge?: number;
  batPower?: number;
  soc?: number;
  vBat?: number;
  tBat?: number;
  tinner?: number;
}

export interface EG4BatteryInfo extends JsonObject {
  success?: boolean;
  serialNum?: string;
  batteryType?: string;
  batParallelNum?: number | string;
  batCapacity?: number | string;
  soc?: number;
  vBat?: number;
  iBat?: number;
  pBat?: number;
  tBat?: number;
  batteryArray?: JsonObject[];
}

export interface EG4MidboxRuntime extends JsonObject {
  success?: boolean;
  serialNum?: string;
  gridVoltageL1?: number;
  gridVoltageL2?: number;
  gridFrequency?: number;
  loadPower?: number;
}

export interface EG4DiscoveryDump {
  generatedAt: string;
  baseUrl: string;
  plants: Array<{
    plant: EG4Plant;
    overview: EG4DeviceListResponse | null;
    parallel: EG4ParallelGroupResponse | null;
    inverterRuntime: Array<{
      serialNum: string;
      runtime: EG4Runtime | null;
      battery: EG4BatteryInfo | null;
    }>;
    midRuntime: Array<{
      serialNum: string;
      runtime: EG4MidboxRuntime | null;
    }>;
  }>;
}
