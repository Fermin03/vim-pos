"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { deviceToken } from "../lib/supabase";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

/** DUEÑO y ADMIN: los mismos que configuran la sucursal a la que pertenece esta caja. */
const PERMISO = "config.sucursal";

/**
 * Desvincular la caja desde la pantalla de "¿Quién está en caja?".
 *
 * Antes era un enlace que desvinculaba al primer toque, debajo de la lista de empleados: la
 * pantalla que toda cajera usa varias veces por turno. Un roce dejaba la caja sin vender hasta
 * que alguien llegara con el correo y la contraseña del dispositivo (revisión de diseño de
 * sep 2026, `docs/bitacora/2026-09-revision-diseno/pos.md`).
 *
 * Se queda en esta pantalla a propósito, y no en el menú de adentro: es la salida cuando la caja
 * quedó vinculada a la sucursal equivocada y nadie de ahí puede entrar. Por eso pide dos cosas:
 * una confirmación que dice lo que cuesta volver, y el PIN de un administrador o del dueño.
 *
 * Sin `cajaId` (la sesión del dispositivo no trae caja) no hay contra qué validar el PIN, y la
 * caja tampoco puede operar así: basta la confirmación.
 */
export function ModalDesvincular({
  cajaId,
  onDesvincular,
  onCerrar,
}: {
  cajaId: string | null;
  onDesvincular: () => void;
  onCerrar: () => void;
}) {
  const [paso, setPaso] = useState<"confirmar" | "pin">("confirmar");
  // undefined = todavía leyendo. El botón espera: si se decidiera antes, un toque rápido
  // desvincularía sin PIN solo porque el token no había llegado.
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let activo = true;
    deviceToken()
      .then((t) => activo && setToken(t))
      .catch(() => activo && setToken(null));
    return () => {
      activo = false;
    };
  }, []);

  if (paso === "pin" && cajaId && token) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion="desvincular_dispositivo"
        permisoCodigo={PERMISO}
        descripcion="Desvincular esta caja"
        ejecutaNombre="la caja"
        quienAutoriza="un administrador o el dueño"
        monto={null}
        entidadTipo="caja"
        entidadId={cajaId}
        cajaId={cajaId}
        turnoId={null}
        motivo="Desvincular el dispositivo desde la pantalla de acceso"
        onAutorizado={onDesvincular}
        onCancelar={onCerrar}
      />
    );
  }

  const pidePin = Boolean(cajaId && token);

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Desvincular esta caja"
      hideTitle
      className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <h2 className="font-display text-xl font-semibold tracking-tight">¿Desvincular esta caja?</h2>
      <p className="mt-2 text-[14px] leading-snug text-ink-2">
        La caja deja de vender en este momento. Para volver a usarla hay que vincularla otra vez
        con el <b className="font-semibold text-ink">correo y la contraseña del dispositivo</b>, que
        se consiguen en el panel de administración.
      </p>
      {pidePin && (
        <p className="mt-2 text-[14px] leading-snug text-ink-2">
          Lo autoriza un administrador o el dueño con su PIN.
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          disabled={token === undefined}
          onClick={() => (pidePin ? setPaso("pin") : onDesvincular())}
        >
          Desvincular
        </Button>
      </div>
    </Modal>
  );
}
