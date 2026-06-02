"use client";
import { PageHeader, PageBody, type Miga } from "./page-header";

/** Placeholder de módulo aún no construido (se reemplaza al implementar cada rebanada de F4). */
export function EnConstruccion({
  titulo,
  fase,
  migas,
}: {
  titulo: string;
  fase: string;
  migas?: Miga[];
}) {
  return (
    <>
      <PageHeader titulo={titulo} migas={migas} />
      <PageBody>
        <div className="rounded-lg border border-dashed border-line-strong bg-surface p-8 text-center">
          <p className="font-display text-base font-semibold">Módulo en construcción</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
            <b>{titulo}</b> se implementa en <b>{fase}</b>, siguiendo los mockups aprobados.
          </p>
        </div>
      </PageBody>
    </>
  );
}
