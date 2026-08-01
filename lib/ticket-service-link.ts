export type TicketServiceLink={kind:"proxy"|"node";id:string};

const marker=/^\[RELATED_SERVICE\](proxy|node):([^\n]+)\n?/;

export function encodeTicketServiceLink(link:TicketServiceLink|null,body:string){
  return link?`[RELATED_SERVICE]${link.kind}:${link.id}\n${body}`:body;
}

export function parseTicketServiceLink(body:string):TicketServiceLink|null{
  const match=body.match(marker);
  return match?{kind:match[1] as TicketServiceLink["kind"],id:match[2].trim()}:null;
}

export function stripTicketServiceLink(body:string){
  return body.replace(marker,"");
}
