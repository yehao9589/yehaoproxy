import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "../../lib/auth";
import { getConsoleBrand } from "../../lib/site-config";
import LiveDashboard from "./LiveDashboard";
import DashboardTabSync from "./DashboardTabSync";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getCurrentCustomer();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const impersonating = Boolean((await cookies()).get("yh_admin_session")?.value);
  const brand = await getConsoleBrand();
  return <><DashboardTabSync /><LiveDashboard name={user.name || user.email} impersonating={impersonating} brand={brand} /></>;
}
