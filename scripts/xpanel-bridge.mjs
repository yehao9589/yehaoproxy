import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {timingSafeEqual,createHash} from 'node:crypto';
import {VpsOperations,OperationError} from './vps/operations.mjs';

function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
async function readBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>65536)throw new OperationError(413,'请求内容过大');chunks.push(chunk);}
  try{const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!input||typeof input!=='object'||Array.isArray(input))throw new Error();return input;}
  catch{throw new OperationError(400,'请求 JSON 无效');}
}

export function createXPanelBridge(options={}){
  const secret=String(options.secret??process.env.XPANEL_BRIDGE_SECRET??'');
  const operations=new VpsOperations({...options,timeout:options.timeout??Number(process.env.XPANEL_BRIDGE_TIMEOUT_MS||45000)});
  const server=createServer(async(req,res)=>{
    try{
      if(req.url==='/health')return json(res,200,{ok:true,vpsOperations:true});
      const supplied=Buffer.from(String(req.headers['x-bridge-secret']||'')),expected=Buffer.from(secret);
      if(!expected.length||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return json(res,401,{error:'连接服务认证失败'});
      const url=new URL(req.url,'http://localhost'),route=url.pathname;
      const head=req.method==='HEAD'&&route==='/operations/download';
      if(req.method!=='POST'&&!head)return json(res,405,{error:'请求方法不支持'});
      const input=head?{backupId:url.searchParams.get('backupId'),kind:url.searchParams.get('kind')||'db'}:await readBody(req);
      if(route==='/inbounds'){
        const connection={...input,id:input.id||`legacy-${createHash('sha256').update(String(input.baseUrl)+String(input.username)).digest('hex').slice(0,24)}`};
        const rows=await operations.client(connection).json('panel/api/inbounds/list');
        if(!Array.isArray(rows))throw new OperationError(502,'面板没有返回入站列表');
        return json(res,200,{ok:true,rows});
      }
      if(route==='/operations/state')return json(res,200,operations.snapshot());
      if(route==='/operations/check')return json(res,202,operations.check(input.server,{trigger:input.trigger==='schedule'?'schedule':'manual',record:input.record!==false}));
      if(route==='/operations/backup')return json(res,202,operations.backup(input.server,{retain:input.retain,trigger:input.trigger,dueToken:input.dueToken}));
      if(route==='/operations/delete-backup')return json(res,200,operations.remove(String(input.backupId||'')));
      if(route==='/operations/download'){
        const file=operations.download(String(input.backupId||''),input.kind||'db');
        res.writeHead(200,{'content-type':file.contentType,'content-length':file.bytes,'content-disposition':file.contentDisposition,'cache-control':'no-store','x-content-type-options':'nosniff'});
        if(head)return res.end();
        const stream=fs.createReadStream(file.filename);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
      }
      return json(res,404,{error:'接口不存在'});
    }catch(error){if(res.headersSent)return res.destroy();return json(res,error.status||502,{error:error.status?error.message:'X-Panel 操作失败，请检查网络、面板配置和备份目录权限'});}
  });
  server.requestTimeout=60000;server.headersTimeout=15000;
  return {server,operations,listen(port=Number(process.env.PORT||8787),host=process.env.HOST||'0.0.0.0'){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve(server.address());});});},async close(){await operations.idle();if(!server.listening)return;await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const bridge=createXPanelBridge();
  const address=await bridge.listen();
  console.log(`X-Panel bridge listening on ${address.port}; VPS backups enabled`);
  const shutdown=()=>bridge.close().then(()=>process.exit(0));
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
