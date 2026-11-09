/** Keep feedback inside the active modal so it is not inert, then promote it
 * above the modal's surface without changing focus or closing other popovers. */
export function watchToastHost(onHost:(host:HTMLElement)=>void,doc:Document=document,Observer:typeof MutationObserver=MutationObserver){
  let stack:HTMLDialogElement[]=[],host:HTMLElement|null=null,disposed=false;
  const isModal=(dialog:HTMLDialogElement)=>{
    if(!dialog.isConnected||!dialog.open)return false;
    try{return dialog.matches(":modal");}catch{return true;}
  };
  const sync=()=>{
    if(disposed)return;
    const current=Array.from(doc.querySelectorAll<HTMLDialogElement>("dialog[open]")).filter(isModal);
    stack=[...stack.filter(dialog=>current.includes(dialog)),...current.filter(dialog=>!stack.includes(dialog))];
    const next=stack.at(-1)||doc.body;
    if(next!==host){host=next;onHost(next);}
  };
  const toggle=(event:Event)=>{
    const dialog=event.target as HTMLDialogElement|null;
    if(dialog?.localName!=="dialog")return;
    const state=(event as ToggleEvent).newState;
    if(state!=="open"&&state!=="closed")return;
    stack=stack.filter(item=>item!==dialog);
    if(state==="open")stack.push(dialog);
    queueMicrotask(sync);
  };
  // Focus identifies the active modal if feedback mounts after it was opened.
  const focused=doc.activeElement?.closest<HTMLDialogElement>("dialog[open]");
  stack=Array.from(doc.querySelectorAll<HTMLDialogElement>("dialog[open]")).filter(isModal);
  if(focused&&isModal(focused)){stack=stack.filter(dialog=>dialog!==focused);stack.push(focused);}
  sync();
  const observer=new Observer(sync);
  observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]});
  doc.addEventListener("beforetoggle",toggle,true);
  return()=>{disposed=true;observer.disconnect();doc.removeEventListener("beforetoggle",toggle,true);};
}

export function dismissToastLayer(element:HTMLElement){
  try{if(element.matches(":popover-open"))element.hidePopover();}catch{/* Unsupported browser or already detached. */}
}
export function promoteToastLayer(element:HTMLElement){
  if(!element.isConnected)return false;
  if(typeof element.showPopover!=="function"){element.removeAttribute("popover");return false;}
  try{dismissToastLayer(element);element.showPopover();return true;}
  catch{element.removeAttribute("popover");return false;}
}
