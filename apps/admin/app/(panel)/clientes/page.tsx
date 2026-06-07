"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import {
  actualizarCliente,
  cambiarEstadoCliente,
  clienteSchema,
  crearCliente,
  eliminarCliente,
  listarClientes,
  type Cliente,
} from "../../lib/clientes";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

type FormDatos = {
  nombre: string; apellido_paterno: string; telefono: string; email: string; rfc: string;
  razon_social: string; codigo_postal_fiscal: string;
  tipo_fiscal: "PERSONA_FISICA" | "PERSONA_MORAL" | "EVENTUAL"; notas_internas: string;
};
const VACIO: FormDatos = {
  nombre: "", apellido_paterno: "", telefono: "", email: "", rfc: "",
  razon_social: "", codigo_postal_fiscal: "", tipo_fiscal: "PERSONA_FISICA", notas_internas: "",
};

const TIPOS = [
  { v: "PERSONA_FISICA", l: "Persona física" },
  { v: "PERSONA_MORAL", l: "Persona moral" },
  { v: "EVENTUAL", l: "Eventual" },
];

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; datos: typeof VACIO } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function recargar(b = busqueda) {
    try {
      setClientes(await listarClientes(b));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setClientes([]);
    }
  }
  useEffect(() => {
    recargar("");
  }, []);

  function nuevo() {
    setError(null);
    setEditando({ id: null, datos: { ...VACIO } });
  }
  function editar(c: Cliente) {
    setError(null);
    setEditando({
      id: c.id,
      datos: {
        nombre: c.nombre, apellido_paterno: c.apellido_paterno ?? "", telefono: c.telefono ?? "",
        email: c.email ?? "", rfc: c.rfc ?? "", razon_social: c.razon_social ?? "",
        codigo_postal_fiscal: c.codigo_postal_fiscal ?? "", tipo_fiscal: c.tipo_fiscal, notas_internas: c.notas_internas ?? "",
      },
    });
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    const parsed = clienteSchema.safeParse(editando.datos);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setGuardando(true);
    try {
      if (editando.id) await actualizarCliente(editando.id, parsed.data);
      else await crearCliente(parsed.data);
      setOkMsg("Cliente guardado.");
      setTimeout(() => setOkMsg(null), 2500);
      setEditando(null);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarBloqueo(c: Cliente) {
    try {
      await cambiarEstadoCliente(c.id, c.estado === "ACTIVO" ? "BLOQUEADO" : "ACTIVO");
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    }
  }

  async function borrar(c: Cliente) {
    if (!confirm(`¿Eliminar a "${c.nombre}"?`)) return;
    try {
      await eliminarCliente(c.id);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  function set<K extends keyof typeof VACIO>(k: K, v: (typeof VACIO)[K]) {
    if (editando) setEditando({ ...editando, datos: { ...editando.datos, [k]: v } });
  }

  return (
    <>
      <PageHeader
        titulo="Clientes"
        subtitulo="Datos de clientes frecuentes para facturación y CRM."
        right={<Button onClick={nuevo}>Nuevo cliente</Button>}
      />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && !editando && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

        <div className="mb-4 max-w-sm">
          <input
            className={input}
            value={busqueda}
            placeholder="Buscar por nombre, teléfono, RFC o correo…"
            onChange={(e) => {
              setBusqueda(e.target.value);
              recargar(e.target.value);
            }}
          />
        </div>

        {clientes === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {clientes && clientes.length === 0 && !editando && (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-[15px] font-semibold text-ink-2">{busqueda ? "Sin coincidencias" : "Sin clientes todavía"}</p>
            <p className="mt-1 text-[13px]">Agrega clientes para facturarles más rápido y llevar su historial.</p>
          </div>
        )}
        {clientes && clientes.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sel text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 font-semibold">Nombre</th>
                  <th className="px-4 py-2.5 font-semibold">Contacto</th>
                  <th className="px-4 py-2.5 font-semibold">RFC</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{c.nombre} {c.apellido_paterno}</td>
                    <td className="px-4 py-2.5 text-ink-2">{c.telefono || c.email || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink-2">{c.rfc || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.estado === "ACTIVO" ? "bg-[#EAF3EE] text-success" : "bg-[#FBECEA] text-danger"}`}>
                        {c.estado === "ACTIVO" ? "Activo" : "Bloqueado"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => editar(c)} className="text-[12.5px] font-semibold text-ink-2 hover:text-ink">Editar</button>
                      <button type="button" onClick={() => alternarBloqueo(c)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-ink">{c.estado === "ACTIVO" ? "Bloquear" : "Activar"}</button>
                      <button type="button" onClick={() => borrar(c)} className="ml-3 text-[12.5px] font-semibold text-ink-3 hover:text-danger">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Editor inline */}
        {editando && (
          <div className="mt-5 max-w-[620px] rounded-lg border border-line bg-surface p-5">
            <div className="mb-4 font-display text-[16px] font-semibold tracking-tight">{editando.id ? "Editar cliente" : "Nuevo cliente"}</div>
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="c-nombre">Nombre</label>
                  <input id="c-nombre" className={input} value={editando.datos.nombre} maxLength={150} onChange={(e) => set("nombre", e.target.value)} placeholder="Juan" />
                </div>
                <div>
                  <label className={label} htmlFor="c-ap">Apellido</label>
                  <input id="c-ap" className={input} value={editando.datos.apellido_paterno} maxLength={100} onChange={(e) => set("apellido_paterno", e.target.value)} placeholder="Pérez" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="c-tel">Teléfono</label>
                  <input id="c-tel" className={input} value={editando.datos.telefono} maxLength={20} onChange={(e) => set("telefono", e.target.value.replace(/[^0-9+ ]/g, ""))} placeholder="477 123 4567" />
                </div>
                <div>
                  <label className={label} htmlFor="c-email">Correo</label>
                  <input id="c-email" className={input} value={editando.datos.email} maxLength={150} onChange={(e) => set("email", e.target.value)} placeholder="juan@correo.com" />
                </div>
              </div>

              <div className="border-t border-line pt-3 text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">Datos fiscales · opcional</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="c-tipo">Tipo</label>
                  <select id="c-tipo" className={input} value={editando.datos.tipo_fiscal} onChange={(e) => set("tipo_fiscal", e.target.value as typeof VACIO.tipo_fiscal)}>
                    {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="c-rfc">RFC</label>
                  <input id="c-rfc" className={`${input} font-mono uppercase`} value={editando.datos.rfc} maxLength={13} onChange={(e) => set("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_140px] gap-4">
                <div>
                  <label className={label} htmlFor="c-razon">Razón social</label>
                  <input id="c-razon" className={input} value={editando.datos.razon_social} maxLength={200} onChange={(e) => set("razon_social", e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="c-cp">CP fiscal</label>
                  <input id="c-cp" className={input} value={editando.datos.codigo_postal_fiscal} maxLength={5} inputMode="numeric" onChange={(e) => set("codigo_postal_fiscal", e.target.value.replace(/\D/g, ""))} placeholder="37000" />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="c-notas">Notas internas · opcional</label>
                <textarea id="c-notas" className={`${input} h-16 resize-none py-2`} value={editando.datos.notas_internas} maxLength={500} onChange={(e) => set("notas_internas", e.target.value)} />
              </div>

              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
