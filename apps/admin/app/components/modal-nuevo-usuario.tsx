"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { ROL_LABEL, crearEmpleado, nuevoUsuarioSchema } from "../lib/usuarios";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

const ROL_DESC: Record<string, string> = {
  ADMIN: "Configura el sistema y gestiona al equipo",
  SUPERVISOR: "Autoriza con PIN: descuentos, cancelaciones, ajustes",
  CAJERO: "Cobra, abre y cierra turno, mueve caja",
  PERSONAL: "Cocina, mesa, delivery (según subtipo)",
};

const ROLES = ["ADMIN", "SUPERVISOR", "CAJERO", "PERSONAL"] as const;
type Rol = (typeof ROLES)[number];

export function ModalNuevoUsuario({
  onCerrar,
  onCreado,
}: {
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [rol, setRol] = useState<Rol>("CAJERO");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function crear() {
    setError(null);
    const parsed = nuevoUsuarioSchema.safeParse({ nombre, email, pin, rol_codigo: rol });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setCreando(true);
    try {
      await crearEmpleado(parsed.data);
      onCreado();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setError(
        msg === "EMAIL_DUPLICADO"
          ? "Ya existe un usuario con ese email."
          : msg === "SIN_PERMISO"
            ? "No tienes permiso para crear usuarios."
            : msg,
      );
      setCreando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Invitar usuario"
      hideTitle
      className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Invitar usuario</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">Crea su cuenta con un PIN inicial; podrá cambiarlo después.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className={label} htmlFor="nu-nombre">Nombre completo</label>
          <input
            id="nu-nombre"
            className={input}
            value={nombre}
            maxLength={100}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Pedro García López"
          />
        </div>

        <div>
          <label className={label} htmlFor="nu-email">Email</label>
          <input
            id="nu-email"
            type="email"
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pedro@knockoutburger.mx"
          />
          <p className="mt-1 text-[11.5px] text-ink-3">Identifica la cuenta. El empleado opera con su PIN en el POS.</p>
        </div>

        <div>
          <label className={label} htmlFor="nu-pin">PIN inicial</label>
          <input
            id="nu-pin"
            className={input}
            value={pin}
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="4 a 6 dígitos"
          />
          <p className="mt-1 text-[11.5px] text-ink-3">Compártelo en persona. El empleado puede cambiarlo después.</p>
        </div>

        <div>
          <label className={label}>Rol</label>
          <div className="flex flex-col gap-2">
            {ROLES.map((r) => (
              <label
                key={r}
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                  rol === r ? "border-ink bg-sel" : "border-line hover:border-line-strong",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="rol"
                  value={r}
                  checked={rol === r}
                  onChange={() => setRol(r)}
                  className="mt-1 h-4 w-4 accent-[#16161A]"
                />
                <div>
                  <div className="text-[14px] font-semibold">{ROL_LABEL[r]}</div>
                  <div className="text-[12.5px] text-ink-3">{ROL_DESC[r]}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm font-medium text-danger" role="alert">{error}</p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={creando}>Cancelar</Button>
        <Button onClick={crear} disabled={creando}>{creando ? "Creando…" : "Crear usuario"}</Button>
      </div>
    </Modal>
  );
}
