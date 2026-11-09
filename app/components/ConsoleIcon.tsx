import type {SVGProps} from "react";

const shapes = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/></>,
  layers: <><path d="m12 3 10 5-10 5L2 8l10-5Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/></>,
  orders: <><rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></>,
  renew: <><path d="M3 10a9 9 0 0 1 15-6l3 3M21 3v4h-4M21 14a9 9 0 0 1-15 6l-3-3M3 21v-4h4"/></>,
  server: <><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M12 6.5h5M12 17.5h5"/></>,
  wallet: <><path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M20 11h-6v6h6M16.5 14h.01"/></>,
  support: <><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 12H2v7h4v-7H4Zm16 0h2v7h-4v-7h2ZM20 19a3 3 0 0 1-3 3h-3"/></>,
  settings: <><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3H9Z"/><circle cx="12" cy="11" r="3"/></>,
  users: <><circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 3a4 4 0 0 1 0 8M19 15a5 5 0 0 1 3 5v1"/></>,
  search: <><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></>,
  plus: <path d="M12 4v16M4 12h16"/>,
  chart: <><path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  chevron: <path d="m8 4 8 8-8 8"/>,
  logout: <><path d="M10 3H4v18h6M10 12h11m-5-5 5 5-5 5"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  network: <><rect x="8" y="2" width="8" height="6" rx="1"/><path d="M12 8v5M4 16v-3h16v3M12 13v3"/><rect x="1" y="16" width="6" height="6" rx="1"/><rect x="9" y="16" width="6" height="6" rx="1"/><rect x="17" y="16" width="6" height="6" rx="1"/></>,
  calendar: <><rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M8 15h2M14 15h2M8 18h2"/></>,
} satisfies Record<string, React.ReactNode>;

export type ConsoleIconName = keyof typeof shapes;

/** One quiet outline family for customer and administrator console navigation. */
export default function ConsoleIcon({name,className,...props}:{name:ConsoleIconName}&SVGProps<SVGSVGElement>){
  return <svg className={`console-icon${className?` ${className}`:""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{shapes[name]}</svg>;
}
