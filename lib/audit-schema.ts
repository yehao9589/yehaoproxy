import {databaseDriver,getRawDatabase} from "../db";

let setup:Promise<void>|null=null;

export function ensureAuditSchema(){
  if(setup)return setup;
  setup=(async()=>{
    const sql=databaseDriver()==="mysql"
      ?"CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)"
      :"CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)";
    try{await getRawDatabase().prepare(sql).run()}catch{/* MySQL 没有 IF NOT EXISTS；索引已存在时安全忽略。 */}
  })();
  return setup;
}
