import http from "node:http";
import mysql from "mysql2/promise";

const port=Number(process.env.PORT||8789),secret=process.env.MYSQL_BRIDGE_SECRET||"";
if(!secret){console.error("MYSQL_BRIDGE_SECRET 未配置，数据库桥接服务拒绝启动");process.exit(1)}
let pool;
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify(data))}
function config(input={},withDatabase=true){
  const url=input.url||process.env.DATABASE_URL;
  if(url)return{uri:url,multipleStatements:true,connectionLimit:12};
  return{host:input.host||"mysql",port:Number(input.port||3306),user:input.user,password:input.password,...(withDatabase?{database:input.database}:{}),charset:"utf8mb4",multipleStatements:true};
}
async function body(req){let value="";for await(const chunk of req){value+=chunk;if(value.length>2_000_000)throw new Error("请求过大")}return value?JSON.parse(value):{}}
function compatibleSql(sql){return String(sql).replace(/\bmax\(\s*0\s*,/gi,"GREATEST(0,")}
function normalizeValue(value){
  if(Buffer.isBuffer(value))return value.toString("utf8");
  if(ArrayBuffer.isView(value))return Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString("utf8");
  if(value&&typeof value==="object"&&value.type==="Buffer"&&Array.isArray(value.data))return Buffer.from(value.data).toString("utf8");
  if(value&&typeof value==="object"){
    const numeric=Object.entries(value).filter(([key,item])=>/^\d+$/.test(key)&&Number.isFinite(Number(item))).sort((a,b)=>Number(a[0])-Number(b[0]));
    if(numeric.length)return Buffer.from(numeric.map(([,item])=>Number(item))).toString("utf8");
  }
  return value;
}
function normalizeRow(row){return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,normalizeValue(value)]))}
function normalized(rows){
  if(Array.isArray(rows))return{rows:rows.map(normalizeRow),meta:{changes:0}};
  return{rows:[],meta:{changes:Number(rows?.affectedRows||0),last_row_id:Number(rows?.insertId||0)}};
}
async function query(sql,params=[],input={}){
  const selectedPool=input.host?mysql.createPool(config(input)):pool??=mysql.createPool(config());
  const connection=await selectedPool.getConnection();
  try{await connection.query("SET SESSION sql_mode='ANSI_QUOTES'");const[rows]=await connection.query(compatibleSql(sql),params);return normalized(rows)}
  finally{connection.release();if(input.host)await selectedPool.end()}
}
async function batch(statements=[]){
  if(!Array.isArray(statements)||!statements.length)throw new Error("事务语句不能为空");
  if(statements.length>1000)throw new Error("单次事务语句过多");
  const selectedPool=pool??=mysql.createPool(config());
  const connection=await selectedPool.getConnection();
  try{
    await connection.query("SET SESSION sql_mode='ANSI_QUOTES'");
    await connection.beginTransaction();
    const results=[];
    for(const statement of statements){
      if(!statement||typeof statement.sql!=="string"||!Array.isArray(statement.params))throw new Error("事务语句格式无效");
      const[rows]=await connection.query(compatibleSql(statement.sql),statement.params);
      results.push(normalized(rows));
    }
    await connection.commit();
    return results;
  }catch(error){await connection.rollback();throw error}
  finally{connection.release()}
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
    if(req.url==="/batch"){const results=await batch(input.statements);return json(res,200,{results})}
    return json(res,404,{error:"not found"});
  }catch(error){return json(res,500,{error:error instanceof Error?error.message:"unknown error"})}
}).listen(port,"0.0.0.0",()=>console.log(`mysql bridge listening on ${port}`));
