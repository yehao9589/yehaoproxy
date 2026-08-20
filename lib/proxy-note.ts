type ProxyNoteKey = "CITY" | "ACTIVATED_AT";

export function proxyNoteValue(note: string | null | undefined, key: ProxyNoteKey) {
  return String(note || "").match(new RegExp(`\\[${key}\\]([^\\n]*)`))?.[1]?.trim() || "";
}

export function visibleProxyNote(note: string | null | undefined) {
  return String(note || "")
    .replace(/^\[(?:CITY|ACTIVATED_AT)\][^\n]*$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function composeProxyNote(
  visible: string,
  existingNote: string | null | undefined,
  city?: string,
) {
  const cleanVisible = visibleProxyNote(visible);
  const savedCity = city === undefined ? proxyNoteValue(existingNote, "CITY") : city.trim();
  const activatedAt = proxyNoteValue(existingNote, "ACTIVATED_AT");
  return [
    cleanVisible,
    savedCity ? `[CITY]${savedCity}` : "",
    activatedAt ? `[ACTIVATED_AT]${activatedAt}` : "",
  ].filter(Boolean).join("\n") || null;
}
