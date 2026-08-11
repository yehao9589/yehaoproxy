import {NextResponse} from "next/server";
export async function POST(){return NextResponse.json({error:"库存提取功能已移除，请等待管理员人工开通"},{status:410})}
