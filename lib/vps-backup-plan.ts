export type VpsBackupSchedule={enabled:boolean;kind:"daily"|"interval";time:string;hours:number;retain:number};
export type VpsBackupPlan={serverId:string;schedule:VpsBackupSchedule;nextBackupAt:string|null;updatedAt:string};
export const DEFAULT_VPS_BACKUP_SCHEDULE:VpsBackupSchedule={enabled:false,kind:"daily",time:"03:00",hours:24,retain:7};
export function normalizeVpsBackupSchedule(input:unknown,previous:VpsBackupSchedule=DEFAULT_VPS_BACKUP_SCHEDULE):VpsBackupSchedule{
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("备份计划格式无效");
  const value={...previous,...input} as VpsBackupSchedule;
  if(typeof value.enabled!=="boolean"||!["daily","interval"].includes(value.kind))throw new Error("备份周期无效");
  if(typeof value.time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))throw new Error("备份时间应为 HH:mm");
  const hours=Number(value.hours),retain=Number(value.retain);
  if(!Number.isInteger(hours)||hours<1||hours>720)throw new Error("备份间隔应为 1–720 小时");
  if(!Number.isInteger(retain)||retain<1||retain>100)throw new Error("保留数量应为 1–100 份");
  return {enabled:value.enabled,kind:value.kind,time:value.time,hours,retain};
}
export function nextVpsBackupAt(schedule:VpsBackupSchedule,now=Date.now()):string|null{
  if(!schedule.enabled)return null;
  if(schedule.kind==="interval")return new Date(now+schedule.hours*3600000).toISOString();
  const [hour,minute]=schedule.time.split(":").map(Number),day=86400000,offset=8*3600000;
  let next=Math.floor((now+offset)/day)*day-offset+hour*3600000+minute*60000;
  if(next<=now)next+=day;
  return new Date(next).toISOString();
}
export function updateVpsBackupPlan(serverId:string,schedule:VpsBackupSchedule,previous?:VpsBackupPlan,now=Date.now()):VpsBackupPlan{
  const same=previous&&["enabled","kind","time","hours"].every(key=>previous.schedule[key as keyof VpsBackupSchedule]===schedule[key as keyof VpsBackupSchedule]);
  return {serverId,schedule,nextBackupAt:same?previous.nextBackupAt:nextVpsBackupAt(schedule,now),updatedAt:new Date(now).toISOString()};
}
