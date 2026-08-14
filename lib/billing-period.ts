export type BillingCycle="fixed-days"|"calendar-month";

export function billingCycleFromNote(note:unknown):BillingCycle{
  const text=typeof note==="string"?note:"";
  return text.match(/\[BILLING_CYCLE\]([^\n]+)/)?.[1]?.trim()==="calendar-month"?"calendar-month":"fixed-days";
}

export function periodLabel(durationDays:number,cycle:BillingCycle){
  if(cycle==="calendar-month")return`${Math.max(1,Math.round(durationDays/30))} 个月`;
  return`${durationDays} 天`;
}

export function addBillingPeriod(base:Date,durationDays:number,cycle:BillingCycle){
  if(cycle==="fixed-days")return new Date(base.getTime()+durationDays*86400000);
  const months=Math.max(1,Math.round(durationDays/30)),sourceDay=base.getDate(),result=new Date(base);
  result.setDate(1);
  result.setMonth(result.getMonth()+months);
  const lastDay=new Date(result.getFullYear(),result.getMonth()+1,0).getDate();
  result.setDate(Math.min(sourceDay,lastDay));
  return result;
}
