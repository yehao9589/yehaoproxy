import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {watchToastHost,promoteToastLayer,dismissToastLayer} from '../lib/toast-top-layer.ts';

function fixture(dialogs=[],focused=null){
  const listeners=new Map(),body={id:'body'};
  const doc={body,activeElement:{closest:()=>focused},querySelectorAll:()=>dialogs.filter(dialog=>dialog.open),addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)};
  const observers=[];
  class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(target,options){this.options=options;}disconnect(){this.disconnected=true;}}
  const seen=[],stop=watchToastHost(host=>seen.push(host.id),doc,Observer);
  return {seen,stop,get observer(){return observers[0];},async toggle(dialog,open){dialog.open=open;listeners.get('beforetoggle')?.({target:dialog,newState:open?'open':'closed'});await Promise.resolve();observers[0].callback();}};
}
const dialog=(id,open=false,modal=true)=>({id,open,isConnected:true,localName:'dialog',matches:()=>modal});

test('提示宿主跟随原生弹窗打开、关闭和移除，不把非模态窗口当成最上层',async()=>{
  const a=dialog('a'),nonModal=dialog('non-modal',true,false),f=fixture([a,nonModal]);
  assert.deepEqual(f.seen,['body']);await f.toggle(a,true);assert.equal(f.seen.at(-1),'a');
  await f.toggle(a,false);assert.equal(f.seen.at(-1),'body');await f.toggle(a,true);
  a.isConnected=false;f.observer.callback();assert.equal(f.seen.at(-1),'body');
  assert.deepEqual(f.observer.options.attributeFilter,['open']);f.stop();const count=f.seen.length;
  await f.toggle(a,true);assert.equal(f.seen.length,count);assert.equal(f.observer.disconnected,true);
});

test('多层弹窗按打开顺序而不是 DOM 顺序选择，初始化尊重当前获得焦点的模态框',async()=>{
  const a=dialog('a'),b=dialog('b'),f=fixture([b,a]);
  await f.toggle(a,true);await f.toggle(b,true);assert.equal(f.seen.at(-1),'b');
  await f.toggle(b,false);assert.equal(f.seen.at(-1),'a');await f.toggle(b,true);
  await f.toggle(a,false);await f.toggle(a,true);assert.equal(f.seen.at(-1),'a');f.stop();
  const initial=fixture([a,b],a);assert.equal(initial.seen.at(-1),'a');initial.stop();
});

test('提示进入独立顶层且不抢焦点，关闭和不支持 popover 的浏览器安全回退',()=>{
  const events=[];let open=false;
  const element={isConnected:true,matches:()=>open,showPopover(){events.push('show');open=true;},hidePopover(){events.push('hide');open=false;},focus(){throw Error('must not steal focus');},removeAttribute(name){events.push('remove:'+name);}};
  assert.equal(promoteToastLayer(element),true);assert.deepEqual(events,['show']);
  assert.equal(promoteToastLayer(element),true);assert.deepEqual(events,['show','hide','show']);
  dismissToastLayer(element);assert.equal(open,false);dismissToastLayer(element);
  const fallback=[];assert.equal(promoteToastLayer({isConnected:true,removeAttribute:name=>fallback.push(name)}),false);assert.deepEqual(fallback,['popover']);
  assert.equal(promoteToastLayer({isConnected:false}),false);
  assert.equal(promoteToastLayer({...element,showPopover(){throw Error('not available');}}),false);
});

test('统一提示保留原有事件、状态与样式，使用手动顶层并在宿主变化时重新提升',async()=>{
  const source=await readFile(new URL('../app/GlobalToastLayer.tsx',import.meta.url),'utf8'),css=await readFile(new URL('../app/global-toast.css',import.meta.url),'utf8');
  assert.match(source,/createPortal\(/);assert.match(source,/popover="manual"/);assert.match(source,/watchToastHost\(setHost\)/);assert.match(source,/promoteToastLayer\(element\)/);assert.match(source,/\[toasts,host\]/);
  assert.match(source,/window.addEventListener\("yehao:toast"/);assert.match(source,/data-global-toast="1"/);assert.match(source,/关闭提示/);
  assert.match(css,/\[popover\]::backdrop\{background:transparent;pointer-events:none\}/);assert.match(css,/min-width:min\(300px,calc\(100% - 32px\)\)/);
});
