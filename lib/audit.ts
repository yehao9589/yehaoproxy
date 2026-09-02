import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { auditLogs, authSessions, customers } from "../db/schema";
import { sha256 } from "./auth";
import { sanitizeAuditDetail } from "./audit-sanitize";
import { ensureAuditSchema } from "./audit-schema";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const standardForwarded = request.headers.get("forwarded")?.match(/(?:^|;)\s*for=(?:"?\[)?([^\]";,]+)/i)?.[1]?.trim();
  const ip = request.headers.get("cf-connecting-ip")
    || forwarded
    || request.headers.get("x-real-ip")
    || request.headers.get("true-client-ip")
    || request.headers.get("x-client-ip")
    || request.headers.get("x-cluster-client-ip")
    || standardForwarded;
  if (ip) return ip;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "127.0.0.1" : null;
}

export async function audit(
  actor: { id:string; role:string },
  action: string,
  resourceType: string,
  resourceId: string | null,
  detail: unknown,
  request: Request,
) {
  const db = getDb();
  await ensureAuditSchema();
  let resolvedActor = actor;
  let resolvedDetail = detail;

  // An impersonated customer session runs customer APIs, but the real operator
  // must remain the administrator who started the impersonation.
  if (actor.role !== "admin") {
    const encodedAdminToken = request.headers.get("cookie")?.match(/(?:^|;\s*)yh_admin_session=([^;]+)/)?.[1];
    if (encodedAdminToken) {
      try {
        const adminToken = decodeURIComponent(encodedAdminToken);
        const [session] = await db.select().from(authSessions).where(eq(authSessions.tokenHash, await sha256(adminToken))).limit(1);
        if (session && session.expiresAt >= new Date()) {
          const [admin] = await db.select().from(customers).where(eq(customers.id, session.customerId)).limit(1);
          if (admin?.role === "admin" && admin.status === "active") {
            const originalDetail = detail && typeof detail === "object" && !Array.isArray(detail)
              ? detail as Record<string, unknown>
              : { value: detail };
            resolvedActor = { id: admin.id, role: admin.role };
            resolvedDetail = {
              ...originalDetail,
              performedViaImpersonation: true,
              actualAdminEmail: admin.email,
              impersonatedCustomerId: actor.id,
            };
          }
        }
      } catch {
        // A malformed or expired saved admin cookie must not block the action
        // or prevent its ordinary customer audit record.
      }
    }
  }

  try {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: resolvedActor.id,
      actorRole: resolvedActor.role,
      action,
      resourceType,
      resourceId,
      detail: JSON.stringify(sanitizeAuditDetail(resolvedDetail)),
      ipAddress: clientIp(request),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Audit write failed", { action, resourceType, resourceId, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function systemAudit(action:string,resourceType:string,resourceId:string|null,detail:unknown){
  try{
    await ensureAuditSchema();
    await getDb().insert(auditLogs).values({
      id:crypto.randomUUID(),
      actorId:"system",
      actorRole:"system",
      action,
      resourceType,
      resourceId,
      detail:JSON.stringify(sanitizeAuditDetail(detail)),
      ipAddress:null,
      createdAt:new Date(),
    });
  }catch(error){console.error("System audit write failed",{action,resourceType,resourceId,error:error instanceof Error?error.message:String(error)})}
}
