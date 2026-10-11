"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { accionTerminal, mensajeErrorTerminal, validarStateMp } from "../../../../lib/terminal";

/**
 * Regreso del OAuth de Mercado Pago (ADR 0033). Llega con ?code&state (o ?error). La ruta es la
 * registrada en Mercado Pago y no se puede mover sin cambiarla allá. Valida el state, canjea el
 * code en terminal-mp-conexion y manda a Terminal de tarjetas.
 */
export default function RegresoMercadoPagoPage() {
  return (
    <Suspense fallback={<PageBody><p className="text-sm text-ink-3">Cargando…</p></PageBody>}>
      <Regreso />
    </Suspense>
  );
}

function Regreso() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (params.get("error")) return setError("No autorizaste el acceso en Mercado Pago. Puedes volver a intentarlo cuando quieras.");
    if (!validarStateMp(params.get("state"))) return setError("La sesión de conexión no es válida. Vuelve a empezar desde Terminal de tarjetas.");
    if (!code) return setError("Mercado Pago no devolvió la autorización. Vuelve a intentarlo.");
    accionTerminal({ accion: "canjear", code })
      .then(() => router.replace("/configuracion/terminal?conectada=1"))
      .catch((e) => setError(mensajeErrorTerminal(e)));
    // Solo al montar: el code vale una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader titulo="Conectar Mercado Pago" migas={[{ label: "Configuración" }, { label: "Terminal de tarjetas", href: "/configuracion/terminal" }, { label: "Conectar" }]} />
      <PageBody>
        {!error && <p className="text-sm text-ink-3">Conectando tu cuenta de Mercado Pago…</p>}
        {error && (
          <div className="max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <p className="text-sm font-medium text-danger" role="alert">{error}</p>
            <div className="mt-4">
              <Link href="/configuracion/terminal"><Button variant="ghost">Volver a Terminal de tarjetas</Button></Link>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
