/** Solo CSS: la demo es para tableta en horizontal o computadora. */
const CAPA = "fixed inset-0 z-[9999] hidden flex-col items-center justify-center gap-2 bg-bg p-8 text-center";

export function AvisoPantalla() {
  return (
    <>
      <div role="alert" className={`${CAPA} max-[599px]:flex`}>
        <p className="font-display text-xl font-semibold tracking-tight">La caja necesita más pantalla.</p>
        <p className="text-sm text-ink-3">Abre este enlace en una tableta o computadora.</p>
      </div>
      <div role="alert" className={`${CAPA} min-[600px]:portrait:flex`}>
        <p className="font-display text-xl font-semibold tracking-tight">Gira tu tableta.</p>
        <p className="text-sm text-ink-3">La caja se usa en horizontal.</p>
      </div>
    </>
  );
}
