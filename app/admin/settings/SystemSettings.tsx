"use client";
import {useEffect,useState} from "react";
import AdminAccounts from "./AdminAccounts";
import SettingsClient from "./SettingsClient";
export default function SystemSettings(){const[view,setView]=useState<"config"|"admins">("config"),[canManageAdmins,setCanManageAdmins]=useState(false);useEffect(()=>{fetch("/api/admin/session").then(r=>r.json()).then(d=>setCanManageAdmins(Boolean(d.permissions?.includes("admins"))))},[]);return <div><div className="admin-tabs"><button className={view==="config"?"on":""} onClick={()=>setView("config")}>系统配置</button>{canManageAdmins&&<button className={view==="admins"?"on":""} onClick={()=>setView("admins")}>管理员账户</button>}</div>{view==="config"?<SettingsClient/>:<AdminAccounts/>}</div>}
