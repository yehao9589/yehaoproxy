import { getCurrentCustomer } from "./auth";export async function requireAdminApi(){const user=await getCurrentCustomer();return user?.role==="admin"&&user.status==="active"?user:null}
