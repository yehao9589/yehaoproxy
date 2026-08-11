"use client";
type Props={total:number;page:number;pageSize:number;onPage:(page:number)=>void;onPageSize:(size:number)=>void};
export default function Pagination({total,page,pageSize,onPage,onPageSize}:Props){
 const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.min(page,pages),start=total?((current-1)*pageSize+1):0,end=Math.min(current*pageSize,total);
 return <div className="unified-pagination"><span>显示 {start}–{end}，共 {total} 条</span><div><label>每页<select value={pageSize} onChange={e=>onPageSize(Number(e.target.value))}>{[10,20,50,100].map(size=><option value={size} key={size}>{size} 条</option>)}</select></label><button disabled={current<=1} onClick={()=>onPage(current-1)}>上一页</button><b>{current} / {pages}</b><button disabled={current>=pages} onClick={()=>onPage(current+1)}>下一页</button></div></div>
}
