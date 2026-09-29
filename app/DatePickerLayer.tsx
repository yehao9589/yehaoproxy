"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";

const pad=(value:number)=>String(value).padStart(2,"0");
const dayValue=(date:Date)=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
const selector='input[type="date"],input[type="datetime-local"],input[type="time"]';

/** Keep the existing form inputs and their React handlers as the source of truth. */
export default function DatePickerLayer(){
  const [target,setTarget]=useState<HTMLInputElement|null>(null);
  const [day,setDay]=useState("");
  const [time,setTime]=useState("00:00");
  const [month,setMonth]=useState(()=>new Date());
  const [position,setPosition]=useState({top:0,left:0});
  const panel=useRef<HTMLDivElement>(null);
  const previous=useRef<HTMLInputElement|null>(null);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const open=(input:HTMLInputElement)=>{
      if(input.disabled||input.readOnly)return;
      const now=new Date(),datePart=input.type==="time"?dayValue(now):input.value.slice(0,10);
      const parsed=datePart?new Date(`${datePart}T12:00:00`):now;
      setDay(datePart||dayValue(now));setTime(input.type==="time"?input.value||"00:00":input.value.slice(11,16)||"00:00");
      setMonth(Number.isNaN(parsed.getTime())?now:parsed);setMessage("");previous.current=input;setTarget(input);
    };
    const click=(event:MouseEvent)=>{
      const input=event.target instanceof Element?event.target.closest<HTMLInputElement>(selector):null;
      if(!input)return;
      event.preventDefault();open(input);
    };
    const key=(event:KeyboardEvent)=>{
      if(event.target instanceof HTMLInputElement&&event.target.matches(selector)&&["Enter"," ","ArrowDown"].includes(event.key)){
        event.preventDefault();open(event.target);
      }
    };
    document.addEventListener("click",click,true);document.addEventListener("keydown",key,true);
    return()=>{document.removeEventListener("click",click,true);document.removeEventListener("keydown",key,true)};
  },[]);
  useEffect(()=>{
    if(!target)return;
    const place=()=>{
      if(!target.isConnected){setTarget(null);return}
      const rect=target.getBoundingClientRect(),height=panel.current?.offsetHeight||380,width=Math.min(304,window.innerWidth-24);
      setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:Math.max(12,rect.bottom+height+8<=window.innerHeight?rect.bottom+8:rect.top-height-8)});
    };
    const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&event.target!==target)setTarget(null)};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setTarget(null);target.focus()}};
    place();panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",escape,true);
    window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
    return()=>{document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",escape,true);window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true)};
  },[target]);
  if(!target)return null;
  const hasDate=target.type!=="time",hasTime=target.type!=="date";
  const commit=(value:string)=>{
    if(value&&((target.min&&value<target.min)||(target.max&&value>target.max))){setMessage("请选择允许范围内的日期和时间");return}
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    setter?.call(target,value);target.dispatchEvent(new Event("input",{bubbles:true}));target.dispatchEvent(new Event("change",{bubbles:true}));
    setTarget(null);previous.current?.focus();
  };
  const start=new Date(month.getFullYear(),month.getMonth(),1),offset=(start.getDay()+6)%7;
  const today=dayValue(new Date());
  const days=Array.from({length:42},(_,index)=>new Date(month.getFullYear(),month.getMonth(),index-offset+1));
  const currentYear=month.getFullYear();
  return createPortal(<div ref={panel} className="yh-date-picker" role="dialog" aria-label={hasTime?"选择日期和时间":"选择日期"} style={position} onClick={event=>event.stopPropagation()}>
    <div className="yh-date-title"><span>{hasDate?"选择日期":"选择时间"}{hasDate&&hasTime&&"与时间"}</span><button type="button" aria-label="关闭日期选择" onClick={()=>{setTarget(null);target.focus()}}>×</button></div>
    {hasDate&&<><div className="yh-date-nav"><button type="button" aria-label="上个月" onClick={()=>setMonth(new Date(currentYear,month.getMonth()-1,1))}>‹</button><div><select aria-label="年份" value={currentYear} onChange={event=>setMonth(new Date(Number(event.target.value),month.getMonth(),1))}>{Array.from({length:101},(_,index)=>currentYear-50+index).map(year=><option key={year} value={year}>{year} 年</option>)}</select><select aria-label="月份" value={month.getMonth()} onChange={event=>setMonth(new Date(currentYear,Number(event.target.value),1))}>{Array.from({length:12},(_,index)=><option key={index} value={index}>{index+1} 月</option>)}</select></div><button type="button" aria-label="下个月" onClick={()=>setMonth(new Date(currentYear,month.getMonth()+1,1))}>›</button></div>
    <div className="yh-date-week">{["一","二","三","四","五","六","日"].map(label=><span key={label}>{label}</span>)}</div>
    <div className="yh-date-grid">{days.map(date=>{const value=dayValue(date),disabled=Boolean(target.min&&value<target.min.slice(0,10)||target.max&&value>target.max.slice(0,10));return <button type="button" key={value} aria-label={value} aria-pressed={day===value} disabled={disabled} className={[date.getMonth()!==month.getMonth()?"outside":"",value===today?"today":"",day===value?"selected":""].join(" ")} onClick={()=>{setDay(value);setMessage("");if(!hasTime)commit(value)}}>{date.getDate()}</button>})}</div></>}
    {hasTime&&<div className="yh-date-time"><span>时间</span><div><select aria-label="小时" value={time.slice(0,2)} onChange={event=>setTime(`${event.target.value}:${time.slice(3,5)}`)}>{Array.from({length:24},(_,index)=><option key={index}>{pad(index)}</option>)}</select><b>:</b><select aria-label="分钟" value={time.slice(3,5)} onChange={event=>setTime(`${time.slice(0,2)}:${event.target.value}`)}>{Array.from({length:60},(_,index)=><option key={index}>{pad(index)}</option>)}</select></div><small>24 小时制</small></div>}
    {message&&<p className="yh-date-error">{message}</p>}
    <div className="yh-date-footer"><button type="button" disabled={target.required} onClick={()=>commit("")}>清空</button><button type="button" onClick={()=>{const now=new Date();setDay(today);setMonth(now);setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);if(!hasTime)commit(today)}}>{hasTime?"此刻":"今天"}</button>{hasTime&&<button type="button" className="confirm" onClick={()=>commit(hasDate?`${day}T${time}`:time)}>确定</button>}</div>
  </div>,document.body);
}
