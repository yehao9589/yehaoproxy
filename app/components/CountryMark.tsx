import type { ReactNode } from "react";
import { countryMarkCode } from "../../lib/countries";
import ConsoleIcon from "./ConsoleIcon";

export default function CountryMark({ country }: { country?: string | null }) {
  const code = countryMarkCode(country);
  if (code) return <span aria-hidden="true" className={`country-mark fi fi-${code.toLowerCase()}`} />;
  if (/^(global|multi|全局节点|全局服务|多个地区)$/i.test(country?.trim() || "")) {
    return <ConsoleIcon className="country-mark-global" name="globe" />;
  }
  return null;
}

/** Keep the country text readable and accessible even when no marker is available. */
export function CountryLabel({ country, children }: { country?: string | null; children: ReactNode }) {
  return <span className="country-label" title={typeof children==="string"?children:undefined}><CountryMark country={country}/><span>{children}</span></span>;
}
