"use client";
import { Atencion } from "../components/atencion";
import { useSesion } from "../lib/sesion";

export default function AtencionPage() {
  const { api } = useSesion();
  return <Atencion api={api} />;
}
