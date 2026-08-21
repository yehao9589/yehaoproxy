"use client";
import{useEffect,useMemo,useState}from"react";
import{countries}from"@/lib/countries";
import{citiesByCountry,normalizeCityName}from"@/lib/cities";
type Option={value:string;label:string};
function SearchPicker({label,name,value,options,onSelect,placeholder}:{label:string;name:string;value:string;options:Option[];onSelect:(value:string)=>void;placeholder:string}){
 const selected=options.find(x=>x.value===value),display=selected?.label||value,[query,setQuery]=useState(display),[open,setOpen]=useState(false);useEffect(()=>setQuery(display),[display]);
 const keyword=query.trim().toLocaleLowerCase("zh-CN"),filtered=keyword?options.filter(x=>x.label.toLocaleLowerCase("zh-CN").includes(keyword)||x.value.toLowerCase().includes(keyword)):options;
 return <label className="country-picker location-picker">{label}<input type="hidden" name={name} value={value}/><div className={`country-combobox ${open?"open":""}`}><span className="country-search-icon">⌕</span><input role="combobox" aria-expanded={open} aria-autocomplete="list" value={query} placeholder={placeholder} onFocus={()=>{setOpen(true);setQuery("")}} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onBlur={()=>window.setTimeout(()=>{setOpen(false);setQuery(display)},150)}/><button type="button" className="country-arrow" aria-label={`展开${label}列表`} onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(x=>{if(!x)setQuery("");return !x})}><span/></button>{open&&<div className="country-options" role="listbox"><small>{filtered.length?`找到 ${filtered.length} 个选项`:"没有匹配的选项"}</small>{filtered.slice(0,80).map(x=><button type="button" role="option" aria-selected={x.value===value} key={x.value} onMouseDown={e=>e.preventDefault()} onClick={()=>{onSelect(x.value);setQuery(x.label);setOpen(false)}}><b>{x.label}</b></button>)}</div>}</div></label>
}
export default function LocationSelectFields({initialCountry="US",initialCity="",allowEmpty=false,optional=false,onChange}:{initialCountry?:string;initialCity?:string;allowEmpty?:boolean;optional?:boolean;onChange?:(country:string,city:string)=>void}){
 const normalized=/^[A-Z]{2}$/i.test(initialCountry)?initialCountry.toUpperCase():allowEmpty?"":"US",initial=normalizeCityName(initialCity),[country,setCountry]=useState(normalized),[city,setCity]=useState(initial);
 useEffect(()=>{setCountry(normalized);setCity(normalizeCityName(initialCity))},[normalized,initialCity]);
 const countryOptions=useMemo(()=>[...(allowEmpty?[{value:"",label:"保持原国家 / 地区"}]:[]),...countries.map(x=>({value:x.code,label:`${x.flag} ${x.name}（${x.code}）`}))],[allowEmpty]),cityOptions=useMemo(()=>{const result=country?[...(citiesByCountry[country]||[{value:"其他城市",label:"其他城市"}])]:[{value:"",label:"保持原城市"}];if(city&&!result.some(x=>x.value===city))result.unshift({value:city,label:`${city}（当前城市）`});return result},[country,city]);
 function changeCountry(value:string){const options=value?(citiesByCountry[value]||[{value:"其他城市",label:"其他城市"}]):[{value:"",label:"保持原城市"}],nextCity=options[0].value;setCountry(value);setCity(nextCity);onChange?.(value,nextCity)}
 function changeCity(value:string){setCity(value);onChange?.(country,value)}
 return <><SearchPicker label={`国家 / 地区${optional?"（可选）":""}`} name="country" value={country} options={countryOptions} onSelect={changeCountry} placeholder="输入中文国家名称或代码"/><SearchPicker label={`城市${optional?"（可选）":""}`} name="city" value={city} options={cityOptions} onSelect={changeCity} placeholder="输入中文城市名称搜索"/></>
}
