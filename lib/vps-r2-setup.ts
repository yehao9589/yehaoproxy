import type {PublicR2BackupSettings} from "./vps-r2";

type SetupSettings=Pick<PublicR2BackupSettings,"enabled"|"accessKeyConfigured"|"secretConfigured"|"encryptionKeyConfigured"|"keyExportedAt">;

export function getR2SetupState(settings:SetupSettings,draftEnabled=settings.enabled,dirty=false){
  const credentialsReady=settings.accessKeyConfigured&&settings.secretConfigured;
  const keyReady=Boolean(settings.encryptionKeyConfigured&&settings.keyExportedAt);
  const missingKey=!keyReady;
  const title=missingKey?"暂不能启用：请先下载备份解密密钥":!credentialsReady?"还需填写并保存 R2 访问配置":dirty?"设置尚未保存，修改还未生效":settings.enabled?"R2 异地备份已启用":"准备已完成，请打开开关并保存";
  const description=missingKey?"这是备份的解密钥匙，与 Cloudflare 的访问密钥不同。请先下载 JSON 文件并单独保存到电脑，再启用下方开关。":!credentialsReady?"请在下方填写 Account ID、存储桶和两项访问密钥；保存后才会用于上传。":dirty?draftEnabled&&!settings.enabled?"请点击底部「保存并启用 R2」，保存成功后才会自动上传新备份。":"请点击底部「保存 R2 设置」。保存前仍沿用原来的设置。":settings.enabled?"之后生成的本地备份会自动加密上传；历史备份可在下方「备份仓库」逐条上传。":"解密密钥已导出，R2 访问配置已保存。打开下方开关后，还需点击底部「保存并启用 R2」。";
  const switchHelp=missingKey?"开关已锁定：先点击上方「先下载解密密钥」。":draftEnabled&&!settings.enabled?"尚未生效：请点击底部「保存并启用 R2」。":!draftEnabled&&settings.enabled?"关闭操作尚未保存，当前仍按已启用设置运行。":settings.enabled?"已生效：新备份将自动加密上传。":"打开开关后请保存，才会开始自动上传。";
  return {credentialsReady,keyReady,title,description,switchHelp,tone:settings.enabled&&credentialsReady&&keyReady&&!dirty?"success":"attention",saveLabel:draftEnabled&&!settings.enabled?"保存并启用 R2":"保存 R2 设置",steps:[{label:"填写并保存 R2 配置",complete:credentialsReady},{label:"下载并单独保管解密密钥",complete:keyReady},{label:"打开开关并保存启用",complete:settings.enabled}]};
}
