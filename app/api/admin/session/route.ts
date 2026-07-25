import {NextResponse} from "next/server";
import {getAdminAccess} from "../../../../lib/admin-auth";
export async function GET(){const access=await getAdminAccess();if(!access)return NextResponse.json({error:"无管理员权限"},{status:403});return NextResponse.json({superAdmin:access.superAdmin,roleName:access.roleName,permissions:access.permissions,email:access.user.email})}
