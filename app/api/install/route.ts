import {env} from "cloudflare:workers";
import {eq} from "drizzle-orm";
import {NextResponse} from "next/server";
import {databaseDriver,getDb} from "../../../db";
import {customers,systemOptions} from "../../../db/schema";
import {hashPassword} from "../../../lib/auth";
import {installationStatus} from "../../../lib/installation";
import {installMysqlSchema,installSchema} from "../../../lib/install-schema";
import {defaultSiteConfig} from "../../../lib/site-config";

const clean=(value:unknown,max:number)=>String(value??"").trim().slice(0,max);
const validDatabaseName=(value:string)=>/^[a-zA-Z0-9_]{1,64}$/.test(value);
function bridgeConfig(body:any){return{host:clean(body.mysqlHost,255)||"mysql",port:Number(body.mysqlPort||3306),user:clean(body.mysqlUser,128),password:String(body.mysqlPassword||""),database:clean(body.mysqlDatabase,64),ssl:Boolean(body.mysqlSsl)}}
const runtimeValue=(key:string)=>String((env as unknown as Record<string,unknown>)[key]||process.env[key]||"");
async function bridge(path:string,payload:Record<string,unknown>){const endpoint=(runtimeValue("MYSQL_BRIDGE_URL")||"http://mysql-bridge:8789").replace(/\/+$/,"");const secret=runtimeValue("MYSQL_BRIDGE_SECRET");const response=await fetch(`${endpoint}${path}`,{method:"POST",headers:{"content-type":"application/json",...(secret?{authorization:`Bearer ${secret}`}:{})},body:JSON.stringify(payload)});const result=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(result.error||"MySQL 数据桥接服务请求失败");return result}
async function configureRuntime(config?:ReturnType<typeof bridgeConfig>){const webhook=runtimeValue("UPDATE_WEBHOOK_URL");if(!webhook)throw new Error("更新执行器未连接，无法保存 MySQL 运行配置");const token=runtimeValue("UPDATE_WEBHOOK_TOKEN"),bridgeUrl=runtimeValue("MYSQL_BRIDGE_URL")||"http://mysql-bridge:8789",bridgeSecret=runtimeValue("MYSQL_BRIDGE_SECRET"),databaseUrl=config?`mysql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(config.database)}`:undefined;const response=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({action:"configure-database",driver:"mysql",bridgeUrl,bridgeSecret,databaseUrl})});if(!response.ok){const result=await response.json().catch(()=>({})) as any;throw new Error(result.error||"数据库运行配置保存失败")}}
async function upsertOption(key:string,value:string,now:Date){const db=getDb(),[row]=await db.select({key:systemOptions.key}).from(systemOptions).where(eq(systemOptions.key,key)).limit(1);if(row)await db.update(systemOptions).set({value,updatedAt:now}).where(eq(systemOptions.key,key));else await db.insert(systemOptions).values({key,value,updatedAt:now})}

export async function GET(){const status=await installationStatus();return NextResponse.json({...status,runtime:databaseDriver(),databaseBinding:databaseDriver()==="mysql"?Boolean((env as unknown as Record<string,unknown>).DATABASE_URL||process.env.DATABASE_URL):Boolean((env as unknown as {DB?:D1Database}).DB),mysqlSupported:true})}
export async function POST(request:Request){
 const before=await installationStatus(),body=await request.json().catch(()=>null);if(!body)return NextResponse.json({error:"安装参数无效"},{status:400});if(before.installed&&body.action!=="test-mysql"&&!body.preview)return NextResponse.json({error:"系统已经完成安装，安装入口已锁定"},{status:409});
 const databaseType=body.databaseType==="mysql"?"mysql":"sqlite",mode=body.databaseMode==="existing"?"existing":"new",email=clean(body.email,120).toLowerCase(),name=clean(body.name,40)||"超级管理员",password=String(body.password||""),confirmPassword=String(body.confirmPassword||""),siteName=clean(body.siteName,40)||defaultSiteConfig.siteName;
 if(body.action==="test-mysql"){
  const database=clean(body.mysqlDatabase,64);if(!validDatabaseName(database))return NextResponse.json({error:"MySQL 数据库名称只能包含字母、数字和下划线"},{status:400});
  try{const result=await bridge("/test",bridgeConfig(body));return NextResponse.json({ok:true,message:"MySQL 连接成功",version:result.version})}catch(error){return NextResponse.json({error:`MySQL 连接失败：${error instanceof Error?error.message:"未知错误"}`},{status:502})}
 }
 if(before.installed)return NextResponse.json({error:"当前为只读预览模式，不会修改已有系统"},{status:409});
 if(!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:"请输入有效的管理员邮箱"},{status:400});
 if(password.length<10||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return NextResponse.json({error:"管理员密码至少 10 位，并同时包含字母和数字"},{status:400});
 if(password!==confirmPassword)return NextResponse.json({error:"两次输入的管理员密码不一致"},{status:400});
 try{
  const now=new Date(),passwordHash=await hashPassword(password),siteConfig=JSON.stringify({...defaultSiteConfig,siteName,companyName:siteName,supportEmail:email,copyright:`© ${new Date().getFullYear()} ${siteName}. All rights reserved.`}),security=JSON.stringify({installed:true,registrationEnabled:Boolean(body.registrationEnabled)}),installation=JSON.stringify({installedAt:now.toISOString(),databaseMode:mode,runtime:databaseType,version:1});
  if(databaseType==="mysql"){
   const database=clean(body.mysqlDatabase,64);if(!validDatabaseName(database))throw new Error("MySQL 数据库名称无效");const config=bridgeConfig(body);await bridge("/initialize",{...config,create:mode==="new",schema:mode==="new"?installMysqlSchema:""});const timestamp=Math.floor(now.getTime()/1000);await bridge("/query",{...config,sql:"INSERT INTO customers (id,email,name,password_hash,email_verified,role,status,created_at) VALUES (?,?,?,?,1,'admin','active',?)",params:["admin",email,name,passwordHash,timestamp]});for(const[key,value]of [["site_config",siteConfig],["installation",installation],["security_settings",security]])await bridge("/query",{...config,sql:"INSERT INTO system_options (`key`,`value`,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`),updated_at=VALUES(updated_at)",params:[key,value,timestamp]});await configureRuntime();return NextResponse.json({ok:true,restarting:true,message:"MySQL 初始化完成，应用正在切换数据库并重启"},{status:201});
  }
  const d1=(env as unknown as {DB?:D1Database}).DB;if(!d1)throw new Error("SQLite/D1 数据库绑定不可用");if(mode==="new")await d1.exec(installSchema);else await d1.prepare("SELECT 1 FROM customers LIMIT 1").first();const db=getDb();await db.insert(customers).values({id:"admin",email,name,passwordHash,emailVerified:true,role:"admin",status:"active",createdAt:now});await upsertOption("site_config",siteConfig,now);await upsertOption("installation",installation,now);await upsertOption("security_settings",security,now);return NextResponse.json({ok:true,message:"SQLite 初始化完成，请使用管理员邮箱登录"},{status:201});
 }catch(error){return NextResponse.json({error:`初始化失败：${error instanceof Error?error.message:"未知错误"}`},{status:500})}
}
