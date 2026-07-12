import{env}from"cloudflare:workers";import{eq}from"drizzle-orm";import{getDb}from"../db";import{emailProviders}from"../db/schema";
type RuntimeEnv=Record<string,unknown>;
export async function sendVerificationEmail(to:string,code:string,purpose:"register"|"reset"){
  const[row]=await getDb().select().from(emailProviders).where(eq(emailProviders.id,"primary")).limit(1);
  if(!row?.enabled)throw new Error("邮件服务尚未启用，请联系管理员");
  const secretName=row.credentialRef||"EMAIL_API_KEY",secret=String((env as unknown as RuntimeEnv)[secretName]||"");
  if(!secret)throw new Error(`邮件密钥 ${secretName} 尚未配置`);
  const title=purpose==="register"?"注册验证码":"重置密码验证码",html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>YehaoProxy ${title}</h2><p>你的验证码是：</p><div style="font-size:32px;letter-spacing:8px;font-weight:700">${code}</div><p>验证码 10 分钟内有效。如非本人操作，请忽略此邮件。</p></div>`;
  if(row.provider!=="resend")throw new Error("当前运行环境暂仅支持 Resend HTTP 投递，请在后台选择 Resend");
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify({from:`${row.fromName} <${row.fromEmail}>`,to:[to],subject:`YehaoProxy ${title}`,html})});
  if(!response.ok)throw new Error("邮件投递失败，请稍后重试");
}
