import {and,eq} from "drizzle-orm";
import {getDb} from "../db";
import {adminMemberships,adminRoles} from "../db/schema";
import {getCurrentCustomer} from "./auth";
import {ALL_ADMIN_PERMISSIONS,type AdminPermission} from "./admin-permissions";

export async function getAdminAccess(){
  const user=await getCurrentCustomer();
  if(!user||user.role!=="admin"||user.status!=="active")return null;
  const superAdmin=user.email.toLowerCase()==="admin";
  if(superAdmin)return {user,superAdmin:true,roleName:"超级管理员",permissions:ALL_ADMIN_PERMISSIONS};
  const[row]=await getDb().select({membership:adminMemberships,role:adminRoles}).from(adminMemberships).innerJoin(adminRoles,eq(adminMemberships.roleId,adminRoles.id)).where(and(eq(adminMemberships.customerId,user.id),eq(adminMemberships.enabled,true))).limit(1);
  if(!row)return {user,superAdmin:false,roleName:"未分配角色",permissions:[] as string[]};
  let permissions:string[]=[];try{permissions=JSON.parse(row.role.permissions)}catch{}
  return {user,superAdmin:false,roleName:row.role.name,permissions};
}
export async function requireAdminApi(permission?:AdminPermission){const access=await getAdminAccess();if(!access)return null;if(permission&&!access.superAdmin&&!access.permissions.includes(permission))return null;return access.user}
