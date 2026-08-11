import http from "node:http";
import mysql from "mysql2/promise";

const port=Number(process.env.PORT||8789),secret=process.env.MYSQL_BRIDGE_SECRET||"";
let pool;
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify(data))}
function config(input={},withDatabase=true){
  const url=input.url||process.env.DATABASE_URL;
  if(url)return{uri:url,multipleStatements:true,connectionLimit:12};
  return{host:input.host||"mysql",port:Number(input.port||3306),user:input.user,password:input.password,...(withDatabase?{database:input.database}:{}),charset:"utf8mb4",multipleStatements:true};
}
async function body(req){let value="";for await(const chunk of req){value+=chunk;if(value.length>2_000_000)throw new Error("请求过大")}return value?JSON.parse(value):{}}
async function query(sql,params=[],input={}){
  const selectedPool=input.host?mysql.createPool(config(input)):pool??=mysql.createPool(config());
  const connection=await selectedPool.getConnection();
  try{await connection.query("SET SESSION sql_mode='ANSI_QUOTES'");const[rows,result]=await connection.query(sql,params);return{rows:Array.isArray(rows)?rows:[],meta:Array.isArray(rows)?{}:rows,result}}
  finally{connection.release();if(input.host)await selectedPool.end()}
}
http.createServer(async(req,res)=>{
  if(req.url==="/health")return json(res,200,{ok:true});
  if(secret&&req.headers.authorization!==`Bearer ${secret}`)return json(res,401,{error:"unauthorized"});
  try{
    const input=await body(req);
    if(req.url==="/test"){
      const connection=await mysql.createConnection(config(input,false));const[rows]=await connection.query("SELECT VERSION() AS version");await connection.end();return json(res,200,{ok:true,version:rows[0]?.version||""});
    }
    if(req.url==="/initialize"){
      const name=String(input.database||"");if(!/^[A-Za-z0-9_]{1,64}$/.test(name))throw new Error("数据库名称无效");
      const server=await mysql.createConnection(config(input,false));if(input.create)await server.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await server.end();
      const connection=await mysql.createConnection(config(input,true));if(input.schema)await connection.query(String(input.schema));await connection.end();return json(res,200,{ok:true});
    }
    if(req.url==="/query"){const result=await query(String(input.sql||""),Array.isArray(input.params)?input.params:[],input);return json(res,200,result)}
    return json(res,404,{error:"not found"});
  }catch(error){return json(res,500,{error:error instanceof Error?error.message:"unknown error"})}
}).listen(port,"0.0.0.0",()=>console.log(`mysql bridge listening on ${port}`));
