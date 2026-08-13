import {NextResponse} from "next/server";
import {requireAdminApi} from "../../../../../lib/admin-auth";
import {sendTransactionalEmail} from "../../../../../lib/email";
import {brandedEmail} from "../../../../../lib/branded-email";

export async function POST(req:Request){
  const admin=await requireAdminApi("settings");
  if(!admin)return NextResponse.json({error:"无系统设置权限"},{status:403});
  const body=await req.json().catch(()=>null);
  const to=String(body?.to||admin.email).trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(to))return NextResponse.json({error:"请输入有效的测试收件邮箱"},{status:400});
  try{
    const html=await brandedEmail({
      title:"邮件接口配置成功",
      eyebrow:"SYSTEM TEST",
      body:"如果你收到这封邮件，说明当前邮件服务商、发件身份、加密凭据和投递链路均可正常使用。",
      details:[
        {label:"测试收件邮箱",value:to},
        {label:"发送时间",value:new Date().toLocaleString("zh-CN",{hour12:false,timeZone:"Asia/Shanghai"})},
        {label:"测试状态",value:"投递请求已成功提交",accent:true},
      ],
      notice:"部分邮件服务商可能存在数秒延迟；若收件箱中没有看到，请同时检查垃圾邮件目录。",
    });
    await sendTransactionalEmail(to,"邮件接口测试",html);
    return NextResponse.json({ok:true,to,message:`测试邮件已发送至 ${to}`});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"测试邮件发送失败"},{status:502});
  }
}
