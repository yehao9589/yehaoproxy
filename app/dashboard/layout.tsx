import{cookies}from"next/headers";
import ImpersonationBanner from"./ImpersonationBanner";

export default async function DashboardLayout({children}:{children:React.ReactNode}){
  const impersonating=Boolean((await cookies()).get("yh_admin_session")?.value);
  return <>{impersonating&&<ImpersonationBanner/>}{children}</>;
}
