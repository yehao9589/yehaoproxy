"use client";
import {useEffect} from "react";
const tabIndexes:Record<string,number>={overview:0,proxies:1,orders:2,wallet:3,whitelist:4,support:5,notifications:6};
export default function DashboardTabSync(){useEffect(()=>{const sync=()=>{const tab=new URLSearchParams(location.search).get("tab")||"overview",index=tabIndexes[tab],buttons=document.querySelectorAll<HTMLButtonElement>(".console-menu > button");if(index!==undefined&&buttons[index]&&!buttons[index].classList.contains("on"))buttons[index].click()};const timer=window.setTimeout(sync);addEventListener("popstate",sync);return()=>{clearTimeout(timer);removeEventListener("popstate",sync)}},[]);return null}
