"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Aviso } from "@vim/ui/styles";
import { mensajeAuth } from "../lib/cliente-auth";
import { input, label } from "../lib/formato";

/** Seis dígitos, sin espacios: lo que se pega de una app a veces trae "123 456". */
function soloDigitos(v: string): string {
  return v.replace(/\D/g, "").slice(0, 6);
}

function CampoCodigo({ valor, onCambiar, onEnviar, id }: { valor: string; onCambiar: (v: string) => void; onEnviar: () => void; id: string }) {
  return (
    <input
      id={id}
      className={`${input} text-center font-mono text-20 tracking-[0.3em]`}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      value={valor}
      onChange={(e) => onCambiar(soloDigitos(e.target.value))}
      onKeyDown={(e) => e.key === "Enter" && valor.length === 6 && onEnviar()}
      autoFocus
    />
  );
}

/**
 * Pide el código de la app autenticadora de una cuenta que ya tiene su factor dado de alta.
 */
export function CodigoSegundoFactor({ sb, onListo }: { sb: SupabaseClient; onListo: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function verificar() {
    setError(null);
    setOcupado(true);
    try {
      const { data } = await sb.auth.mfa.listFactors();
      const factor = data?.totp?.[0];
      if (!factor) throw new Error("Esta cuenta no tiene app autenticadora dada de alta.");
      const { error: e } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo });
      if (e) throw e;
      onListo();
    } catch (e) {
      setError(mensajeAuth(e as { message?: string; code?: string }));
      setCodigo("");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <label className={label} htmlFor="sf-codigo">Código de tu app autenticadora</label>
      <CampoCodigo id="sf-codigo" valor={codigo} onCambiar={setCodigo} onEnviar={() => void verificar()} />
      {error && <Aviso tono="danger" role="alert" className="mt-3">{error}</Aviso>}
      <button onClick={() => void verificar()} disabled={ocupado || codigo.length !== 6} className="btn mt-4 h-11 w-full rounded bg-ink text-14 font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {ocupado ? "Verificando…" : "Entrar"}
      </button>
    </div>
  );
}

/**
 * Da de alta la app autenticadora (TOTP): muestra el QR y pide el primer código para confirmar que
 * quedó bien. Solo después de ese código la cuenta sube a `aal2` y el servidor la deja pasar.
 */
export function AltaSegundoFactor({ sb, onListo }: { sb: SupabaseClient; onListo: () => void }) {
  const [alta, setAlta] = useState<{ factorId: string; qr: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    // En modo estricto React monta dos veces: sin esto se darían de alta dos factores.
    if (iniciado.current) return;
    iniciado.current = true;
    void (async () => {
      try {
        // Un alta a medias (se cerró la pestaña antes del código) deja un factor sin verificar
        // que bloquea el siguiente: se limpia antes de empezar.
        const { data: fs } = await sb.auth.mfa.listFactors();
        for (const f of fs?.all ?? []) {
          if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data, error: e } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Panel VIM ${new Date().toISOString().slice(0, 10)}` });
        if (e) throw e;
        setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
      } catch (e) {
        setError(mensajeAuth(e as { message?: string; code?: string }));
      }
    })();
  }, [sb]);

  async function confirmar() {
    if (!alta) return;
    setError(null);
    setOcupado(true);
    try {
      const { error: e } = await sb.auth.mfa.challengeAndVerify({ factorId: alta.factorId, code: codigo });
      if (e) throw e;
      onListo();
    } catch (e) {
      setError(mensajeAuth(e as { message?: string; code?: string }));
      setCodigo("");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <p className="text-13 leading-snug text-ink-2">
        Escanea este código con tu app autenticadora (Google Authenticator, Microsoft Authenticator,
        1Password…). Cada vez que entres al panel te pedirá el número de seis dígitos que muestre.
      </p>
      {alta ? (
        <>
          {/* El QR viene de Supabase como SVG en data: — la CSP del panel ya permite img data:. */}
          <img src={alta.qr} alt="Código QR para la app autenticadora" className="mx-auto my-4 h-44 w-44 rounded border border-line bg-white p-2" />
          <p className="mb-4 text-center text-12 text-ink-3">
            ¿No puedes escanear? Escribe esta clave en la app: <span className="select-all break-all font-mono text-ink-2">{alta.secreto}</span>
          </p>
          <label className={label} htmlFor="sf-alta">Escribe el código que muestra la app</label>
          <CampoCodigo id="sf-alta" valor={codigo} onCambiar={setCodigo} onEnviar={() => void confirmar()} />
        </>
      ) : !error ? (
        <p className="my-6 text-center text-13 text-ink-3">Preparando el código…</p>
      ) : null}
      {error && <Aviso tono="danger" role="alert" className="mt-3">{error}</Aviso>}
      {alta && (
        <button onClick={() => void confirmar()} disabled={ocupado || codigo.length !== 6} className="btn mt-4 h-11 w-full rounded bg-ink text-14 font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {ocupado ? "Verificando…" : "Confirmar y entrar"}
        </button>
      )}
    </div>
  );
}
