"use client";
import {useEffect,useState} from "react";
import type {PublicR2BackupSettings} from "../../../lib/vps-r2";
import {getR2SetupState} from "../../../lib/vps-r2-setup";

function initial(settings:PublicR2BackupSettings){return {enabled:settings.enabled,accountId:settings.accountId,bucket:settings.bucket,prefix:settings.prefix,jurisdiction:settings.jurisdiction,accessKeyId:"",secretAccessKey:""};}
export default function VpsR2Settings({settings,onChanged,bridgeUnavailable}:{settings:PublicR2BackupSettings;onChanged:()=>Promise<unknown>;bridgeUnavailable:boolean}){
  const [form,setForm]=useState(()=>initial(settings)),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(""),[error,setError]=useState("");
  useEffect(()=>{if(!dirty)setForm(initial(settings));},[settings.updatedAt,settings.keyExportedAt,settings.enabled,dirty,settings]);
  function field(key:keyof typeof form,value:string|boolean){setForm(current=>({...current,[key]:value}));setDirty(true);setError("");}
  const toast=(message:string)=>window.dispatchEvent(new CustomEvent("yehao:toast",{detail:{kind:"success",message}}));
  async function request(action:string,extra:Record<string,unknown>={}){const response=await fetch("/api/admin/vps-operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...extra})});if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error||"R2 设置操作失败");}return response;}
  async function save(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy("save");setError("");try{const result=await (await request("save-cloud-settings",{settings:form})).json();setForm(initial(result.data));setDirty(false);await onChanged();toast(result.message);}catch(reason){setError(reason instanceof Error?reason.message:"保存失败");}finally{setBusy("");}}
  async function test(){if(busy||dirty)return;setBusy("test");setError("");try{const result=await (await request("test-cloud")).json();toast(result.message);}catch(reason){setError(reason instanceof Error?reason.message:"检测失败");}finally{setBusy("");}}
  async function recovery(){if(busy)return;setBusy("key");setError("");try{
    const response=await request("export-recovery-key"),blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=`YehaoProxy_R2备份解密密钥_${settings.keyId||"请离线保管"}.json`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
    await onChanged();toast("解密密钥已导出，请另存到电脑或离线介质，不要上传到备份存储桶");
  }catch(reason){setError(reason instanceof Error?reason.message:"密钥导出失败");}finally{setBusy("");}}
  const configured=settings.accessKeyConfigured&&settings.secretConfigured;
  const setup=getR2SetupState(settings,form.enabled,dirty);
  return <section id="vps-r2-settings" className="vops-card vops-r2-settings"><header><div><h3>异地备份 · Cloudflare R2</h3><p>本地继续保留，云端副本先压缩再加密；默认关闭，不会自动创建存储桶。</p></div><span data-ui="status" className={`vops-status ${settings.enabled?"ok":"waiting"}`}>{settings.enabled?"已启用":"未启用"}</span></header>
    <form onSubmit={save}>
      <div className="vops-r2-form-body">
      {error&&<div className="vops-notice error" role="alert">{error}</div>}
      <div className={`vops-r2-setup ${setup.tone}`} role="status" aria-live="polite">
        <div className="vops-r2-setup-content"><strong><span aria-hidden="true">{setup.tone==="success"?"✓":"!"}</span>{setup.title}</strong><p>{setup.description}</p><ol aria-label="R2 启用步骤">{setup.steps.map((step,index)=><li key={step.label} className={step.complete?"done":"pending"}><span aria-hidden="true">{step.complete?"✓":index+1}</span>{step.label}<small>{step.complete?"已完成":"待完成"}</small></li>)}</ol></div>
        {!setup.keyReady&&<button data-ui="action" data-ui-tone="primary" className="primary" type="button" disabled={!!busy} onClick={()=>void recovery()}>{busy==="key"?"正在导出…":"先下载解密密钥"}</button>}
      </div>
      <div className="vops-r2-switch"><span><b>新备份自动上传 R2</b><small>开启后只自动上传之后生成的备份；历史备份可在下方逐条上传。</small><small id="r2-enable-help" className={!setup.keyReady?"vops-r2-enable-blocked":"vops-r2-enable-help"}>{setup.switchHelp}</small></span><button type="button" role="switch" aria-label="启用 R2 异地备份" aria-describedby="r2-enable-help" aria-checked={form.enabled} className={`policy-toggle${form.enabled?" on":""}`} disabled={!!busy||(!setup.keyReady&&!form.enabled)} title={setup.switchHelp} onClick={()=>field("enabled",!form.enabled)}><i/></button></div>
      <div className="vops-r2-fields"><label>Account ID<input value={form.accountId} onChange={event=>field("accountId",event.target.value)} placeholder="Cloudflare 的 32 位账号 ID" autoComplete="off"/></label><label>存储桶名称<input value={form.bucket} onChange={event=>field("bucket",event.target.value)} placeholder="例如 yehaoproxy-backups" autoComplete="off"/></label><label>Access Key ID<input type="password" value={form.accessKeyId} onChange={event=>field("accessKeyId",event.target.value)} placeholder={settings.accessKeyConfigured?"已保存，留空不修改":"填写 R2 S3 访问密钥 ID"} autoComplete="new-password"/></label><label>Secret Access Key<input type="password" value={form.secretAccessKey} onChange={event=>field("secretAccessKey",event.target.value)} placeholder={settings.secretConfigured?"已加密保存，留空不修改":"填写 R2 S3 秘密访问密钥"} autoComplete="new-password"/></label><label>目录前缀<input value={form.prefix} onChange={event=>field("prefix",event.target.value)} placeholder="yehaoproxy/vps"/></label><label>存储桶区域<select value={form.jurisdiction} onChange={event=>field("jurisdiction",event.target.value)}><option value="default">默认（一般选此项）</option><option value="eu">欧盟区域桶</option><option value="us">美国区域桶</option><option value="fedramp">FedRAMP 区域桶</option></select></label></div>
      <div className="vops-r2-recovery"><div><b>先保管解密密钥，再启用异地备份</b><p>{settings.keyExportedAt?`密钥标识 ${settings.keyId} · 已导出，可再次下载。` : "首次下载会生成独立的 AES-256-GCM 备份密钥。密钥丢失后，云端文件无法解密。"}</p><p>密钥请另存到自己的电脑或离线介质，不要与备份放在同一存储桶。</p></div><div className="vops-row-actions"><button data-ui="action" data-ui-tone="secondary" type="button" disabled={!!busy} onClick={()=>void recovery()}>{busy==="key"?"正在导出…":"下载解密密钥"}</button><a href="/tools/yehaoproxy-decrypt-backup.mjs" download>下载解密工具</a></div></div>
      <p className="vops-r2-note">请使用私有存储桶，给 R2 访问密钥选择「Object Read & Write」并限制到此桶，不需要账号管理权限。本功能只上传和核验，不删除云端文件；可在 Cloudflare 控制台另设保留规则。选择 Standard 存储，免费额度与费用以整个 R2 账号的实际用量为准。 <a href="https://developers.cloudflare.com/r2/api/tokens/" target="_blank" rel="noreferrer">查看密钥配置说明 ↗</a></p>
      </div>
      <footer><span>{dirty?"有未保存的修改，请先保存再检测。":"访问凭据加密保存；检测只读取存储桶，不上传测试文件。"}</span><div className="vops-actions"><button data-ui="action" data-ui-tone="secondary" type="button" disabled={!!busy||dirty||!configured||bridgeUnavailable} onClick={()=>void test()}>{busy==="test"?"检测中…":"检测存储桶访问"}</button><button data-ui="action" data-ui-tone="primary" className="primary" disabled={!!busy||!dirty}>{busy==="save"?"正在保存…":setup.saveLabel}</button></div></footer>
    </form>
  </section>;
}
