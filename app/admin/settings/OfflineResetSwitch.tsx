"use client";
import {useState} from "react";
export default function OfflineResetSwitch({value=true,form}:{value?:boolean;form?:string}){const [on,setOn]=useState(value);return <label className="wide vps-enable"><input type="hidden" name="deferOfflineReset" form={form} value={String(on)}/><button type="button" role="switch" aria-label="离线时延后重置" aria-checked={on} onClick={()=>setOn(!on)} className={`policy-toggle${on?" on":""}`}><i/></button><span><b>离线时延后重置</b><small>开启：恢复在线后重置；关闭：到周期按最后有效数据重置，未上报流量可能计入新周期。没有有效历史数据时仍需等待采样。</small></span></label>}
