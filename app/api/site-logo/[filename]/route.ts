import {readFile} from "node:fs/promises";
import path from "node:path";
import {NextResponse} from "next/server";

const contentTypes:Record<string,string>={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp"};

function uploadDirectory(){
  const projectRoot=process.env.SITE_PROJECT_ROOT||process.env.INIT_CWD||process.cwd();
  return process.env.SITE_UPLOAD_DIR||path.join(projectRoot,"public","uploads","site");
}

export async function GET(_request:Request,{params}:{params:Promise<{filename:string}>}){
  const filename=String((await params).filename||"");
  const match=filename.match(/^logo-[a-zA-Z0-9.-]+\.(png|jpe?g|webp)$/i);
  if(!match)return NextResponse.json({error:"Logo 文件不存在"},{status:404});
  try{
    const bytes=await readFile(path.join(uploadDirectory(),path.basename(filename)));
    return new NextResponse(bytes,{headers:{"content-type":contentTypes[match[1].toLowerCase()]||"application/octet-stream","cache-control":"public, max-age=31536000, immutable","x-content-type-options":"nosniff"}});
  }catch{return NextResponse.json({error:"Logo 文件不存在"},{status:404})}
}
