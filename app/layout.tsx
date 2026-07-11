import type { Metadata } from "next";
import "./globals.css";
import "./portal.css";

export const metadata: Metadata = {
  title: "YehaoProxy｜全球企业级代理 IP",
  description: "静态住宅 ISP、动态住宅与数据中心代理 IP，一站式采购。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
