export const TICKET_CATEGORIES = [
  "connection",
  "billing",
  "account",
  "product",
  "general",
  "technical",
  "service",
] as const;

export const AFTER_SALES_TICKET_CATEGORIES = [
  "renewal",
  "replace",
  "ip_replacement",
  "reset_traffic",
  "node_traffic_reset",
  "after_sales",
] as const;

export function normalizeTicketCategory(value: unknown) {
  const category = String(value || "general");
  return (TICKET_CATEGORIES as readonly string[]).includes(category) ? category : "general";
}
