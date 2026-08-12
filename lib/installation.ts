import {eq} from "drizzle-orm";
import {getDb} from "../db";
import {customers} from "../db/schema";

export async function installationStatus(){
 try{
  const [row]=await getDb().select({id:customers.id,email:customers.email,name:customers.name}).from(customers).where(eq(customers.role,"admin")).limit(1);
  return {installed:Boolean(row),database:true};
 }catch{return {installed:false,database:false}}
}
