"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { establecerPassword, leerSesion } from "../../../lib/supabase";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

export default function SeguridadPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    leerSesion().then((s) => s && setEmail(s.email));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (pass.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pass !== pass2) { setError("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    try {
      await establecerPassword(pass);
      setOk(true);
      setPass("");
      setPass2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader titulo="Seguridad" subtitulo="Cambia la contraseña con la que entras a tu panel." />
      <PageBody>
        <form onSubmit={onSubmit} noValidate className="max-w-[420px] rounded-lg border border-line bg-surface p-6">
          {email && (
            <p className="mb-5 text-[13px] text-ink-2">
              Cuenta: <b>{email}</b>
            </p>
          )}
          <div className="mb-4">
            <label className={label} htmlFor="np">Nueva contraseña</label>
            <input id="np" type={ver ? "text" : "password"} autoComplete="new-password" placeholder="Mínimo 8 caracteres"
              className={input} value={pass} onChange={(e) => { setPass(e.target.value); setOk(false); }} />
          </div>
          <div className="mb-4">
            <label className={label} htmlFor="np2">Confirmar contraseña</label>
            <input id="np2" type={ver ? "text" : "password"} autoComplete="new-password" placeholder="Repite la contraseña"
              className={input} value={pass2} onChange={(e) => { setPass2(e.target.value); setOk(false); }} />
          </div>
          <label className="mb-5 flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar contraseñas
          </label>

          {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
          {ok && <p className="mb-4 text-sm font-medium text-success" role="status">Contraseña actualizada. La usarás la próxima vez que entres.</p>}

          <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Cambiar contraseña"}</Button>
        </form>
      </PageBody>
    </>
  );
}
