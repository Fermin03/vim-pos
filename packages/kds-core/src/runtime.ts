"use client";
// Resolución del endpoint del backend. Igual que en el POS: en el escritorio (Electron) el
// shell inyecta window.__VIM_SUPABASE_URL (gateway del hub — local en la caja, REMOTO por LAN en
// la cocina). En navegador/nube cae al env de build de la app que consume el paquete (Next inlina
// el env por-app). Un solo mecanismo, dos destinos.
const runtime =
  typeof window !== "undefined"
    ? (window as unknown as { __VIM_SUPABASE_URL?: string; __VIM_SUPABASE_ANON?: string })
    : undefined;

// Fallback inofensivo (localhost del gateway) SOLO para que createClient no lance en build/prerender
// (donde no hay window ni env). En runtime, la inyección del window (desktop) o el env (web) ganan.
export const SUPABASE_URL = runtime?.__VIM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54350";
export const SUPABASE_ANON = runtime?.__VIM_SUPABASE_ANON || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "local-anon";
