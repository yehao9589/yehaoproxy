export type ParsedProxyAddress = { host:string; port:string; username:string; password:string; protocol?:"HTTP"|"HTTPS"|"SOCKS5" };

function decode(value:string){try{return decodeURIComponent(value)}catch{return value}}

export function parseProxyAddress(raw:string):ParsedProxyAddress|null{
  const value=raw.trim().split(/\r?\n/).find(Boolean)?.trim()||"";
  if(!value)return null;
  const scheme=value.match(/^(https?|socks5):\/\/(.+)$/i);
  const protocol=scheme?(scheme[1].toLowerCase()==="socks5"?"SOCKS5":scheme[1].toUpperCase()) as ParsedProxyAddress["protocol"]:undefined;
  const content=scheme?scheme[2]:value;
  let match=content.match(/^([^:@\s]+):([^@\s]*)@([^:\s]+):(\d{1,5})$/);
  if(match)return{host:match[3],port:match[4],username:decode(match[1]),password:decode(match[2]),protocol};
  match=content.match(/^([^:\s]+):(\d{1,5})@([^:@\s]+):([^\s]*)$/);
  if(match)return{host:match[1],port:match[2],username:decode(match[3]),password:decode(match[4]),protocol};
  match=content.match(/^([^:\s]+):(\d{1,5}):([^:\s]+):(.*)$/);
  if(match)return{host:match[1],port:match[2],username:match[3],password:match[4],protocol};
  match=content.match(/^([^:\s]+):(\d{1,5})$/);
  return match?{host:match[1],port:match[2],username:"",password:"",protocol}:null;
}

export function applyParsedProxy(form:HTMLFormElement,parsed:ParsedProxyAddress){
  const set=(name:string,value:string)=>{const field=form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement|null;if(!field)return;field.value=value;field.dispatchEvent(new Event("input",{bubbles:true}));field.dispatchEvent(new Event("change",{bubbles:true}))};
  set("host",parsed.host);set("port",parsed.port);set("username",parsed.username);set("password",parsed.password);if(parsed.protocol)set("protocol",parsed.protocol);
}
