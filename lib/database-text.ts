export function databaseText(value:unknown):string{
  if(typeof value==="string")return value;
  if(value==null)return "";
  if(Array.isArray(value))return new TextDecoder().decode(Uint8Array.from(value.map(Number)));
  if(typeof value==="object"){
    const record=value as Record<string,unknown>;
    if(Array.isArray(record.data))return new TextDecoder().decode(Uint8Array.from(record.data.map(Number)));
    const numeric=Object.entries(record).filter(([key,item])=>/^\d+$/.test(key)&&Number.isFinite(Number(item))).sort((a,b)=>Number(a[0])-Number(b[0]));
    if(numeric.length)return new TextDecoder().decode(Uint8Array.from(numeric.map(([,item])=>Number(item))));
  }
  return String(value);
}
