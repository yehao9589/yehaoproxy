import type {VpsBackup} from "./vps-operations-types";
import type {PublicR2BackupSettings} from "./vps-r2";
import {vpsBackupFileName} from "../scripts/vps/backup-name.mjs";

export function filterVpsBackups(backups:VpsBackup[],filters:{query:string;serverId:string;status:string}){
  const query=filters.query.trim().toLowerCase();
  return backups.filter(backup=>(!filters.serverId||backup.serverId===filters.serverId)&&(!filters.status||(backup.cloud?.status||"local")===filters.status)&&(!query||`${backup.serverName} ${vpsBackupFileName(backup)} ${backup.id} ${backup.sha256}`.toLowerCase().includes(query))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
export function isCurrentR2Copy(backup:VpsBackup,cloud?:PublicR2BackupSettings){
  return Boolean(cloud&&backup.cloud?.status==="success"&&backup.cloud.accountId===cloud.accountId&&backup.cloud.bucket===cloud.bucket&&backup.cloud.prefix===cloud.prefix&&backup.cloud.jurisdiction===cloud.jurisdiction&&backup.cloud.keyId===cloud.keyId);
}
export function r2UploadReason(backup:VpsBackup,cloud?:PublicR2BackupSettings,bridgeError?:string,busy=false){
  if(bridgeError)return "连接桥不可用，请先恢复连接";
  if(busy)return "正在提交操作，请稍候";
  if(!cloud?.enabled)return "R2 尚未启用，请先完成 R2 设置";
  if(backup.cloud?.status==="uploading")return "正在加密上传，请稍候";
  if(isCurrentR2Copy(backup,cloud))return "已上传到当前 R2 存储位置，无需重复上传";
  return "";
}
export function backupSize(value=0){if(value<1024)return `${value} B`;const n=Math.min(4,Math.floor(Math.log(value)/Math.log(1024)));return `${(value/1024**n).toFixed(n>1?1:0)} ${["B","KB","MB","GB","TB"][n]}`;}
export function backupDate(value?:string|null,part:"date"|"time"|"full"="full"){
  if(!value||!Number.isFinite(Date.parse(value)))return "—";
  const date=part==="time"?{}:{year:"numeric",month:"2-digit",day:"2-digit"} as const;
  const time=part==="date"?{}:{hour:"2-digit",minute:"2-digit",hour12:false} as const;
  return new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",...date,...time}).format(new Date(value));
}
export function r2Status(backup:VpsBackup){return backup.cloud?.status==="success"?"已加密上传":backup.cloud?.status==="uploading"?"上传中":backup.cloud?.status==="error"?"上传失败":"仅本地";}
