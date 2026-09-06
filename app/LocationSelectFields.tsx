"use client";
import{useEffect,useLayoutEffect,useMemo,useRef,useState}from"react";
import{createPortal}from"react-dom";
import{countries}from"@/lib/countries";
import{citiesByCountry,normalizeCityName,cityMatchesSearch}from"@/lib/cities";
type Option={value:string;label:string};
function SearchPicker({label,name,value,options,onSelect,placeholder}:{label:string;name:string;value:string;options:Option[];onSelect:(value:string)=>void;placeholder:string}){
 const selected=options.find(x=>x.value===value),display=selected?.label||value,[query,setQuery]=useState(display),[open,setOpen]=useState(false),[searching,setSearching]=useState(false);useEffect(()=>setQuery(display),[display]);
 const keyword=searching?query.trim().toLocaleLowerCase("zh-CN"):"",filtered=keyword?options.filter(x=>x.label.toLocaleLowerCase("zh-CN").includes(keyword)||x.value.toLowerCase().includes(keyword)||(name==="city"&&cityMatchesSearch(x.value,keyword))):options;
 const anchor=useRef<HTMLDivElement>(null),[position,setPosition]=useState<{left:number;top:number|"auto";bottom:number|"auto";width:number;maxHeight:number}|null>(null);
 useLayoutEffect(()=>{
  if(!open)return;
  function place(){
   const rect=anchor.current?.getBoundingClientRect();if(!rect)return;
   const height=window.innerHeight,width=window.innerWidth,below=height-rect.bottom-14,above=rect.top-14,up=below<280&&above>below;
   setPosition({left:Math.max(8,Math.min(rect.left,width-rect.width-8)),width:Math.min(rect.width,width-16),maxHeight:Math.max(0,Math.min(280,up?above:below)),top:up?"auto":rect.bottom+6,bottom:up?height-rect.top+6:"auto"});
  }
  place();window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
  return()=>{window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true)};
 },[open]);
 return <label className="country-picker location-picker">{label}<input type="hidden" name={name} value={value}/><div ref={anchor} className={`country-combobox ${open?"open":""}`}><span className="country-search-icon">⌕</span><input role="combobox" aria-expanded={open} aria-autocomplete="list" value={query} placeholder={placeholder} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setOpen(false);setQuery(display)}}} onFocus={e=>{setOpen(true);setSearching(false);setQuery(display);e.currentTarget.select()}} onClick={e=>{if(!open){setOpen(true);setSearching(false);setQuery(display);e.currentTarget.select()}}} onChange={e=>{setQuery(e.target.value);setSearching(true);setOpen(true)}} onBlur={()=>{setOpen(false);setSearching(false);setQuery(display)}}/><button type="button" className="country-arrow" aria-label={`展开${label}列表`} onMouseDown={e=>e.preventDefault()} onClick={()=>{setQuery(display);setSearching(false);setOpen(!open)}}><span/></button>{open&&position&&createPortal(<div className="location-picker" onClick={e=>e.stopPropagation()} onMouseDown={e=>{e.preventDefault();e.stopPropagation()}}><div className="country-options" role="listbox" aria-label={label} style={{...position,position:"fixed",right:"auto",zIndex:100000,boxSizing:"border-box",overflowY:"auto",overscrollBehavior:"contain"}}><small>{filtered.length?`找到 ${filtered.length} 个选项`:"没有匹配的选项"}</small>{filtered.map(x=><button type="button" role="option" aria-selected={x.value===value} key={x.value} onClick={()=>{onSelect(x.value);setQuery(x.label);setOpen(false)}}><b>{x.label}</b></button>)}</div></div>,document.body)}</div></label>
}
export default function LocationSelectFields({initialCountry="US",initialCity="",allowEmpty=false,optional=false,onChange}:{initialCountry?:string;initialCity?:string;allowEmpty?:boolean;optional?:boolean;onChange?:(country:string,city:string)=>void}){
 const normalized=/^[A-Z]{2}$/i.test(initialCountry)?initialCountry.toUpperCase():allowEmpty?"":"US",initial=normalizeCityName(initialCity),[country,setCountry]=useState(normalized),[city,setCity]=useState(initial);
 useEffect(()=>{setCountry(normalized);setCity(normalizeCityName(initialCity))},[normalized,initialCity]);
 const countryOptions=useMemo(()=>[...(allowEmpty?[{value:"",label:"保持原国家 / 地区"}]:[]),...countries.map(x=>({value:x.code,label:`${x.flag} ${x.name}（${x.code}）`}))],[allowEmpty]),cityOptions=useMemo(()=>{const result=country?[...(citiesByCountry[country]||[{value:"其他城市",label:"其他城市"}])]:[{value:"",label:"保持原城市"}];if(city&&!result.some(x=>x.value===city))result.unshift({value:city,label:`${city}（当前城市）`});return result},[country,city]);
 function changeCountry(value:string){const options=value?(citiesByCountry[value]||[{value:"其他城市",label:"其他城市"}]):[{value:"",label:"保持原城市"}],nextCity=options[0].value;setCountry(value);setCity(nextCity);onChange?.(value,nextCity)}
 function changeCity(value:string){setCity(value);onChange?.(country,value)}
 return <><SearchPicker label={`国家 / 地区${optional?"（可选）":""}`} name="country" value={country} options={countryOptions} onSelect={changeCountry} placeholder="输入中文国家名称或代码"/><SearchPicker label={`城市${optional?"（可选）":""}`} name="city" value={city} options={cityOptions} onSelect={changeCity} placeholder="输入中文、拼音、首字母或英文"/></>
}
