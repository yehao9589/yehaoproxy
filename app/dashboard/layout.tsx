import{cookies}from"next/headers";
export default async function DashboardLayout({children}:{children:React.ReactNode}){const impersonating=Boolean((await cookies()).get("yh_admin_session")?.value);return <>{impersonating&&<div className="impersonation-banner"><span><b>管理员模拟登录</b> · 当前正在查看客户面板</span><a href="/api/admin/impersonation/return">返回管理后台</a></div>}{children}</>}
