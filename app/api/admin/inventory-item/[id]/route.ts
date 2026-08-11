import { NextResponse } from "next/server";

const removed = () =>
  NextResponse.json({ error: "库存中心功能已移除" }, { status: 410 });

export const GET = removed;
export const POST = removed;
export const PATCH = removed;
