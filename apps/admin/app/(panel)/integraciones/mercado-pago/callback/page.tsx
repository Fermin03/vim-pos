"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Cargando, Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { accionTerminal, mensajeErrorTerminal, validarStateMp } from "../../../../lib/terminal";
import { accionConexionTienda, esStateDeTienda, mensajeErrorConexionTienda, REGRESO_TIENDA, validarStateTienda } from "../../../../lib/tienda-conexion";

/**
 * Regreso del OAuth de Mercado Pago. Llega con ?code&state (o ?error). La ruta es la registrada en
 * Mercado Pago —en las DOS aplicaciones, la de la terminal (ADR 0033) y la de la tienda en línea
 * (0173)— y no se puede mover sin cambiarla allá. A cuál pertenece la autorización lo dice el
 * `state` que generó este mismo panel: el de la tienda empieza por «tienda.». Cada una valida SU
 * state, canjea contra SU aplicación y vuelve a SU pantalla; no comparten conexión.
 */
export default function RegresoMercadoPagoPage() {
  return (
    <Suspense fallback={<PageBody><Cargando /></PageBody>}>
      <Regreso />
    </Suspense>
  );
}

const TERMINAL = { nombre: "Terminal de tarjetas", ruta: "/configuracion/terminal", migas: [{ label: "Configuración" }, { label: "Terminal de tarjetas", href: "/configuracion/terminal" }, { label: "Conectar" }] };
const TIENDA = { nombre: "Tienda en línea", ruta: "/tienda", migas: [{ label: "Tienda en línea", href: "/tienda" }, { label: "Conectar" }] };

function Regreso() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const state = params.get("state");
  const deTienda = esStateDeTienda(state);
  const destino = deTienda ? TIENDA : TERMINAL;

  useEffect(() => {
    const code = params.get("code");
    if (params.get("error")) return setError("No autorizaste el acceso en Mercado Pago. Puedes volver a intentarlo cuando quieras.");
    if (!(deTienda ? validarStateTienda(state) : validarStateMp(state))) return setError(`La sesión de conexión no es válida. Vuelve a empezar desde ${destino.nombre}.`);
    if (!code) return setError("Mercado Pago no devolvió la autorización. Vuelve a intentarlo.");
    if (deTienda) {
      accionConexionTienda({ accion: "canjear", code })
        .then(() => router.replace(REGRESO_TIENDA))
        .catch((e) => setError(mensajeErrorConexionTienda(e)));
    } else {
      accionTerminal({ accion: "canjear", code })
        .then(() => router.replace("/configuracion/terminal?conectada=1"))
        .catch((e) => setError(mensajeErrorTerminal(e)));
    }
    // Solo al montar: el code vale una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader titulo="Conectar Mercado Pago" migas={destino.migas} />
      <PageBody>
        {!error && <p className="text-sm text-ink-3">Conectando tu cuenta de Mercado Pago…</p>}
        {error && (
          <div className="max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <p className="text-sm font-medium text-danger" role="alert">{error}</p>
            <div className="mt-4">
              <Link href={destino.ruta}><Button variant="ghost">Volver a {destino.nombre}</Button></Link>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
