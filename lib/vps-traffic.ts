import {orderVpsTargets} from "./vps-bindings";
import {resetKomariOrderTraffic} from "./komari";
import {fetchXPanelTraffic,resetXPanelCycle} from "./xpanel";

// Service operations resolve the unified binding, never a provider-specific binding lookup.
export async function resetOrderVpsTraffic(orderId:string,requestId:string){
 const targets=await orderVpsTargets(orderId);
 if(!targets.length)throw new Error("该节点服务尚未绑定 VPS，无法执行流量重置");
 if(targets.length!==1)throw new Error("该订单存在旧版重复绑定，请先选择保留的一台 VPS");
 const target=targets[0];
 if(target.provider==="komari")await resetKomariOrderTraffic(orderId,target.serverId,requestId);
 else{const binding={orderId,serverId:target.serverId,updatedAt:target.updatedAt};await fetchXPanelTraffic(binding);await resetXPanelCycle(target.serverId);await fetchXPanelTraffic(binding);}
 return target;
}
