// Confirmation is requested by the server before any binding write takes place.
export async function saveWithBindingConfirmation(url:string,body:Record<string,unknown>):Promise<boolean>{
 let pending=body;
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pending)}),result=await response.json();
  if(response.status===409&&typeof result.confirmation==="string"){
   if(!window.confirm(result.error))return false;
   pending={...body,confirmation:result.confirmation};continue;
  }
  if(!response.ok)throw new Error(result.error||"保存失败");
  return true;
 }
 throw new Error("绑定已被其他管理员修改，请刷新后重新选择");
}
