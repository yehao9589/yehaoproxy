import { redirect } from "next/navigation";
import { getAdminAccess } from "../../lib/admin-auth";
import { installationStatus } from "../../lib/installation";
import { getConsoleBrand } from "../../lib/site-config";
import AdminLogoutButton from "./AdminLogoutButton";
import AdminRoutePersistence from "./AdminRoutePersistence";
import LiveAdmin from "./LiveAdmin";

export const dynamic = "force-dynamic";

export default async function Admin() {
  if (!(await installationStatus()).installed) redirect("/install");
  const access = await getAdminAccess();
  if (!access) redirect("/login");
  const brand = await getConsoleBrand();
  return <><LiveAdmin email={access.user.email} roleName={access.roleName} permissions={access.permissions} brand={brand}/><AdminRoutePersistence/><AdminLogoutButton/></>;
}
