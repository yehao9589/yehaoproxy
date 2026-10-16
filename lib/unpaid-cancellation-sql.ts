type Item={id:string;adminNote:string|null;product:string;region:string;quantity:number};
export function unpaidCancellationStatements(order:Item,children:Item[],stockItems:Item[],now:Date,token:string){
 const stamp=Math.floor(now.getTime()/1000),marker=`[AUTO_CANCELLED_AT]${now.toISOString()}\n[AUTO_CANCEL_TOKEN]${token}`,note=`${order.adminNote||""}\n${marker}`,key=`auto_cancel_claim:${token}`;
 const claim="EXISTS (SELECT 1 FROM system_options WHERE \"key\"=? AND value=?)";
 const batch:{sql:string;params:(string|number)[]}[]=[
  {sql:"UPDATE orders SET status='failed',updated_at=?,admin_note=? WHERE id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM payment_transactions WHERE order_id=? AND status IN ('succeeded','refunded'))",params:[stamp,note,order.id,order.id]},
  {sql:"INSERT INTO system_options (\"key\",value,updated_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND status='failed' AND admin_note=?)",params:[key,token,stamp,order.id,note]},
 ];
 for(const child of children)batch.push({sql:`UPDATE orders SET status='failed',updated_at=?,admin_note=? WHERE id=? AND status='pending' AND ${claim}`,params:[stamp,`${child.adminNote||""}\n${marker}`,child.id,key,token]});
 for(const item of stockItems)batch.push({sql:`UPDATE product_offers SET sold=max(0,sold-?),updated_at=? WHERE product=? AND region=? AND ${claim}`,params:[item.quantity,stamp,item.product,item.region,key,token]});
 batch.push({sql:`UPDATE coupons SET used_count=max(0,used_count-1) WHERE id IN (SELECT coupon_id FROM coupon_redemptions WHERE order_id=?) AND ${claim}`,params:[order.id,key,token]});
 batch.push({sql:`DELETE FROM coupon_redemptions WHERE order_id=? AND ${claim}`,params:[order.id,key,token]});
 batch.push({sql:'DELETE FROM system_options WHERE "key"=? AND value=?',params:[key,token]});
 return batch;
}
