export function creditRepaymentPlan(bills:{id:string;amount:number;repaidAmount:number}[],amount:number){
 if(!Number.isFinite(amount)||amount<=0)throw new Error("Invalid repayment amount");
 let remaining=Math.round(amount*100);
 const updates:{id:string;repaidAmount:number;status:"paid"|"partial"}[]=[];
 for(const bill of bills){
  const owed=Math.max(0,Math.round(bill.amount*100)-Math.round(bill.repaidAmount*100));
  const applied=Math.min(remaining,owed);
  if(!applied)continue;
  const paid=Math.round(bill.repaidAmount*100)+applied;
  updates.push({id:bill.id,repaidAmount:paid/100,status:paid>=Math.round(bill.amount*100)?"paid":"partial"});
  remaining-=applied;
 }
 return{updates,repaid:(Math.round(amount*100)-remaining)/100,remainder:remaining/100};
}
