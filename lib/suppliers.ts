export type SupplierRequest={product:string;country:string;quantity:number;durationDays:number};
export type SupplierQuote={supplierId:string;available:number;unitCost:number;currency:string};
export interface SupplierAdapter{health():Promise<boolean>;quote(input:SupplierRequest):Promise<SupplierQuote>;purchase(input:SupplierRequest):Promise<Array<{externalId:string;host:string;port:number;username?:string;password?:string}>>}
export function chooseSupplier(quotes:SupplierQuote[]){return [...quotes].filter(x=>x.available>0).sort((a,b)=>a.unitCost-b.unitCost)[0]??null}
