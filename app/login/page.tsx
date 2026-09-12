"use client";
import {useEffect,useState} from "react";
import Link from "next/link";

function PasswordEye({visible}:{visible:boolean}){
 return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{visible?<><path d="M3 3l18 18"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.9 4.3A10.7 10.7 0 0 1 12 4c5.5 0 9 5.5 9 5.5a15.1 15.1 0 0 1-2.1 2.7"/><path d="M6.2 6.2C4.2 7.6 3 9.5 3 9.5S6.5 15 12 15c1 0 2-.2 2.8-.5"/></>:<><path d="M3 12s3.5-5.5 9-5.5 9 5.5 9 5.5-3.5 5.5-9 5.5S3 12 3 12z"/><circle cx="12" cy="12" r="2.5"/></>}</svg>
}

export default function Login(){
 const[show,setShow]=useState(false),[account,setAccount]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{if(new URLSearchParams(location.search).get("reason")==="session-expired")setError("登录状态已过期，请重新登录后继续操作")},[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setLoading(true);setError("");
  try{
   const r=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:account,password})}),d=await r.json();
   if(d.passwordSetupRequired){location.href=`/forgot-password?setup=1&email=${encodeURIComponent(d.email||account)}`;return}
   if(!r.ok)throw new Error(d.error||"登录失败");
   const requested=new URLSearchParams(location.search).get("next")||"",safe=requested.startsWith("/")&&!requested.startsWith("//")?requested:"";
   location.href=d.role==="admin"?(safe.startsWith("/admin")?safe:"/admin"):(safe.startsWith("/dashboard")||safe.startsWith("/buy")?safe:"/dashboard");
  }catch(e){setError(e instanceof Error?e.message:"登录失败")}finally{setLoading(false)}
 }
 return <main className="auth-page"><section className="auth-brand"><Link className="brand" href="/"><span>Y</span> YehaoProxy</Link><div><span className="kicker">WELCOME BACK</span><h1>让每一次全球连接<br/>都稳定可靠</h1><p>企业级代理网络，覆盖全球主要国家和地区。</p><ul><li>✓ 99.9% 网络可用率</li><li>✓ 7×24 小时技术支持</li><li>✓ 灵活 API 与批量管理</li></ul></div><small>© 2026 YehaoProxy</small></section><section className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><h2>登录账户</h2><p>欢迎回来，请输入你的账户信息</p>{error&&<div className="auth-error">{error}</div>}<label>邮箱或用户名<input type="text" value={account} onChange={e=>setAccount(e.target.value)} placeholder="邮箱或管理员用户名" required/></label><label><span>密码 <Link href="/forgot-password">忘记密码？</Link></span><div className="password"><input type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={show?"隐藏密码":"显示密码"} title={show?"隐藏密码":"显示密码"} aria-pressed={show} onClick={()=>setShow(!show)}><PasswordEye visible={show}/></button></div></label><button className="primary auth-submit" disabled={loading}>{loading?"正在登录…":"登录"}</button><div className="auth-foot">还没有账户？ <Link href="/register">免费注册</Link></div></form></section></main>;
}
