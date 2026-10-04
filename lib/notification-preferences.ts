export const notificationTopics={expiry:"到期与续费提醒",purchase:"新购订单提醒",service:"服务开通与进度",renewal:"续费结果",aftersales:"售后进度",ticket:"工单回复与提醒",billing:"账单与信用提醒"};
export type NotificationTopic=keyof typeof notificationTopics;
export type NotificationPreferences={email:boolean;site:boolean;topics:Record<NotificationTopic,{email:boolean;site:boolean}>};
export function normalizePreferences(input:unknown):NotificationPreferences{
 const v=(input&&typeof input==="object"?input:{}) as Partial<NotificationPreferences>;
 return {email:typeof v.email==="boolean"?v.email:true,site:typeof v.site==="boolean"?v.site:true,topics:Object.fromEntries(Object.keys(notificationTopics).map(key=>{const item=v.topics?.[key as NotificationTopic];return [key,{email:typeof item?.email==="boolean"?item.email:true,site:typeof item?.site==="boolean"?item.site:true}]})) as NotificationPreferences["topics"]};
}
export function notificationAllowed(preferences:NotificationPreferences,topic:NotificationTopic,channel:"email"|"site"){return preferences[channel]&&preferences.topics[topic][channel]}
