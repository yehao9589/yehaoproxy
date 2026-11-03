/** User-facing names only: stored backup IDs and paths remain immutable. */
function panelName(value) {
  let name=Array.from(String(value||'X-Panel').normalize('NFC')
    .replace(/[<>:"/\\|?*]/g,'_')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'_')
    .replace(/\s+/g,' ').trim().replace(/^[. ]+|[. ]+$/g,''))
    .slice(0,48).join('').replace(/[. ]+$/g,'');
  if(!name)name='X-Panel';
  if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))name='面板_'+name;
  return name;
}

function backupTime(value) {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '未知时间';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
}

/**
 * @param {{serverName?:string,createdAt?:string,id?:string}} backup
 * @param {'db'|'config'} kind
 */
export function vpsBackupFileName(backup,kind='db') {
  if(!['db','config'].includes(kind))throw new Error('下载类型无效');
  return `${panelName(backup.serverName)}_${backupTime(backup.createdAt)}_${kind==='db'?'数据库.db':'Xray配置.json'}`;
}

/** ASCII fallback plus RFC 5987 UTF-8 name supports Chinese without invalid HTTP headers. */
export function vpsBackupContentDisposition(backup,kind='db') {
  const name=vpsBackupFileName(backup,kind);
  const id=String(backup.id||'backup').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)||'backup';
  const fallback=`x-panel-${kind==='db'?'database':'xray-config'}-${id}.${kind==='db'?'db':'json'}`;
  const encoded=encodeURIComponent(name).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
