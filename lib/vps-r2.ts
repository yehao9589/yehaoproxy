import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {systemOptions} from "../db/schema";
import {setSystemOption} from "./db-upsert";
import {decryptCredential,encryptCredential} from "./inventory-crypto";
import {withRequestLock} from "./request-lock";
import {r2Destination} from "../scripts/vps/r2-config.mjs";

const KEY="vps_r2_backup_storage";
type Stored={enabled:boolean;accountId:string;bucket:string;prefix:string;jurisdiction:string;encryptedAccessKeyId:string|null;encryptedSecretAccessKey:string|null;encryptedArchiveKey:string|null;keyId:string|null;keyExportedAt:string|null;updatedAt:string|null};
const defaults:Stored={enabled:false,accountId:"",bucket:"",prefix:"yehaoproxy/vps",jurisdiction:"default",encryptedAccessKeyId:null,encryptedSecretAccessKey:null,encryptedArchiveKey:null,keyId:null,keyExportedAt:null,updatedAt:null};
async function stored():Promise<Stored>{const[row]=await getDb().select().from(systemOptions).where(eq(systemOptions.key,KEY)).limit(1);return row?.value?{...defaults,...JSON.parse(row.value)}:{...defaults};}
function publicValue(value:Stored){return {enabled:value.enabled,accountId:value.accountId,bucket:value.bucket,prefix:value.prefix,jurisdiction:value.jurisdiction,accessKeyConfigured:Boolean(value.encryptedAccessKeyId),secretConfigured:Boolean(value.encryptedSecretAccessKey),encryptionKeyConfigured:Boolean(value.encryptedArchiveKey),keyId:value.keyId,keyExportedAt:value.keyExportedAt,updatedAt:value.updatedAt};}
export type PublicR2BackupSettings=ReturnType<typeof publicValue>;
export async function getPublicR2BackupSettings(){return publicValue(await stored());}
export async function saveR2BackupSettings(input:Record<string,unknown>){return withRequestLock(KEY,async()=>{
  const old=await stored(),enabled=input.enabled===true;
  const destination=r2Destination({accountId:String(input.accountId||""),bucket:String(input.bucket||""),prefix:String(input.prefix||"yehaoproxy/vps"),jurisdiction:String(input.jurisdiction||"default")});
  const accessKeyId=String(input.accessKeyId||"").trim(),secretAccessKey=String(input.secretAccessKey||"").trim();
  if(accessKeyId&&!/^[A-Za-z0-9_-]{16,128}$/.test(accessKeyId))throw new Error("R2 Access Key ID 格式无效");
  if(secretAccessKey&&!/^[^\s]{32,256}$/.test(secretAccessKey))throw new Error("R2 Secret Access Key 格式无效");
  if(enabled&&(!old.encryptedArchiveKey||!old.keyExportedAt))throw new Error("启用前请先下载并单独保管解密密钥");
  const next:Stored={...old,...destination,enabled,encryptedAccessKeyId:accessKeyId?await encryptCredential(accessKeyId):old.encryptedAccessKeyId,encryptedSecretAccessKey:secretAccessKey?await encryptCredential(secretAccessKey):old.encryptedSecretAccessKey,updatedAt:new Date().toISOString()};
  if(enabled&&(!next.encryptedAccessKeyId||!next.encryptedSecretAccessKey))throw new Error("请先填写 R2 的访问密钥和秘密访问密钥");
  await setSystemOption(KEY,JSON.stringify(next));return publicValue(next);
});}
export async function r2RuntimeSettings(requireEnabled=true){
  const value=await stored();if(requireEnabled&&!value.enabled)return null;
  const destination=r2Destination(value);
  const accessKeyId=await decryptCredential(value.encryptedAccessKeyId),secretAccessKey=await decryptCredential(value.encryptedSecretAccessKey),encryptionKey=await decryptCredential(value.encryptedArchiveKey);
  if(!accessKeyId||!secretAccessKey)throw new Error("R2 访问密钥未配置或无法解密，请重新保存");
  if(requireEnabled&&(!encryptionKey||!value.keyExportedAt))throw new Error("请先下载并保管 R2 备份解密密钥");
  return {...destination,accessKeyId,secretAccessKey,encryptionKey};
}
export async function exportR2RecoveryKey(){return withRequestLock(KEY,async()=>{
  const value=await stored();let key=await decryptCredential(value.encryptedArchiveKey);
  if(value.encryptedArchiveKey&&!key)throw new Error("现有备份密钥无法解密，不能自动替换；请先恢复原资产加密密钥");
  if(!key){key=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,"0")).join("");value.encryptedArchiveKey=await encryptCredential(key);}
  const hash=await crypto.subtle.digest("SHA-256",Uint8Array.from(key.match(/.{2}/g)!.map(part=>parseInt(part,16))));
  value.keyId=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,"0")).join("").slice(0,16);value.keyExportedAt=new Date().toISOString();
  await setSystemOption(KEY,JSON.stringify(value));
  return {format:"YehaoProxy-R2-Recovery-Key",version:1,keyId:value.keyId,encryptionKey:key,exportedAt:value.keyExportedAt,instructions:"请离线单独保管，不要与云端备份放在一起。使用 Node.js 22+ 执行：node yehaoproxy-decrypt-backup.mjs 备份.yhbackup 本密钥.json 新输出目录。工具只解密，不会自动恢复 VPS。"};
});}
