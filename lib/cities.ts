const cityLists:Record<string,string[]>={
  US:["洛杉矶","纽约","旧金山","芝加哥","西雅图","迈阿密","达拉斯","弗吉尼亚"],JP:["东京","大阪","横滨","名古屋","福冈"],GB:["伦敦","曼彻斯特","伯明翰"],DE:["法兰克福","柏林","慕尼黑","汉堡"],FR:["巴黎","马赛","里昂"],CA:["多伦多","温哥华","蒙特利尔"],AU:["悉尼","墨尔本","布里斯班"],SG:["新加坡"],KR:["首尔","釜山"],HK:["香港"],TW:["台北","高雄"],BR:["圣保罗","里约热内卢"],IN:["孟买","德里","班加罗尔"],NL:["阿姆斯特丹","鹿特丹"],IT:["米兰","罗马"],ES:["马德里","巴塞罗那"],RU:["莫斯科","圣彼得堡"],AE:["迪拜","阿布扎比"],MY:["吉隆坡"],TH:["曼谷"],VN:["胡志明市","河内"],ID:["雅加达"],PH:["马尼拉"],NZ:["奥克兰"],CH:["苏黎世","日内瓦"],SE:["斯德哥尔摩"],NO:["奥斯陆"],FI:["赫尔辛基"],PL:["华沙"],TR:["伊斯坦布尔"],ZA:["约翰内斯堡","开普敦"],MX:["墨西哥城"]
};

export const citiesByCountry:Record<string,Array<{value:string;label:string}>>=Object.fromEntries(Object.entries(cityLists).map(([code,names])=>[code,names.map(name=>({value:name,label:name}))]));

export const legacyCityNames:Record<string,string>={
  "Los Angeles":"洛杉矶","New York":"纽约","San Francisco":"旧金山",Chicago:"芝加哥",Seattle:"西雅图",Miami:"迈阿密",Dallas:"达拉斯",Virginia:"弗吉尼亚",Tokyo:"东京",Osaka:"大阪",Yokohama:"横滨",Nagoya:"名古屋",Fukuoka:"福冈",London:"伦敦",Manchester:"曼彻斯特",Birmingham:"伯明翰",Frankfurt:"法兰克福",Berlin:"柏林",Munich:"慕尼黑",Hamburg:"汉堡",Paris:"巴黎",Marseille:"马赛",Lyon:"里昂",Toronto:"多伦多",Vancouver:"温哥华",Montreal:"蒙特利尔",Sydney:"悉尼",Melbourne:"墨尔本",Brisbane:"布里斯班",Singapore:"新加坡",Seoul:"首尔",Busan:"釜山","Hong Kong":"香港",Taipei:"台北",Kaohsiung:"高雄","Sao Paulo":"圣保罗","São Paulo":"圣保罗","Rio de Janeiro":"里约热内卢",Mumbai:"孟买",Delhi:"德里",Bangalore:"班加罗尔",Amsterdam:"阿姆斯特丹",Rotterdam:"鹿特丹",Milan:"米兰",Rome:"罗马",Madrid:"马德里",Barcelona:"巴塞罗那",Moscow:"莫斯科","Saint Petersburg":"圣彼得堡",Dubai:"迪拜","Abu Dhabi":"阿布扎比","Kuala Lumpur":"吉隆坡",Bangkok:"曼谷","Ho Chi Minh City":"胡志明市",Hanoi:"河内",Jakarta:"雅加达",Manila:"马尼拉",Auckland:"奥克兰",Zurich:"苏黎世",Geneva:"日内瓦",Stockholm:"斯德哥尔摩",Oslo:"奥斯陆",Helsinki:"赫尔辛基",Warsaw:"华沙",Istanbul:"伊斯坦布尔",Johannesburg:"约翰内斯堡","Cape Town":"开普敦","Mexico City":"墨西哥城",Other:"其他城市"
};

export function normalizeCityName(value:string|null|undefined){const city=String(value||"").trim();return legacyCityNames[city]||city}

// Explicit syllables keep transliterated city names and polyphonic characters predictable.
const cityPinyin:Record<string,string>={
 "洛杉矶":"luo shan ji","纽约":"niu yue","旧金山":"jiu jin shan","芝加哥":"zhi jia ge","西雅图":"xi ya tu","迈阿密":"mai a mi","达拉斯":"da la si","弗吉尼亚":"fu ji ni ya",
 "东京":"dong jing","大阪":"da ban","横滨":"heng bin","名古屋":"ming gu wu","福冈":"fu gang","伦敦":"lun dun","曼彻斯特":"man che si te","伯明翰":"bo ming han",
 "法兰克福":"fa lan ke fu","柏林":"bo lin","慕尼黑":"mu ni hei","汉堡":"han bao","巴黎":"ba li","马赛":"ma sai","里昂":"li ang","多伦多":"duo lun duo","温哥华":"wen ge hua","蒙特利尔":"meng te li er",
 "悉尼":"xi ni","墨尔本":"mo er ben","布里斯班":"bu li si ban","新加坡":"xin jia po","首尔":"shou er","釜山":"fu shan","香港":"xiang gang","台北":"tai bei","高雄":"gao xiong",
 "圣保罗":"sheng bao luo","里约热内卢":"li yue re nei lu","孟买":"meng mai","德里":"de li","班加罗尔":"ban jia luo er","阿姆斯特丹":"a mu si te dan","鹿特丹":"lu te dan",
 "米兰":"mi lan","罗马":"luo ma","马德里":"ma de li","巴塞罗那":"ba sai luo na","莫斯科":"mo si ke","圣彼得堡":"sheng bi de bao","迪拜":"di bai","阿布扎比":"a bu zha bi",
 "吉隆坡":"ji long po","曼谷":"man gu","胡志明市":"hu zhi ming shi","河内":"he nei","雅加达":"ya jia da","马尼拉":"ma ni la","奥克兰":"ao ke lan","苏黎世":"su li shi","日内瓦":"ri nei wa",
 "斯德哥尔摩":"si de ge er mo","奥斯陆":"ao si lu","赫尔辛基":"he er xin ji","华沙":"hua sha","伊斯坦布尔":"yi si tan bu er","约翰内斯堡":"yue han nei si bao","开普敦":"kai pu dun","墨西哥城":"mo xi ge cheng","其他城市":"qi ta cheng shi"
};
const normalizeSearch=(value:string)=>value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s'-]/g,"");
const citySearchAliases:Record<string,string[]>=Object.fromEntries(Object.entries(cityPinyin).map(([city,pinyin])=>[city,[normalizeSearch(pinyin),pinyin.split(" ").map(part=>part[0]).join("")]]));
for(const [english,city] of Object.entries(legacyCityNames)){
 (citySearchAliases[city]??=[]).push(normalizeSearch(english),english.toLowerCase().split(/\s+/).map(part=>part[0]).join(""));
}
export function cityMatchesSearch(city:string,query:string){
 const keyword=normalizeSearch(query),name=normalizeCityName(city);
 return !keyword||normalizeSearch(name).includes(keyword)||(citySearchAliases[name]||[]).some(alias=>alias.includes(keyword));
}
