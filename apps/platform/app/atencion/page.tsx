"use client";
import { useRouter } from "next/navigation";
import { Atencion } from "../components/atencion";
import { useSesion } from "../lib/sesion";

export default function AtencionPage() {
  const { api } = useSesion();
  const router = useRouter();
  return <Atencion api={api} onAbrirEmpresa={(id) => router.push("/clientes/" + id)} />;
}
