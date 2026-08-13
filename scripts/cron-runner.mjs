const url=process.env.CRON_URL||"http://yehaoproxy:3000/api/cron/reminders";
const secret=process.env.CRON_SECRET||"";
const interval=Math.max(30000,Number(process.env.CRON_INTERVAL_MS||60000));
if(!secret){console.error("CRON_SECRET 未配置，定时任务执行器拒绝启动");process.exit(1)}
async function run(){
  try{
    const response=await fetch(url,{method:"POST",headers:{authorization:`Bearer ${secret}`,"x-yehaoproxy-scheduler":"container"}});
    if(!response.ok)console.error(`YehaoProxy scheduled task failed: ${response.status}`,await response.text());
    else console.log("YehaoProxy scheduled task completed",new Date().toISOString());
  }catch(error){console.error("YehaoProxy scheduler waiting for application",error instanceof Error?error.message:error)}
}
setTimeout(run,10000);setInterval(run,interval);console.log(`YehaoProxy scheduler started, interval ${interval}ms`);
