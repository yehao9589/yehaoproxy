"use client";
import { useMemo, useState } from "react";

type Parsed = { line:number; host:string; port:string; username:string; password:string; valid:boolean; error?:string };
function parseLine(raw:string,line:number):Parsed{
  const delimiter=raw.includes("|")?"|":raw.includes(",")?",":":";
  const parts=raw.split(delimiter).map(x=>x.trim());
  const [host,port,username="",password=""]=parts;
  if(!host)return{line,host:"",port:"",username,password,valid:false,error:"缺少主机地址"};
  if(!/^\d+$/.test(port||"")||Number(port)<1||Number(port)>65535)return{line,host,port:port||"",username,password,valid:false,error:"端口无效"};
  if(parts.length>4)return{line,host,port,username,password,valid:false,error:"字段数量过多"};
  return{line,host,port,username,password,valid:true};
}

export default function ImportClient(){
  const[mode,setMode]=useState<"batch"|"single">("batch"),[lines,setLines]=useState(""),[message,setMessage]=useState(""),[submitting,setSubmitting]=useState(false),[result,setResult]=useState<{inserted:number;duplicates:number}|null>(null);
  const parsed=useMemo(()=>lines.split(/\r?\n/).map((x,i)=>({raw:x.trim(),line:i+1})).filter(x=>x.raw).map(x=>parseLine(x.raw,x.line)),[lines]);
  const valid=parsed.filter(x=>x.valid),invalid=parsed.filter(x=>!x.valid);
  const localDuplicates=valid.length-new Set(valid.map(x=>`${x.host}:${x.port}:${x.username}`)).size;
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(!valid.length||invalid.length||localDuplicates){setMessage("请先修正格式错误和重复数据");return}setSubmitting(true);setMessage("");setResult(null);const body=Object.fromEntries(new FormData(e.currentTarget));body.lines=lines;const r=await fetch("/api/admin/inventory-bulk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),d=await r.json();setSubmitting(false);if(!r.ok){setMessage(d.error||"入库失败");return}setResult({inserted:d.inserted,duplicates:d.duplicates||0});setMessage(`已成功入库 ${d.inserted} 条代理`);setLines("")}
  function template(){setLines("66.17.66.107:443:user001:password001\n66.17.66.108:443:user002:password002\n66.17.66.109:1080:user003:password003")}
  return <div className="inventory-workbench">
    <div className="inventory-intro"><div><span>库存中心 / 手动入库</span><h2>代理库存入库</h2><p>支持单条录入和最多 5,000 条批量导入，系统会自动校验、加密凭据并检查重复库存。</p></div><div className="import-security"><i>✓</i><span><b>凭据加密存储</b><small>密码不会以明文保存</small></span></div></div>
    <div className="import-layout"><form className="import-main" onSubmit={submit}>
      <div className="import-section"><div className="import-section-title"><span>1</span><div><h3>选择入库方式</h3><p>少量数据可单条录入，大批量库存建议使用批量模式</p></div></div><div className="import-mode"><button type="button" className={mode==="batch"?"on":""} onClick={()=>setMode("batch")}><b>批量粘贴</b><small>每行一条，最多 5,000 条</small></button><button type="button" className={mode==="single"?"on":""} onClick={()=>setMode("single")}><b>单条录入</b><small>适合临时补充库存</small></button></div></div>
      <div className="import-section"><div className="import-section-title"><span>2</span><div><h3>设置库存属性</h3><p>以下属性将应用于本次导入的全部代理</p></div></div><div className="import-fields"><label>产品类型<select name="product"><option value="static-isp">静态住宅 ISP</option><option value="residential">动态住宅</option><option value="datacenter">数据中心</option><option value="mobile">移动代理</option></select></label><label>国家 / 地区<input name="country" defaultValue="US" maxLength={2} required/><small>ISO 两位国家代码</small></label><label>城市<input name="city" placeholder="可选，例如 New York"/></label><label>协议<select name="protocol"><option>HTTPS</option><option>HTTP</option><option>SOCKS5</option></select></label><label>成本单价（USD）<input name="cost" type="number" min="0" step="0.01" placeholder="0.00"/></label><label>销售单价（USD）<input name="salePrice" type="number" min="0.01" step="0.01" placeholder="0.00" required/></label></div></div>
      <div className="import-section"><div className="import-section-title"><span>3</span><div><h3>{mode==="batch"?"粘贴代理数据":"填写代理信息"}</h3><p>支持冒号、逗号或竖线分隔：主机、端口、用户名、密码</p></div><button type="button" className="template-button" onClick={template}>填入示例</button></div><textarea value={lines} onChange={e=>setLines(mode==="single"?e.target.value.split(/\r?\n/)[0]:e.target.value)} rows={mode==="single"?4:11} placeholder="host:port:username:password" spellCheck={false}/><div className="format-help"><span><b>有认证：</b>host:port:username:password</span><span><b>无认证：</b>host:port</span></div></div>
      <div className="import-section"><div className="import-section-title"><span>4</span><div><h3>重复数据处理</h3><p>选择发现数据库已有相同代理时的处理方式</p></div></div><div className="duplicate-policy"><label><input type="radio" name="duplicatePolicy" value="skip" defaultChecked/><span><b>跳过重复项（推荐）</b><small>继续导入其他有效数据，并在结果中统计</small></span></label><label><input type="radio" name="duplicatePolicy" value="error"/><span><b>发现重复时终止</b><small>确保整批数据全部为新库存</small></span></label></div></div>
      {message&&<div className={result?"import-success":"import-error"}>{message}</div>}
      <div className="import-actions"><span>提交前请确认国家、产品类型和价格设置正确</span><button className="primary" disabled={submitting||!valid.length||!!invalid.length||!!localDuplicates}>{submitting?"正在安全入库…":`确认入库 ${valid.length} 条`}</button></div>
    </form>
    <aside className="import-preview"><div className="preview-title"><div><h3>数据检查</h3><p>输入后实时解析</p></div><span className={invalid.length?"bad":"good"}>{invalid.length?"需要修正":"校验正常"}</span></div><div className="import-stats"><article><b>{parsed.length}</b><span>识别总数</span></article><article><b className="green-text">{valid.length}</b><span>格式有效</span></article><article><b className={invalid.length?"red-text":""}>{invalid.length}</b><span>格式错误</span></article><article><b className={localDuplicates?"red-text":""}>{localDuplicates}</b><span>本批重复</span></article></div><div className="preview-list"><h4>解析预览 <small>最多显示前 8 条</small></h4>{!parsed.length?<div className="preview-empty"><i>▤</i><b>等待输入代理数据</b><span>粘贴后将在这里显示校验结果</span></div>:parsed.slice(0,8).map(x=><div className={`preview-row ${x.valid?"":"invalid"}`} key={x.line}><span>{x.line}</span><div><b>{x.host||"未识别"}:{x.port||"-"}</b><small>{x.error||(x.username?`账号：${x.username}`:"无认证")}</small></div><i>{x.valid?"✓":"!"}</i></div>)}</div><div className="import-tips"><h4>导入说明</h4><ul><li>主机支持 IPv4 和域名格式</li><li>端口范围必须为 1–65535</li><li>密码将使用 AES-GCM 加密保存</li><li>导入后库存状态默认为“可售”</li></ul></div></aside></div>
  </div>
}
