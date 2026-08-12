import {env} from "cloudflare:workers";
import {eq} from "drizzle-orm";
import nodemailer from "nodemailer";
import {getDb} from "../db";
import {emailProviders} from "../db/schema";
import {systemAudit} from "./audit";

type RuntimeEnv=Record<string,string|undefined>;
function secret(name:string){return String((env as unknown as RuntimeEnv)[name]||process.env[name]||"")}

export async function sendTransactionalEmail(to:string,title:string,html:string){
  const[row]=await getDb().select().from(emailProviders).where(eq(emailProviders.id,"primary")).limit(1);
  try{
    if(!row?.enabled)throw new Error("邮件服务尚未启用");
    const secretName=row.credentialRef||"EMAIL_API_KEY",credential=secret(secretName);
    if(!credential)throw new Error(`邮件凭据 ${secretName} 尚未配置`);
    const subject=`YehaoProxy ${title}`,from=`${row.fromName} <${row.fromEmail}>`;
    if(row.provider==="resend"){
      const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${credential}`,"content-type":"application/json"},body:JSON.stringify({from,to:[to],subject,html})});
      if(!response.ok)throw new Error(`Resend 投递失败（${response.status}）`);
    }else if(row.provider==="sendgrid"){
      const response=await fetch("https://api.sendgrid.com/v3/mail/send",{method:"POST",headers:{authorization:`Bearer ${credential}`,"content-type":"application/json"},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:row.fromEmail,name:row.fromName},subject,content:[{type:"text/html",value:html}]})});
      if(!response.ok)throw new Error(`SendGrid 投递失败（${response.status}）`);
    }else if(row.provider==="smtp"){
      if(!row.host||!row.port||!row.username)throw new Error("SMTP 配置不完整");
      const transporter=nodemailer.createTransport({host:row.host,port:row.port,secure:row.port===465,requireTLS:row.port!==465,auth:{user:row.username,pass:credential}});
      await transporter.sendMail({from,to,subject,html});
    }else throw new Error("不支持的邮件服务商");
    await systemAudit("email.sent","email",null,{to,subject:title,provider:row.provider});
  }catch(error){await systemAudit("email.failed","email",null,{to,subject:title,provider:row?.provider||null,error:error instanceof Error?error.message:"未知错误"});throw error}
}

export async function sendVerificationEmail(to:string,code:string,purpose:"register"|"reset"){
  const title=purpose==="register"?"注册验证码":"重置密码验证码";
  const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>YehaoProxy ${title}</h2><p>你的验证码是：</p><div style="font-size:32px;letter-spacing:8px;font-weight:700">${code}</div><p>验证码 10 分钟内有效。如非本人操作，请忽略此邮件。</p></div>`;
  await sendTransactionalEmail(to,title,html);
}
