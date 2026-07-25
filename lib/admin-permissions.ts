export const ADMIN_PERMISSIONS=[
  ["overview","运营概览"],["orders","订单管理"],["products","商品管理"],["inventory","库存中心"],["customers","客户管理"],["finance","财务中心"],["sales","销售业绩"],["tickets","工单管理"],["coupons","优惠券"],["requests","售后申请"],["automation","定时任务"],["settings","系统设置"],["audit","审计日志"],["admins","管理员管理"],
] as const;
export type AdminPermission=typeof ADMIN_PERMISSIONS[number][0];
export const ALL_ADMIN_PERMISSIONS=ADMIN_PERMISSIONS.map(x=>x[0]);
