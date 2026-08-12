import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeEnvironment = Record<string, unknown> & { DB?: D1Database };
let runtimeEnvironment: RuntimeEnvironment = {};

// Cloudflare resolves this native module inside workerd. The Docker/MySQL
// runtime deliberately skips it so the same build can start under Node.js.
if (process.env.CONTAINER !== "true") {
  const cloudflare = await import("cloudflare:workers");
  runtimeEnvironment = cloudflare.env as unknown as RuntimeEnvironment;
}

function createDatabase(client:unknown){return drizzleD1(client as D1Database,{schema})}
type AppDatabase=ReturnType<typeof createDatabase>;
let remoteDatabase:AppDatabase|null=null;

export function databaseDriver() {
  const workerEnv = runtimeEnvironment;
  return String(workerEnv.DATABASE_DRIVER || process.env.DATABASE_DRIVER || "sqlite").toLowerCase() === "mysql" ? "mysql" : "sqlite";
}

class RemoteStatement {
  private params: unknown[] = [];
  constructor(private sql: string, private endpoint: string, private secret: string) {}
  bind(...params: unknown[]) { this.params=params; return this; }
  toPayload(){return{sql:this.sql,params:this.params}}
  private async execute(){
    const response=await fetch(`${this.endpoint}/query`,{method:"POST",headers:{"content-type":"application/json",...(this.secret?{authorization:`Bearer ${this.secret}`}:{})},body:JSON.stringify({sql:this.sql,params:this.params})});
    const result=await response.json() as {rows?:Record<string,unknown>[];meta?:Record<string,unknown>;error?:string};
    if(!response.ok)throw new Error(result.error||"MySQL 查询失败");
    return result;
  }
  async all(){const result=await this.execute();return{results:result.rows||[],success:true,meta:result.meta||{}}}
  async raw(){const result=await this.execute();return(result.rows||[]).map(row=>Object.values(row))}
  async first<T=Record<string,unknown>>(){const result=await this.execute();return(result.rows?.[0]||null) as T|null}
  async run(){const result=await this.execute();return{success:true,meta:result.meta||{},results:result.rows||[]}}
}

class RemoteMySqlDatabase {
  constructor(private endpoint:string,private secret:string){}
  prepare(sql:string){return new RemoteStatement(sql,this.endpoint,this.secret)}
  async batch(statements:RemoteStatement[]){
    const response=await fetch(`${this.endpoint}/batch`,{method:"POST",headers:{"content-type":"application/json",...(this.secret?{authorization:`Bearer ${this.secret}`}:{})},body:JSON.stringify({statements:statements.map(statement=>statement.toPayload())})});
    const result=await response.json() as {results?:Array<{rows?:Record<string,unknown>[];meta?:Record<string,unknown>}>;error?:string};
    if(!response.ok)throw new Error(result.error||"MySQL 事务执行失败");
    return(result.results||[]).map(item=>({results:item.rows||[],success:true,meta:item.meta||{}}));
  }
  async exec(sql:string){return new RemoteStatement(sql,this.endpoint,this.secret).run()}
}

export interface RawResult<T=Record<string,unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number; [key: string]: unknown };
}

export interface RawStatement {
  bind(...values: unknown[]): RawStatement;
  first<T=Record<string,unknown>>(): Promise<T|null>;
  all<T=Record<string,unknown>>(): Promise<RawResult<T>>;
  raw<T=unknown[]>(): Promise<T[]>;
  run<T=Record<string,unknown>>(): Promise<RawResult<T>>;
}

export interface RawDatabase {
  prepare(sql: string): RawStatement;
  batch<T=Record<string,unknown>>(statements: RawStatement[]): Promise<Array<RawResult<T>>>;
  exec(sql: string): Promise<unknown>;
}

let rawRemoteDatabase:RemoteMySqlDatabase|null=null;

export function getRawDatabase(): RawDatabase {
  if(databaseDriver()==="mysql"){
    if(rawRemoteDatabase)return rawRemoteDatabase as unknown as RawDatabase;
    const workerEnv=runtimeEnvironment,endpoint=String(workerEnv.MYSQL_BRIDGE_URL||process.env.MYSQL_BRIDGE_URL||""),secret=String(workerEnv.MYSQL_BRIDGE_SECRET||process.env.MYSQL_BRIDGE_SECRET||"");
    if(!endpoint)throw new Error("MySQL 已启用，但 MYSQL_BRIDGE_URL 尚未配置");
    rawRemoteDatabase=new RemoteMySqlDatabase(endpoint.replace(/\/+$/,""),secret);
    return rawRemoteDatabase as unknown as RawDatabase;
  }
  if(!runtimeEnvironment.DB)throw new Error("SQLite / D1 数据库绑定不可用");
  return runtimeEnvironment.DB as unknown as RawDatabase;
}

export function getDb():AppDatabase {
  if (databaseDriver() === "mysql") {
    if(remoteDatabase)return remoteDatabase;
    remoteDatabase=createDatabase(getRawDatabase());
    return remoteDatabase;
  }
  if (!runtimeEnvironment.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database.");
  return createDatabase(runtimeEnvironment.DB);
}
