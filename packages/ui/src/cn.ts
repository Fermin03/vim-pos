// Une clases condicionalmente (sin dependencias). Filtra falsy.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
