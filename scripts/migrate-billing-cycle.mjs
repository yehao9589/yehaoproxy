import {DatabaseSync} from "node:sqlite";

const file=process.argv[2];
if(!file)throw new Error("请传入本地 D1 数据库文件路径");
const db=new DatabaseSync(file);
const columns=db.prepare("PRAGMA table_info(product_offers)").all();
if(!columns.some(column=>column.name==="billing_cycle")){
  db.exec("ALTER TABLE product_offers ADD COLUMN billing_cycle text DEFAULT 'fixed-days' NOT NULL");
}
console.log("product_offers.billing_cycle 已就绪");
db.close();
