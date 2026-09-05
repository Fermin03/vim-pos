"use client";
import { Errores } from "../components/errores";
import { useSesion } from "../lib/sesion";

export default function ErroresPage() {
  const { api } = useSesion();
  return <Errores api={api} />;
}
