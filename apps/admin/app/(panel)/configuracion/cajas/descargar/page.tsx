import Link from "next/link";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { fechaLarga, leerInstalador, RESPALDO_URL } from "../../../../lib/instalador";

// Se lee el manifiesto en cada visita: el botón siempre apunta a la última versión publicada.
export const dynamic = "force-dynamic";

/**
 * Descargar VIM POS para la computadora de la caja (0142). Server component: el `latest.json` es
 * público y se lee aquí, en el servidor, así que no depende de la CSP del navegador. Si no
 * responde, el botón lleva a la página de la última versión en GitHub.
 */
export default async function DescargarCajaPage() {
  const inst = await leerInstalador();
  const fecha = fechaLarga(inst?.fecha ?? null);

  return (
    <>
      <PageHeader
        titulo="Instala VIM POS en tu caja"
        subtitulo="El programa de la caja cobra, imprime y guarda tus ventas aunque se vaya el internet."
        migas={[{ label: "Configuración" }, { label: "Cajas", href: "/configuracion/cajas" }, { label: "Descargar" }]}
      />
      <PageBody>
        <div className="flex max-w-[760px] flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-18 font-semibold tracking-tight">VIM POS para Windows</h2>
              <p className="mt-0.5 text-13 text-ink-2">
                {inst ? (
                  <>Versión {inst.version}{fecha ? ` · publicada el ${fecha}` : ""}</>
                ) : (
                  <>Te llevamos a la página de la última versión; ahí descarga el archivo que termina en <b>.exe</b>.</>
                )}
              </p>
            </div>
            <a
              href={inst?.url ?? RESPALDO_URL}
              {...(inst ? { download: "" } : { target: "_blank", rel: "noopener noreferrer" })}
              className="inline-flex h-12 flex-shrink-0 items-center justify-center gap-2 rounded bg-accent px-6 text-15 font-semibold text-white transition-transform duration-150 ease-vim hover:bg-accent-hover active:scale-[.97]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              Descargar VIM POS
            </a>
          </section>

          <section>
            <h2 className="mb-2 font-display text-15 font-semibold">Lo que necesitas</h2>
            <ul className="flex flex-col gap-2 text-14 text-ink-2">
              <li><b className="text-ink">Una computadora con Windows 10 u 11 de 64 bits.</b> No hace falta que sea nueva.</li>
              <li><b className="text-ink">Internet para conectarla la primera vez.</b> Después sigue cobrando aunque se vaya el internet, y sube las ventas cuando regresa.</li>
              <li>
                <b className="text-ink">Una impresora térmica de tickets de 80 mm</b> compatible con ESC/POS, de red (cable Ethernet o Wi-Fi)
                o de USB. <b className="text-ink">Funcionan las dos.</b> Por ejemplo, la Epson TM-T20III o la TM-m30. Si es de red, al comprar
                pide que diga «Ethernet» o «LAN»; si es de USB, se instala primero en Windows.
              </li>
              <li><b className="text-ink">Un cajón de dinero conectado a la impresora</b>, que se abre solo al cobrar.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-display text-15 font-semibold">Paso a paso</h2>
            <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-14 text-ink-2 marker:font-semibold marker:text-ink">
              <li>En la computadora de la caja, entra a este panel y presiona <b className="text-ink">Descargar VIM POS</b>.</li>
              <li>
                Abre el archivo descargado. Windows puede mostrar un aviso azul que dice <b className="text-ink">«Windows protegió tu PC»</b>:
                sale porque el instalador todavía no lleva firma digital, no porque tenga algo malo. Presiona{" "}
                <b className="text-ink">Más información</b> y luego <b className="text-ink">Ejecutar de todas formas</b>.
              </li>
              <li>Sigue el instalador hasta el final. Tarda un par de minutos.</li>
              <li>Abre <b className="text-ink">VIM POS</b> con el ícono que quedó en el escritorio.</li>
              <li>
                Aquí en el panel, ve a{" "}
                <Link href="/configuracion/cajas" className="font-semibold text-ink underline underline-offset-2">Configuración → Cajas</Link>,
                presiona <b className="text-ink">Vincular</b> en tu caja y captura en VIM POS el <b className="text-ink">identificador</b> y la{" "}
                <b className="text-ink">clave</b> que te mostramos. Solo se hace una vez.
              </li>
            </ol>
          </section>

          <section className="rounded-lg border border-line bg-sel p-4 text-14 text-ink-2">
            <b className="text-ink">¿Tienes pantalla en la cocina?</b> El instalador deja también un segundo acceso,{" "}
            <b className="text-ink">VIM POS Cocina</b>. Instala VIM POS en la computadora de la cocina (conectada a la misma red que la caja) y
            abre ese acceso para ver ahí los pedidos en lugar de imprimir comandas.
          </section>
        </div>
      </PageBody>
    </>
  );
}
