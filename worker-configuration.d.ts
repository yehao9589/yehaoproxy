declare interface D1Result<T=unknown>{
  results:T[];
  success:boolean;
  meta:{changes?:number;last_row_id?:number;[key:string]:unknown};
}

declare interface D1PreparedStatement{
  bind(...values:unknown[]):D1PreparedStatement;
  first<T=Record<string,unknown>>():Promise<T|null>;
  all<T=Record<string,unknown>>():Promise<D1Result<T>>;
  raw<T=unknown[]>():Promise<T[]>;
  run<T=Record<string,unknown>>():Promise<D1Result<T>>;
}

declare interface D1Database{
  prepare(sql:string):D1PreparedStatement;
  batch<T=unknown>(statements:D1PreparedStatement[]):Promise<Array<D1Result<T>>>;
  exec(sql:string):Promise<unknown>;
}

declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare module "cloudflare:workers"{
  export const env:Record<string,unknown>&{DB?:D1Database};
}
