import {databaseDriver,getRawDatabase} from "../db";

let migration:Promise<void>|null=null;

export function ensureProductOfferSchema(){
  if(migration)return migration;
  migration=(async()=>{
    const raw=getRawDatabase();
    if(databaseDriver()==="mysql"){
      const result=await raw.prepare("SHOW COLUMNS FROM product_offers LIKE 'price_180'").all();
      if(!result.results.length)await raw.exec("ALTER TABLE product_offers ADD COLUMN price_180 DOUBLE NOT NULL DEFAULT -1 AFTER price_90");
      return;
    }
    const result=await raw.prepare("PRAGMA table_info(product_offers)").all<{name:string}>();
    if(!result.results.some(column=>column.name==="price_180"))await raw.exec("ALTER TABLE product_offers ADD COLUMN price_180 REAL NOT NULL DEFAULT -1");
  })().catch(error=>{migration=null;throw error});
  return migration;
}
