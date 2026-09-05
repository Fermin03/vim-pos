/** `texto` = valor en palabras (una fase, un plan) en vez de una cifra grande. */
export function TarjetaCifra({ titulo, valor, sub, texto }: { titulo: string; valor: string; sub?: string; texto?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className={["mt-1 font-display font-bold tabular-nums", texto ? "text-[17px] leading-snug" : "text-[26px]"].join(" ")}>{valor}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
