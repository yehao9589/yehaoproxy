"use client";

import {useEffect,useState} from "react";

export default function ServicePriceSettings(){
  const[resetPrice,setResetPrice]=useState("5");
  const[replacePrice,setReplacePrice]=useState("5");
  const[freeDays,setFreeDays]=useState("3");
  const[freeCount,setFreeCount]=useState("1");
  const[credentialEditing,setCredentialEditing]=useState(false);
  const[expiredGraceDays,setExpiredGraceDays]=useState("7");
  const[expiredArchiveDays,setExpiredArchiveDays]=useState("30");
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState("");

  useEffect(()=>{
    fetch("/api/admin/expiry-policy").then(r=>r.json()).then(data=>{if(data.graceDays!=null)setExpiredGraceDays(String(data.graceDays));if(data.archiveDays!=null)setExpiredArchiveDays(String(data.archiveDays))}).catch(()=>{});
    fetch("/api/admin/settings").then(r=>r.json()).then(data=>{
      const options=data.options||{};
      if(options.nodeTrafficResetPrice!=null)setResetPrice(options.nodeTrafficResetPrice);
      if(options.ipReplacementPrice!=null)setReplacePrice(options.ipReplacementPrice);
      if(options.ipReplacementFreeDays!=null)setFreeDays(options.ipReplacementFreeDays);
      if(options.ipReplacementFreeCount!=null)setFreeCount(options.ipReplacementFreeCount);
      setCredentialEditing(options.customer_node_credential_editing==="true");
    }).catch(()=>setMessage("配置加载失败，请刷新后重试"));
  },[]);

  async function save(){
    setSaving(true);setMessage("");
    const settings=[
      ["nodeTrafficResetPrice",resetPrice],
      ["ipReplacementPrice",replacePrice],
      ["ipReplacementFreeDays",freeDays],
      ["ipReplacementFreeCount",freeCount],
      ["customer_node_credential_editing",String(credentialEditing)],
    ];
    for(const[key,value]of settings){
      const response=await fetch("/api/admin/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"system-option",key,value})});
      const data=await response.json();
      if(!response.ok){setSaving(false);setMessage(data.error||"保存失败");return;}
    }
    const policyResponse=await fetch("/api/admin/expiry-policy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({graceDays:Number(expiredGraceDays),archiveDays:Number(expiredArchiveDays)})});
    const policyData=await policyResponse.json();
    if(!policyResponse.ok){setSaving(false);setMessage(policyData.error||"过期策略保存失败");return;}
    setSaving(false);setMessage("商品服务功能已保存，客户中心立即生效");
  }

  return <section className="setting-card service-policy-card product-service-settings">
    <div className="setting-title"><div><h2>默认服务金额与规则</h2><p>商品没有设置独立金额时使用这里的默认值。</p></div><span>默认配置</span></div>
    {message&&<div className={message.includes("已保存")?"service-policy-message success":"service-policy-message error"}>{message}</div>}
    <div className="policy-section">
      <div className="policy-section-head"><i className="price">IP</i><div><h3>代理 IP 服务</h3><p>适用于代理 IP 商品的更换服务和免费保障规则。</p></div></div>
      <div className="policy-price-grid">
        <label><span>付费更换 IP<small>超过免费期或免费次数用完后的单次费用</small></span><div><em>¥</em><input aria-label="付费更换 IP 价格" type="number" min="0" step="0.01" value={replacePrice} onChange={e=>setReplacePrice(e.target.value)}/><b>元 / 次</b></div></label>
        <label><span>免费更换有效期<small>从 IP 开通时间开始计算</small></span><div><input aria-label="免费更换有效天数" type="number" min="0" max="365" step="1" value={freeDays} onChange={e=>setFreeDays(e.target.value)}/><b>天内</b></div></label>
        <label><span>免费更换次数<small>每条已开通 IP 在有效期内可用次数</small></span><div><input aria-label="免费更换次数" type="number" min="0" max="100" step="1" value={freeCount} onChange={e=>setFreeCount(e.target.value)}/><b>次</b></div></label>
      </div>
      <div className="policy-tip"><b>免费规则</b><span>IP 开通后 {freeDays||0} 天内可免费更换 {freeCount||0} 次，超期或次数用完后按上方价格收费。</span></div>
      <div className="policy-permission-row proxy-credential-permission">
        <div><b>允许客户修改代理 IP 账号与密码</b><small>{credentialEditing?"客户可自行修改已开通代理 IP 的认证账号与密码。":"关闭后客户中心的编辑入口将显示为灰色，接口同时拒绝修改。"}</small></div>
        <button className={`policy-toggle ${credentialEditing?"on":""}`} type="button" role="switch" aria-checked={credentialEditing} aria-label="允许客户修改代理 IP 账号与密码" onClick={()=>setCredentialEditing(value=>!value)}><i/></button>
      </div>
    </div>
    <div className="policy-section">
      <div className="policy-section-head"><i className="permission">节</i><div><h3>节点服务</h3><p>适用于电脑节点、软路由中转等节点类商品。</p></div></div>
      <div className="policy-price-grid">
        <label><span>节点流量重置<small>客户购买单次流量重置服务的费用</small></span><div><em>¥</em><input aria-label="节点流量重置价格" type="number" min="0" step="0.01" value={resetPrice} onChange={e=>setResetPrice(e.target.value)}/><b>元 / 次</b></div></label>
      </div>
    </div>
    <div className="policy-section">
      <div className="policy-section-head"><i className="permission">期</i><div><h3>过期服务处理</h3><p>客户中心自动分类与归档，订单、账单及日志仍永久保留。</p></div></div>
      <div className="policy-price-grid"><label><span>原列表保留时间<small>到期后仍显示在原服务列表，只允许续费</small></span><div><input type="number" min="0" max="3650" step="1" value={expiredGraceDays} onChange={e=>setExpiredGraceDays(e.target.value)}/><b>天</b></div></label><label><span>自动归档时间<small>超过此时间后从客户中心隐藏</small></span><div><input type="number" min="1" max="3650" step="1" value={expiredArchiveDays} onChange={e=>setExpiredArchiveDays(e.target.value)}/><b>天</b></div></label></div>
      <div className="policy-tip"><b>当前规则</b><span>到期 {expiredGraceDays||0} 天内保留原处，之后移入“已到期服务”，{expiredArchiveDays||0} 天后自动归档。</span></div>
    </div>
    <footer className="service-policy-footer"><button className="primary" type="button" disabled={saving} onClick={save}>{saving?"正在保存…":"保存默认配置"}</button></footer>
  </section>;
}
