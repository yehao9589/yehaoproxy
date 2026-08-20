export async function copyText(value:string):Promise<void>{
  if(typeof navigator!=="undefined"&&navigator.clipboard&&window.isSecureContext){
    try{await navigator.clipboard.writeText(value);return}catch{}
  }
  if(typeof document==="undefined")throw new Error("当前环境不支持复制");
  const textarea=document.createElement("textarea");
  textarea.value=value;
  textarea.readOnly=true;
  textarea.setAttribute("aria-hidden","true");
  Object.assign(textarea.style,{position:"fixed",left:"-9999px",top:"0",opacity:"0",pointerEvents:"none"});
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0,textarea.value.length);
  const copied=document.execCommand("copy");
  textarea.remove();
  if(!copied)throw new Error("浏览器拒绝复制");
}
