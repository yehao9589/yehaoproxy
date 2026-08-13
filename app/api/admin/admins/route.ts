import {desc,eq,inArray} from "drizzle-orm";
import {NextResponse} from "next/server";
import {getDb} from "../../../../db";
import {adminMemberships,adminRoles,authSessions,customers} from "../../../../db/schema";
import {ALL_ADMIN_PERMISSIONS} from "../../../../lib/admin-permissions";
import {isSuperAdmin,requireAdminApi} from "../../../../lib/admin-auth";
import {audit} from "../../../../lib/audit";
import {hashPassword} from "../../../../lib/auth";

const cleanPermissions=(value:unknown)=>[...new Set((Array.isArray(value)?value:[]).map(String).filter(x=>ALL_ADMIN_PERMISSIONS.includes(x as never)))];

export async function GET(){
  const operator=await requireAdminApi("admins");
  if(!operator)return NextResponse.json({error:"只有超级管理员或管理员管理权限可访问"},{status:403});
  const db=getDb();
  const items=await db.select({id:customers.id,email:customers.email,name:customers.name,status:customers.status,createdAt:customers.createdAt}).from(customers).where(eq(customers.role,"admin")).orderBy(desc(customers.createdAt));
  const memberships=items.length?await db.select().from(adminMemberships).where(inArray(adminMemberships.customerId,items.map((x:{id:string})=>x.id))):[];
  const roles=memberships.length?await db.select().from(adminRoles).where(inArray(adminRoles.id,memberships.map((x:{roleId:string})=>x.roleId))):[];
  const roleMap=new Map(roles.map((x:{id:string})=>[x.id,x]));
  const memberMap=new Map(memberships.map((x:{customerId:string})=>[x.customerId,x]));
  return NextResponse.json({
    items:items.map((item:{id:string;email:string})=>{
      const membership=memberMap.get(item.id) as {roleId:string}|undefined;
      const role=roleMap.get(membership?.roleId||"") as {name:string;permissions:string}|undefined;
      const superAdmin=isSuperAdmin(item);
      let permissions:string[]=[];
      if(superAdmin)permissions=[...ALL_ADMIN_PERMISSIONS];
      else try{permissions=JSON.parse(role?.permissions||"[]")}catch{}
      return {...item,superAdmin,roleName:superAdmin?"超级管理员":role?.name||"未分配角色",permissions};
    }),
    permissionOptions:ALL_ADMIN_PERMISSIONS,
  });
}

export async function POST(req:Request){
  const operator=await requireAdminApi("admins");
  if(!operator)return NextResponse.json({error:"无管理员管理权限"},{status:403});
  const body=await req.json().catch(()=>null),email=String(body?.email||"").trim().toLowerCase(),name=String(body?.name||"").trim(),password=String(body?.password||""),permissions=cleanPermissions(body?.permissions);
  if(!email||password.length<8)return NextResponse.json({error:"请输入管理员账号，密码至少 8 位"},{status:400});
  const db=getDb();
  if((await db.select({id:customers.id}).from(customers).where(eq(customers.email,email)).limit(1))[0])return NextResponse.json({error:"账号已存在"},{status:409});
  const id=crypto.randomUUID(),roleId=`role-${id}`,now=new Date();
  await db.insert(customers).values({id,email,name:name||null,passwordHash:await hashPassword(password),emailVerified:true,role:"admin",status:"active",createdAt:now});
  await db.insert(adminRoles).values({id:roleId,name:`${name||email}权限`,permissions:JSON.stringify(permissions),createdAt:now,updatedAt:now});
  await db.insert(adminMemberships).values({customerId:id,roleId,enabled:true,createdAt:now});
  await audit(operator,"admin.create","admin",id,{email,permissions},req);
  return NextResponse.json({ok:true,id},{status:201});
}

export async function PATCH(req:Request){
  const operator=await requireAdminApi("admins");
  if(!operator)return NextResponse.json({error:"无管理员管理权限"},{status:403});
  const body=await req.json().catch(()=>null),id=String(body?.id||""),db=getDb();
  const [target]=await db.select().from(customers).where(eq(customers.id,id)).limit(1);
  if(!target||target.role!=="admin")return NextResponse.json({error:"管理员不存在"},{status:404});
  const password=String(body?.password||"");
  if(password){
    if(password.length<8)return NextResponse.json({error:"新密码至少需要 8 位"},{status:400});
    await db.update(customers).set({passwordHash:await hashPassword(password)}).where(eq(customers.id,id));
    await db.delete(authSessions).where(eq(authSessions.customerId,id));
    await audit(operator,"admin.password.update","admin",id,{sessionsRevoked:true},req);
    return NextResponse.json({ok:true,sessionsRevoked:true});
  }
  if(isSuperAdmin(target))return NextResponse.json({error:"超级管理员账户不可降级、停用或修改权限"},{status:409});
  const permissions=cleanPermissions(body?.permissions),status=body?.status==="suspended"?"suspended":"active";
  const [membership]=await db.select().from(adminMemberships).where(eq(adminMemberships.customerId,id)).limit(1),now=new Date();
  await db.update(customers).set({status}).where(eq(customers.id,id));
  if(membership)await db.update(adminRoles).set({permissions:JSON.stringify(permissions),updatedAt:now}).where(eq(adminRoles.id,membership.roleId));
  else{
    const roleId=`role-${id}`;
    await db.insert(adminRoles).values({id:roleId,name:`${target.name||target.email}权限`,permissions:JSON.stringify(permissions),createdAt:now,updatedAt:now});
    await db.insert(adminMemberships).values({customerId:id,roleId,enabled:true,createdAt:now});
  }
  await audit(operator,"admin.permissions.update","admin",id,{permissions,status},req);
  return NextResponse.json({ok:true});
}
