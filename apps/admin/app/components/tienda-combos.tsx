import Link from "next/link";
import { Aviso } from "@vim/ui/styles";
import { Tarjeta } from "./tarjeta";
import type { ComboNoComprable } from "../lib/tienda-combos";

const lista = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Aviso: combos que en la caja se venden pero en la tienda nadie puede completar. Solo existe si hay alguno. */
export function TiendaCombos({ combos }: { combos: ComboNoComprable[] }) {
  if (combos.length === 0) return null;
  return (
    <Tarjeta titulo="Combos que tus clientes no pueden pedir" descripcion="En la caja se pueden vender, pero en la tienda no se puede elegir el mismo producto dos veces en un combo.">
      <ul className="flex flex-col gap-2">
        {combos.map((c, i) => (
          <li key={i}>
            <Aviso tono="warning">
              «{c.combo}»: los pasos {lista(c.pasos)} solo ofrecen «{c.producto}». Agrega otra opción a uno de esos pasos, o vuelve opcional uno de ellos, en{" "}
              <Link href="/catalogo/combos" className="whitespace-nowrap font-semibold underline underline-offset-2">Catálogo → Combos</Link>.
            </Aviso>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
