const locks=new Map<string,Promise<void>>();

/**
 * Serializes sensitive mutations inside one application instance. Database
 * transactions still provide atomicity; this lock prevents duplicate clicks
 * from racing through the validation phase before the transaction begins.
 */
export async function withRequestLock<T>(key:string,work:()=>Promise<T>):Promise<T>{
  const previous=locks.get(key)??Promise.resolve();
  let release!:()=>void;
  const current=new Promise<void>(resolve=>{release=resolve});
  const queued=previous.then(()=>current);
  locks.set(key,queued);
  await previous;
  try{return await work()}
  finally{
    release();
    if(locks.get(key)===queued)locks.delete(key);
  }
}
