"use client";

import { useEffect } from "react";

const exact: Record<string, string> = {
  "ADMIN CONSOLE": "运营管理后台",
  "NOTIFICATION CENTER": "通知中心",
  "SHOPPING CART": "购物车",
  "ORDER REVIEW": "订单确认",
  "WELCOME BACK": "欢迎回来",
  "START FOR FREE": "免费开始使用",
  "ACCOUNT SECURITY": "账户安全",
  "PAYMENT SUCCESSFUL": "支付成功",
  "STATIC IP CONNECTION": "静态 IP 连接",
  "SHADOWROCKET": "小火箭",
  "Sender ID": "发送方标识",
  "City not set": "未设置城市",
  "English": "英语",
  "Sandbox": "沙箱环境",
  "Live": "正式环境",

  pending: "待处理",
  paid: "已付款",
  provisioning: "等待开通",
  active: "使用中",
  completed: "已完成",
  complete: "已完成",
  success: "成功",
  succeeded: "成功",
  failed: "失败",
  canceled: "已取消",
  cancelled: "已取消",
  refunded: "已退款",
  available: "可售",
  reserved: "已预留",
  allocated: "已分配",
  disabled: "已停用",
  enabled: "已启用",
  open: "处理中",
  closed: "已关闭",
  resolved: "已解决",
  waiting_customer: "等待客户回复",
  waiting_staff: "等待客服回复",
  unread: "未读",
  read: "已读",

  "static-isp": "静态住宅 ISP",
  residential: "动态住宅代理",
  datacenter: "数据中心代理",
  mobile: "移动代理",
  "soft-router": "软路由中转",
  "computer-node": "电脑节点",
  "node-traffic-reset": "节点流量重置",
  "ip-replacement": "更换 IP",
  "wallet-topup": "余额充值",

  purchase: "消费",
  recharge: "充值",
  refund: "退款",
  adjustment: "人工调账",
  credit: "信用额",
  balance: "余额",
  manual: "人工处理",

  customer: "客户",
  wallet: "账户余额",
  proxy: "代理资源",
  order: "订单",
  inventory: "库存资源",
  service_request: "售后申请",
  ticket: "工单",
  notification: "通知",
  scheduled_task: "定时任务",
  email: "邮件",
  auth: "身份认证",
  admin: "管理员",
  system: "系统",

  general: "一般问题",
  billing: "财务问题",
  sales: "售前咨询",
  abuse: "滥用投诉",
  low: "低",
  normal: "普通",
  medium: "中",
  high: "高",
  urgent: "紧急",
  connection: "连接问题",
  account: "账户安全",
  product: "产品咨询",
  technical: "技术支持",
  service: "服务管理",
  renew: "服务续费",
  renewal: "服务续费",
  replace: "更换 IP",
  ip_replacement: "更换 IP",
  reset_traffic: "流量重置",
  node_traffic_reset: "节点流量重置",
  after_sales: "售后服务",
  extraction: "IP 提取通知",
  ticket_reply: "工单回复通知",
  expiry: "服务到期提醒",
  new_order: "新购服务通知",
  provisioning_reminder: "人工开通提醒",

  "auth.login.success": "登录成功",
  "auth.login.failed": "登录失败",
  "auth.logout": "退出登录",
  "customer.update": "修改客户资料",
  "customer.impersonate": "管理员登录客户面板",
  "customer.impersonation.return": "管理员结束模拟登录",
  "customer.credit.update": "调整客户信用额",
  "customer.password.update": "修改客户密码",
  "wallet.adjust": "客户余额调账",
  "proxy.update": "修改代理资料",
  "proxy.bulk_credentials": "批量修改代理账号密码",
  "proxy.bulk_renew_request": "提交批量续费",
  "proxy.bulk_renew_complete": "完成批量续费",
  "service.renew.create": "申请代理续费",
  "service.replace.create": "申请更换代理",
  "service.replace.order_create": "创建更换 IP 订单",
  "node.traffic_reset.order_create": "创建流量重置订单",
  "node.traffic_reset.request": "申请重置节点流量",
  "order.confirm": "确认订单收款",
  "order.cancel": "取消订单",
  "order.fulfill": "提取并发放代理",
  "order.manual_allocate": "管理员手动交付资源",
  "order.refund": "订单退款",
  "order.manual_extraction_required": "库存不足转人工开通",
  "order.wallet_credit_pay": "使用余额与信用额支付订单",
  "order.request_extraction": "客户申请提取代理资源",
  "notification.send": "发送通知",
  "scheduled_task.run": "执行定时任务",
  "admin.create": "创建管理员账户",
  "admin.permissions.update": "修改管理员权限",
  "coupon.create": "创建优惠券",
  "coupon.update": "修改优惠券",
};

const embedded: Array<[RegExp, string]> = [
  [/^scheduled:new-order:[^\s]+$/i, "新购服务通知"],
  [/^scheduled:provisioning-\d+:[^\s]+$/i, "人工开通提醒"],
  [/^scheduled:expiry-\d+:[^\s]+$/i, "服务到期提醒"],
  [/\bstatic-isp\b/gi, "静态住宅 ISP"],
  [/\bresidential\b/gi, "动态住宅代理"],
  [/\bdatacenter\b/gi, "数据中心代理"],
  [/\bsoft-router\b/gi, "软路由中转"],
  [/\bcomputer-node\b/gi, "电脑节点"],
  [/\bnode-traffic-reset\b/gi, "节点流量重置"],
  [/\bwallet-topup\b/gi, "余额充值"],
  [/\bip-replacement\b/gi, "更换 IP"],
  [/\bCity not set\b/gi, "未设置城市"],
];

function translate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (exact[trimmed]) return value.replace(trimmed, exact[trimmed]);
  let next = value;
  for (const [pattern, replacement] of embedded) next = next.replace(pattern, replacement);
  return next;
}

export default function GlobalChineseUiEnhancer() {
  useEffect(() => {
    let scheduled = false;

    function localize() {
      scheduled = false;
      document.querySelectorAll<HTMLElement>(
        "h1,h2,h3,h4,p,span,small,b,strong,em,dt,dd,button,a,option,label,th,td,code"
      ).forEach((node) => {
        if (node.children.length) return;
        const current = node.textContent || "";
        const next = translate(current);
        if (next !== current) {
          node.dataset.originalEnglish = current;
          node.textContent = next;
        }
      });

      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[disabled],input[readonly],textarea[disabled],textarea[readonly]").forEach((field) => {
        const next = translate(field.value);
        if (next !== field.value) field.value = next;
      });

      document.querySelectorAll<HTMLElement>("[title]").forEach((node) => {
        const current = node.title;
        const next = translate(current);
        if (next !== current) node.title = next;
      });
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(localize);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => observer.disconnect();
  }, []);

  return null;
}
