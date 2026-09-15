"use client";
import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import "./admin-refresh.css";

type RefreshContextValue={register:(loader:()=>Promise<unknown>)=>()=>void;refresh:()=>Promise<void>;busy:boolean;available:boolean};
const Context=createContext<RefreshContextValue|null>(null);
export function AdminRefreshProvider({children}:{children:ReactNode}){
  const loaders=useRef(new Set<()=>Promise<unknown>>());
  const pending=useRef(false);
  const [busy,setBusy]=useState(false),[available,setAvailable]=useState(false);
  const register=useCallback((loader:()=>Promise<unknown>)=>{loaders.current.add(loader);setAvailable(true);return()=>{loaders.current.delete(loader);setAvailable(loaders.current.size>0)}},[]);
  const refresh=useCallback(async()=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);
    try{const results=await Promise.allSettled([...loaders.current].map(loader=>loader()));const failed=results.find(result=>result.status==="rejected"||result.value===false);if(failed)throw new Error(failed.status==="rejected"&&failed.reason instanceof Error?failed.reason.message:"数据刷新失败，请查看页面错误提示");window.dispatchEvent(new CustomEvent("yehao:toast",{detail:{message:"数据刷新成功",kind:"success"}}))}catch(error){window.dispatchEvent(new CustomEvent("yehao:toast",{detail:{message:error instanceof Error?error.message:"数据刷新失败",kind:"error"}}))}finally{pending.current=false;setBusy(false)}
  },[]);
  return <Context.Provider value={{register,refresh,busy,available}}>{children}</Context.Provider>;
}
export function useAdminRefresh(loader:()=>Promise<unknown>,enabled=true){
  const context=useContext(Context),latest=useRef(loader);
  useLayoutEffect(()=>{latest.current=loader});
  const register=context?.register;
  useEffect(()=>enabled?register?.(()=>latest.current()):undefined,[register,enabled]);
}
export function AdminRefreshButton({className}:{className?:string}){
  const context=useContext(Context);
  if(!context?.available)return null;
  return <button type="button" className={className} disabled={context.busy} aria-busy={context.busy} onClick={()=>void context.refresh()}>{context.busy?"刷新中…":"刷新数据"}</button>;
}
