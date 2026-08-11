import { env } from "cloudflare:workers";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema";

let remoteDatabase: ReturnType<typeof drizzleD1> | null = null;

export function databaseDriver() {
  const workerEnv = env as unknown as Record<string, unknown>;
  return String(workerEnv.DATABASE_DRIVER || process.env.DATABASE_DRIVER || "sqlite").toLowerCase() === "mysql" ? "mysql" : "sqlite";
}

class RemoteStatement {
  private params: unknown[] = [];
  constructor(private sql: string, private endpoint: string, private secret: string) {}
  bind(...params: unknown[]) { this.params=params; return this; }
  private async execute(){
    const response=await fetch(`${this.endpoint}/query`,{method:"POST",headers:{"content-type":"application/json",...(this.secret?{authorization:`Bearer ${this.secret}`}:{})},body:JSON.stringify({sql:this.sql,params:this.params})});
    const result=await response.json() as {rows?:Record<string,unknown>[];meta?:Record<string,unknown>;error?:string};
    if(!response.ok)throw new Error(result.error||"MySQL 查询失败");
    return result;
  }
  async all(){const result=await this.execute();return{results:result.rows||[],success:true,meta:result.meta||{}}}
  async raw(){const result=await this.execute();return(result.rows||[]).map(row=>Object.values(row))}
  async first(){const result=await this.execute();return result.rows?.[0]||null}
  async run(){const result=await this.execute();return{success:true,meta:result.meta||{},results:result.rows||[]}}
}

class RemoteMySqlDatabase {
  constructor(private endpoint:string,private secret:string){}
  prepare(sql:string){return new RemoteStatement(sql,this.endpoint,this.secret)}
  async batch(statements:any[]){return Promise.all(statements.map(statement=>statement.all()))}
  async exec(sql:string){return new RemoteStatement(sql,this.endpoint,this.secret).run()}
}

export function getDb() {
  if (databaseDriver() === "mysql") {
    if(remoteDatabase)return remoteDatabase as any;
    const workerEnv=env as unknown as Record<string,unknown>,endpoint=String(workerEnv.MYSQL_BRIDGE_URL||process.env.MYSQL_BRIDGE_URL||""),secret=String(workerEnv.MYSQL_BRIDGE_SECRET||process.env.MYSQL_BRIDGE_SECRET||"");
    if(!endpoint)throw new Error("MySQL 已启用，但 MYSQL_BRIDGE_URL 尚未配置");
    remoteDatabase=drizzleD1(new RemoteMySqlDatabase(endpoint.replace(/\/+$/, ""),secret) as any,{schema});
    return remoteDatabase as any;
  }
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database.");
  return drizzleD1(env.DB, { schema }) as any;
}
