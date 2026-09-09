export type Sample = { time:string; net_total_up:number; net_total_down:number; uptime?:number; online?:boolean; cpu?:number; ram?:number; ram_total?:number; disk?:number; disk_total?:number; net_in?:number; net_out?:number };
export type Meter = { last?:Sample; up:number; down:number; resets:number; gaps:number; days:Record<string,{up:number;down:number}>; startedAt:string };
export function accumulate(previous:Meter|undefined, sample:Sample):Meter {
  const timestamp=Date.parse(sample.time);
  if(!Number.isFinite(timestamp)||![sample.net_total_up,sample.net_total_down].every(x=>Number.isSafeInteger(x)&&x>=0))throw new Error("探针流量数据无效");
  const meter:Meter=previous?structuredClone(previous):{up:0,down:0,resets:0,gaps:0,days:{},startedAt:sample.time};
  if(sample.online===false)return meter;
  if(meter.last&&timestamp<=Date.parse(meter.last.time))return meter;
  if(meter.last){
    const old=meter.last;
    const restarted=sample.uptime!=null&&old.uptime!=null&&sample.uptime<old.uptime;
    const reset=restarted||sample.net_total_up<old.net_total_up||sample.net_total_down<old.net_total_down;
    const up=restarted||sample.net_total_up<old.net_total_up?sample.net_total_up:sample.net_total_up-old.net_total_up;
    const down=restarted||sample.net_total_down<old.net_total_down?sample.net_total_down:sample.net_total_down-old.net_total_down;
    meter.up+=up;meter.down+=down;if(reset)meter.resets++;
    if(timestamp-Date.parse(old.time)>180000)meter.gaps++;
    const day=sample.time.slice(0,10),daily=meter.days[day]||{up:0,down:0};
    meter.days[day]={up:daily.up+up,down:daily.down+down};
  }
  meter.last=sample;return meter;
}
