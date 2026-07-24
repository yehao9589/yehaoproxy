"use client";
import {useEffect,useState} from "react";

export default function ServicePriceSettings(){
  const[resetPrice,setResetPrice]=useState("5");
  const[replacePrice,setReplacePrice]=useState("5");
  const[credentialEditing,setCredentialEditing]=useState(false);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState("");
  useEffect(()=>{fetch("/api/admin/settings").then(r=>r.json()).then(d=>{
    if(d.options?.nodeTrafficResetPrice!=null)setResetPrice(d.options.nodeTrafficResetPrice);
    if(d.options?.ipReplacementPrice!=null)setReplacePrice(d.options.ipReplacementPrice);
    setCredentialEditing(d.options?.customer_node_credential_editing==="true");
  }).catch(()=>setMessage("配置加载失败，请刷新后重试"))},[]);
  async function save(){
    setSaving(true);setMessage("");
    const settings=[["nodeTrafficResetPrice",resetPrice],["ipReplacementPrice",replacePrice],["customer_node_credential_editing",String(credentialEditing)]];
    for(const[key,value]of settings){const r=await fetch("/api/admin/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"system-option",key,value})}),d=await r.json();if(!r.ok){setSaving(false);setMessage(d.error||"保存失败");return}}
    setSaving(false);setMessage("服务策略已保存，客户中心立即生效");
  }
  return <div className="service-policy-stack">
    {message&&<div className={message.includes("已保存")?"service-policy-message success":"service-policy-message error"}>{message}</div>}
    <section className="setting-card service-policy-card">
      <div className="setting-title"><div><h2>客户功能与付费售后</h2><p>集中管理客户自助操作权限，以及需要支付后才能提交的售后服务。</p></div><span>运营策略</span></div>
      <div className="policy-section">
        <div className="policy-section-head"><i className="price">¥</i><div><h3>付费售后价格</h3><p>客户完成余额支付后，系统才会创建对应售后单。</p></div></div>
        <div className="policy-price-grid">
          <label><span>节点流量重置<small>单次重置服务费用</small></span><div><em>¥</em><input aria-label="节点流量重置价格" type="number" min="0" step="0.01" value={resetPrice} onChange={e=>setResetPrice(e.target.value)}/><b>元 / 次</b></div></label>
          <label><span>超过免费期更换 IP<small>3 天免费期结束后的单次费用</small></span><div><em>¥</em><input aria-label="付费更换 IP 价格" type="number" min="0" step="0.01" value={replacePrice} onChange={e=>setReplacePrice(e.target.value)}/><b>元 / 次</b></div></label>
        </div>
        <div className="policy-tip"><b>免费规则</b><span>IP 提取后 3 天内可免费更换一次；免费次数用完或超过 3 天后，按上方价格收费。</span></div>
      </div>
      <div className="policy-section">
        <div className="policy-section-head"><i className="permission">权</i><div><h3>客户自助权限</h3><p>控制客户可以在“我的代理”页面执行的敏感操作。</p></div></div>
        <div className={`policy-permission-row ${credentialEditing?"enabled":"disabled"}`}>
          <div><b>允许修改节点账号与密码</b><small>{credentialEditing?"客户可自行修改已分配代理的登录凭据。":"编辑入口保留但显示为灰色，接口同时拒绝修改请求。"}</small></div>
          <div className="policy-switch-wrap"><span>{credentialEditing?"已开启":"已关闭"}</span><button type="button" role="switch" aria-checked={credentialEditing} aria-label="允许客户修改节点账号密码" onClick={()=>setCredentialEditing(x=>!x)}><i/></button></div>
        </div>
      </div>
      <footer className="service-policy-footer"><span>所有修改仅影响后续客户操作，不会改动现有资源数据。</span><button className="primary" type="button" disabled={saving} onClick={save}>{saving?"正在保存…":"保存服务策略"}</button></footer>
    </section>
  </div>
}
