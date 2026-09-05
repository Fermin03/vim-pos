"use client";
import { Bitacora } from "../components/bitacora";
import { useSesion } from "../lib/sesion";

export default function BitacoraPage() {
  const { api } = useSesion();
  return <Bitacora api={api} />;
}
