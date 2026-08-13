export function normalizeCouponCode(value:unknown){
  return String(value??"").normalize("NFKC").replace(/[‐‑‒–—―−]/g,"-").replace(/\s+/g,"").toUpperCase();
}
export function validCouponCode(value:string){return /^[A-Z0-9_%\-]{3,30}$/.test(value)}
