import type {VpsBackupPlan} from "./vps-backup-plan";
import type {PublicR2BackupSettings} from "./vps-r2";

export type VpsMetrics={cpu?:number;mem?:{current:number;total:number};xray?:{state:string;version?:string};netIO?:{up:number;down:number}};
export type VpsStatus={online:boolean;checkedAt:string;metrics:VpsMetrics|null;error?:string};
export type VpsServer={id:string;name:string;group:string;baseUrl:string;enabled:boolean;lastMetrics?:{used:number;total:number;inboundCount:number;clientCount:number};plan:VpsBackupPlan};
export type VpsBackup={id:string;serverId:string;serverName:string;createdAt:string;bytes:number;sha256:string;hasConfig:boolean;warning?:string;cloud?:{status:string;accountId?:string;bucket?:string;prefix?:string;jurisdiction?:string;keyId?:string;objectKey?:string;uploadedAt?:string;error?:string;attempts?:number}};
export type VpsJob={id:string;serverId:string;serverName:string;kind:string;trigger:string;status:string;startedAt:string;finishedAt?:string;message:string};
export type VpsSnapshot={servers:VpsServer[];statuses:Record<string,VpsStatus>;backups:VpsBackup[];jobs:VpsJob[];bridgeError?:string;storage?:{directory:string};cloud?:PublicR2BackupSettings};
