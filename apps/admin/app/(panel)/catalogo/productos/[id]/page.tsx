"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { ProductoForm } from "../../../../components/producto-form";
import { ProductoModificadores } from "../../../../components/producto-modificadores";
import { ProductoVariantes } from "../../../../components/producto-variantes";
import { useModulos } from "../../../../components/admin-shell";
import { conExistencias } from "../../../../lib/operacion";
import { obtenerProducto, type Producto } from "../../../../lib/catalogo";

export default function EditarProductoPage() {
  const params = useParams<{ id: string }>();
  const [prod, setProd] = useState<Producto | null | undefined>(undefined);
  // Los modificadores marcados y aún sin guardar: "Guardar cambios" los guarda antes de salir.
  const modsPendientes = useRef<(() => Promise<void>) | null>(null);
  const registrarPendiente = useCallback((fn: (() => Promise<void>) | null) => {
    modsPendientes.current = fn;
  }, []);
  // Las variantes (tallas y colores) se guardan igual, después de los modificadores.
  const varPendientes = useRef<(() => Promise<void>) | null>(null);
  const registrarVariantes = useCallback((fn: (() => Promise<void>) | null) => {
    varPendientes.current = fn;
  }, []);
  const guardarTodo = useCallback(async () => {
    await modsPendientes.current?.();
    await varPendientes.current?.();
  }, []);
  const tienda = conExistencias(useModulos());

  useEffect(() => {
    obtenerProducto(params.id)
      .then(setProd)
      .catch(() => setProd(null));
  }, [params.id]);

  return (
    <>
      <PageHeader
        titulo={prod ? prod.nombre : "Editar producto"}
        migas={[
          { label: "Catálogo" },
          { label: "Productos", href: "/catalogo/productos" },
          { label: prod ? prod.nombre : "Editar" },
        ]}
        right={prod ? <Link className="text-sm font-semibold text-ink underline underline-offset-2" href={`/catalogo/recetas/${prod.id}`}>Receta y costo</Link> : undefined}
      />
      <PageBody>
        {prod === undefined && <p className="text-sm text-ink-2">Cargando…</p>}
        {prod === null && <p className="text-sm text-danger">Producto no encontrado.</p>}
        {prod && (
          <ProductoForm
            producto={prod}
            guardarTambien={guardarTodo}
            extra={
              <>
                {tienda && !prod.controla_existencias && <ProductoVariantes producto={prod} onPendiente={registrarVariantes} />}
                <ProductoModificadores productoId={prod.id} onPendiente={registrarPendiente} />
              </>
            }
          />
        )}
      </PageBody>
    </>
  );
}
