import {createServer} from "node:http";
import {timingSafeEqual} from "node:crypto";

const port=Number(process.env.PORT||8787);
const secret=String(process.env.XPANEL_BRIDGE_SECRET||"");
const timeoutMs=Number(process.env.XPANEL_BRIDGE_TIMEOUT_MS||15000);

function json(res,status,data){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
  res.end(JSON.stringify(data));
}

function authorized(req){
  const supplied=String(req.headers["x-bridge-secret"]||"");
  if(!secret||supplied.length!==secret.length)return false;
  return timingSafeEqual(Buffer.from(supplied),Buffer.from(secret));
}

async function readBody(req){
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>65536)throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}

function cleanBaseUrl(value){
  const url=new URL(String(value||"").trim().replace(/\/+$/,"").replace(/\/panel$/i,""));
  if(url.protocol!=="https:")throw new Error("X-Panel 地址必须使用 HTTPS");
  if(url.username||url.password)throw new Error("X-Panel 地址不能包含账号密码");
  return url.toString().replace(/\/+$/,"");
}

async function loadInbounds(input){
  const baseUrl=cleanBaseUrl(input.baseUrl);
  const loginBody=new URLSearchParams({username:String(input.username||""),password:String(input.password||"")});
  const login=await fetch(`${baseUrl}/login`,{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:loginBody,
    redirect:"manual",
    signal:AbortSignal.timeout(timeoutMs),
  });
  const loginText=await login.text();
  let loginData=null;
  try{loginData=JSON.parse(loginText)}catch{}
  const cookies=typeof login.headers.getSetCookie==="function"?login.headers.getSetCookie():[login.headers.get("set-cookie")||""];
  const cookie=cookies.filter(Boolean).map(value=>value.split(";")[0]).join("; ");
  if(!login.ok||loginData?.success===false||!cookie)throw new Error(loginData?.msg||`X-Panel 登录失败（${login.status}）`);
  const response=await fetch(`${baseUrl}/panel/api/inbounds/list`,{
    headers:{cookie},
    signal:AbortSignal.timeout(timeoutMs),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.success===false||!Array.isArray(data?.obj))throw new Error(data?.msg||`X-Panel 接口异常（${response.status}）`);
  return data.obj;
}

createServer(async(req,res)=>{
  if(req.url==="/health")return json(res,200,{ok:true});
  if(req.method!=="POST"||req.url!=="/inbounds")return json(res,404,{error:"接口不存在"});
  if(!authorized(req))return json(res,401,{error:"连接服务认证失败"});
  try{
    const rows=await loadInbounds(await readBody(req));
    return json(res,200,{ok:true,rows});
  }catch(error){
    const message=error instanceof Error?error.message:"X-Panel 连接失败";
    return json(res,502,{error:message});
  }
}).listen(port,"0.0.0.0",()=>console.log(`X-Panel bridge listening on ${port}`));
