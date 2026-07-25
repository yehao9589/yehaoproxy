import { getDb } from "../db";
import { auditLogs } from "../db/schema";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip")
    || forwarded
    || request.headers.get("x-real-ip")
    || request.headers.get("true-client-ip");
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
  await getDb().insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: actor.id,
    actorRole: actor.role,
    action,
    resourceType,
    resourceId,
    detail: JSON.stringify(detail ?? {}),
    ipAddress: clientIp(request),
    createdAt: new Date(),
  });
}

export async function systemAudit(action:string,resourceType:string,resourceId:string|null,detail:unknown){
  await getDb().insert(auditLogs).values({
    id:crypto.randomUUID(),
    actorId:"system",
    actorRole:"system",
    action,
    resourceType,
    resourceId,
    detail:JSON.stringify(detail??{}),
    ipAddress:null,
    createdAt:new Date(),
  });
}
