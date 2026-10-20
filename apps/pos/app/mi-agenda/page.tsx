"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MENSAJE_SESION_TERMINO } from "../lib/mi-agenda";
import { MENSAJE_SIN_AGENDA, clienteColaborador, salirColaborador, sesionColaborador } from "../lib/sesion-colaborador";
import { Agenda } from "./agenda";
import { Entrada } from "./entrada";

/**
 * /mi-agenda: la agenda del colaborador en su celular, fuera del cascarón de la caja. Su sesión es
 * de correo y contraseña (lib/sesion-colaborador); la caja y su dispositivo no intervienen.
 */
export default function MiAgendaPage() {
  // undefined = leyendo la sesión guardada; null = sin sesión.
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);
  const saliendo = useRef(false);
  const conSesion = useRef(false);
  conSesion.current = typeof email === "string";

  const leer = () => void sesionColaborador().then(setEmail, () => setEmail(null));
  useEffect(leer, []);

  // Un refresh que falla cierra la sesión sin que nadie toque «Cerrar sesión»: regresa a la entrada.
  useEffect(() => {
    const { data } = clienteColaborador().auth.onAuthStateChange((evento) => {
      // Solo con la agenda abierta: la entrada también cierra sesión cuando la cuenta no tiene agenda.
      if (evento !== "SIGNED_OUT" || !conSesion.current) return;
      if (!saliendo.current) setAviso(MENSAJE_SESION_TERMINO);
      saliendo.current = false;
      setEmail(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const salir = useCallback((motivo: string | null) => {
    saliendo.current = true;
    setAviso(motivo);
    void salirColaborador().finally(() => { saliendo.current = false; setEmail(null); });
  }, []);

  const alVencer = useCallback(
    (tipo: "sesion" | "sin_agenda") => salir(tipo === "sesion" ? MENSAJE_SESION_TERMINO : MENSAJE_SIN_AGENDA), [salir]);

  if (email === undefined) return <main className="min-h-[100dvh]" aria-busy="true" />;
  if (email === null) return <Entrada key={aviso ?? ""} aviso={aviso} alEntrar={() => { setAviso(null); leer(); }} />;
  return <Agenda sb={clienteColaborador()} alVencer={alVencer} alSalir={() => salir(null)} />;
}
