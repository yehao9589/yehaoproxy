export function isNodeServiceProduct(product: string) {
  return product === "computer-node" || product === "soft-router";
}

/** Service lists show original, paid entitlements; order history has its own rules. */
export function isCustomerNodeService(order: {
  product: string;
  status: string;
  renewalOf?: string | null;
  bundleRenewal?: boolean;
}) {
  return isNodeServiceProduct(order.product) && !order.renewalOf && !order.bundleRenewal &&
    (order.status === "paid" || order.status === "provisioning" || order.status === "active");
}
