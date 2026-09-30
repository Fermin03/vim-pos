import { NextResponse } from "next/server";

// La URL y la llave PÚBLICA de Supabase, para que el navegador pueda iniciar sesión (A8).
//
// Se sirven desde aquí y no con variables NEXT_PUBLIC_* porque esas se hornean al construir, y el
// proyecto de Vercel del panel solo garantiza las del servidor (SUPABASE_URL y SUPABASE_ANON_KEY,
// que ya usa /api/provisionar). La llave anon es pública por diseño: no abre nada que RLS no deje.
export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "SERVIDOR_SIN_CONFIG" }, { status: 500 });
  return NextResponse.json({ url, anon }, { headers: { "Cache-Control": "no-store" } });
}
