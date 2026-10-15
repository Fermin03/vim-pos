"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Aviso, Button, DialogoPeligro } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import { useAccesoTenant } from "../../components/admin-shell";
import { Pestanas } from "../../components/pestanas";
import { textoDeAviso } from "../../lib/tienda-cobro";
import { useTienda } from "./use-tienda";

const PESTANAS = [
  { label: "General", href: "/tienda" },
  { label: "Pedidos y pagos", href: "/tienda/pedidos" },
  { label: "Sucursales y horarios", href: "/tienda/sucursales" },
  { label: "Menú", href: "/tienda/menu" },
];

export type Tienda = { t: ReturnType<typeof useTienda>; ocupado: boolean; soloLectura: boolean };

/**
 * Lo común a las pestañas de la Tienda en línea: encabezado, sub-menú, lectura, avisos de cobro y
 * los diálogos de confirmación. Cada pestaña solo pinta sus bloques con lo que recibe. El layout ya
 * decidió que el negocio tiene el complemento.
 *
 * El estado vive en `use-tienda.ts` y cada pestaña lo vuelve a leer al entrar.
 */
export function TiendaMarco({ children }: { children: (c: Tienda) => ReactNode }) {
  const t = useTienda();
  // Servicio suspendido: el panel queda en solo lectura (ADR 0014).
  const soloLectura = useAccesoTenant().nivel === "bloqueado";
  const escribiendo = t.ocupado !== null;
  // Tampoco se guarda nada mientras falte volver a leer después de un guardado.
  const ocupado = escribiendo || t.sinLeer;
  // Regreso de Mercado Pago, ya con la cuenta de la tienda conectada. Se lee al montar: sin useSearchParams no hace falta Suspense.
  const [conectada, setConectada] = useState(false);
  useEffect(() => { setConectada(new URLSearchParams(window.location.search).has("conectada")); }, []);

  return (
    <>
      <PageHeader titulo="Tienda en línea" subtitulo="Recibe los pedidos de tus clientes en tu caja." />
      <PageBody>
        <Pestanas etiqueta="Secciones de la tienda en línea" pestanas={PESTANAS} />
        {t.falloLectura ? (
          <div className="max-w-[720px] rounded-lg border border-line bg-surface p-5" role="alert">
            <p className="text-sm font-medium text-danger">{t.falloLectura}</p>
            <p className="mt-1 text-13 text-ink-2">Tu tienda sigue como estaba. Revisa tu conexión y vuelve a intentar.</p>
            <button type="button" onClick={t.reintentar}
              className="mt-4 h-11 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              Reintentar
            </button>
          </div>
        ) : t.leido === null ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-6">
            {/* TEXTOS PROVISIONALES (los revisa James). */}
            {t.avisoCobro && (
              <Aviso tono="warning" role="alert" className="flex max-w-[720px] flex-wrap items-center gap-x-4 gap-y-2">
                <span className="min-w-0 flex-1 basis-64">{textoDeAviso(t.avisoCobro)}</span>
                {t.avisoCobro.tipo !== "ELEGIR" && t.avisoCobro.tipo !== "PRUEBA" && (
                  <Button variant="ghost" onClick={t.conectarMercadoPago} disabled={ocupado || soloLectura}>
                    {t.avisoCobro.tipo === "RECONECTAR" ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
                  </Button>
                )}
              </Aviso>
            )}
            {conectada && !t.avisoCobro && t.hayCuentaActiva && (
              <Aviso tono="success" role="status" className="max-w-[720px]" onCerrar={() => setConectada(false)}>
                Cuenta de Mercado Pago conectada.{t.leido.config?.pagoEnLinea ? "" : " Ahora marca «Pago en línea» abajo y guarda."}
              </Aviso>
            )}
            {children({ t, ocupado, soloLectura })}
          </div>
        )}
      </PageBody>

      {/* TEXTO PROVISIONAL (lo revisa James). */}
      {t.porDesconectar && (
        <DialogoPeligro
          titulo="¿Desconectar Mercado Pago de tu tienda?"
          consecuencia={
            <>
              Tu tienda dejará de ofrecer el pago en línea donde cobra <b className="text-ink">{t.porDesconectar.cuenta_nombre ?? "esta cuenta"}</b>.
              Tus clientes podrán seguir pidiendo y pagar al recibir. Tu terminal de tarjetas no cambia.
            </>
          }
          error={t.errorDialogo}
          boton="Desconectar"
          ocupado={escribiendo}
          textoOcupado="Desconectando…"
          ancho="sm"
          onConfirmar={() => void t.confirmarDesconectar()}
          onCerrar={t.cerrarDesconectar}
        />
      )}
      {t.dialogo === "apagar" && (
        <DialogoPeligro
          titulo="¿Apagar tu tienda en línea?"
          consecuencia="Tus clientes dejarán de poder pedir. Los pedidos que ya entraron se atienden igual."
          error={t.errorDialogo}
          boton="Apagar"
          ocupado={escribiendo}
          textoOcupado="Apagando…"
          ancho="sm"
          onConfirmar={t.confirmarApagar}
          onCerrar={t.cerrarDialogo}
        />
      )}

      {t.dialogo === "direccion" && (
        <DialogoPeligro
          titulo="¿Cambiar la dirección de tu tienda?"
          consecuencia="Dejarán de funcionar los códigos QR que ya imprimiste y los enlaces de seguimiento de los pedidos en curso."
          error={t.errorDialogo}
          boton="Cambiar dirección"
          ocupado={escribiendo}
          textoOcupado="Cambiando…"
          ancho="sm"
          onConfirmar={t.confirmarDireccion}
          onCerrar={t.cerrarDialogo}
        />
      )}
    </>
  );
}
