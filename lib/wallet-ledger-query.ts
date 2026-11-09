const pageSizes=[10,20,50,100];
const shanghaiOffset=8*60*60*1000;
const day=24*60*60*1000;

export function walletPageSize(value: unknown) {
  const size=Number(value);
  return pageSizes.includes(size)?size:null;
}

function startOfBeijingDay(value:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const time=Date.parse(value+"T00:00:00+08:00");
  return Number.isFinite(time)&&new Date(time+shanghaiOffset).toISOString().slice(0,10)===value?time:null;
}

export function walletLedgerQuery(params:URLSearchParams, defaultSize=20) {
  const requestedPage=Number(params.get("page"));
  const page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
  const size=walletPageSize(params.get("size"))??walletPageSize(defaultSize)??20;
  const from=params.get("from")||"",to=params.get("to")||"";
  const start=from?startOfBeijingDay(from):null,end=to?startOfBeijingDay(to):null;
  if((from&&start===null)||(to&&end===null))throw new Error("请选择有效的开始和结束日期。");
  if(start!==null&&end!==null&&start>end)throw new Error("开始日期不能晚于结束日期。");
  return {page,size,start:start===null?null:new Date(start),endExclusive:end===null?null:new Date(end+day)};
}

export function walletPageBounds(page:number,size:number,total:number) {
  const current=Math.min(page,Math.max(1,Math.ceil(total/size)));
  return {page:current,size,total,offset:(current-1)*size};
}
