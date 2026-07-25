import{NextResponse}from"next/server";import{getSiteConfig}from"../../../lib/site-config";
export async function GET(){return NextResponse.json(await getSiteConfig(),{headers:{"cache-control":"no-store"}})}
