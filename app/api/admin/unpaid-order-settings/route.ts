import {NextResponse} from "next/server";
import {requireAdminApi} from "../../../../lib/admin-auth";
import {getUnpaidOrderPolicy} from "../../../../lib/unpaid-order-settings";
import {setSystemOption} from "../../../../lib/db-upsert";
import {audit} from "../../../../lib/audit";
export async function GET(){if(!await requireAdminApi("settings"))return NextResponse.json({error:"无系统设置权限"},{status:403});return NextResponse.json({config:await getUnpaidOrderPolicy()})}
export async function PUT(req:Request){const admin=await requireAdminApi("settings");if(!admin)return NextResponse.json({error:"无系统设置权限"},{status:403});const v=await req.json().catch(()=>null);if(typeof v?.enabled!=="boolean"||!Number.isInteger(v.hours)||v.hours<1||v.hours>8760)return NextResponse.json({error:"请输入 1～8760 的整数小时数"},{status:400});const before=await getUnpaidOrderPolicy(),config={enabled:v.enabled,hours:v.hours};await setSystemOption("unpaid_order_policy",JSON.stringify(config));await audit(admin,"settings.unpaid_order.update","settings","unpaid_order_policy",{before,after:config},req);return NextResponse.json({ok:true,config})}
