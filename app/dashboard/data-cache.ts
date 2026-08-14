"use client";

type CachedResult<T>={ok:boolean;status:number;data:T};
type CacheEntry={expiresAt:number;promise:Promise<CachedResult<unknown>>};

const cache=new Map<string,CacheEntry>();
const DEFAULT_TTL=15_000;

export async function dashboardJson<T>(url:string,{force=false,ttl=DEFAULT_TTL}:{force?:boolean;ttl?:number}={}):Promise<CachedResult<T>>{
  const current=cache.get(url);
  if(!force&&current&&current.expiresAt>Date.now())return current.promise as Promise<CachedResult<T>>;
  const promise=fetch(url).then(async response=>({ok:response.ok,status:response.status,data:await response.json() as T})).catch(error=>{cache.delete(url);throw error});
  cache.set(url,{expiresAt:Date.now()+ttl,promise:promise as Promise<CachedResult<unknown>>});
  return promise;
}

export function invalidateDashboardData(prefix="/api/"){
  for(const key of cache.keys())if(key.startsWith(prefix))cache.delete(key);
}
