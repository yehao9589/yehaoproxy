const styleId="node-credential-editing-policy";
if(typeof document!=="undefined"){
  let style=document.getElementById(styleId) as HTMLStyleElement|null;
  if(!style){style=document.createElement("style");style.id=styleId;style.textContent=".proxy-batch-bar button:nth-of-type(2),.proxy-row-actions button:nth-of-type(2){color:#94a3b8!important;background:#f1f5f9!important;border-color:#dbe3ee!important;box-shadow:none!important;cursor:not-allowed!important;opacity:.72!important;pointer-events:none!important}";document.head.appendChild(style)}
  fetch("/api/proxies/settings").then(r=>r.json()).then(d=>{if(d.credentialEditing===true)document.getElementById(styleId)?.remove()}).catch(()=>{});
}
