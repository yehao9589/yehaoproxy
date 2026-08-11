export function displayCustomerId(value:string|null|undefined){
  const id=String(value||"").trim();
  if(!id)return "—";
  const legacy=id.match(/^local-user-0*(\d+)$/i)||id.match(/^user-?0*(\d+)$/i);
  if(legacy)return `user-${Number(legacy[1])}`;
  return id.replace(/^local-user-?/i,"user-").replace(/^local-/i,"");
}
