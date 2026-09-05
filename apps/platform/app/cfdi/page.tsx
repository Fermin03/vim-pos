"use client";
import { useRouter } from "next/navigation";
import { Cfdi } from "../components/cfdi";
import { useSesion } from "../lib/sesion";

export default function CfdiPage() {
  const { api } = useSesion();
  const router = useRouter();
  return <Cfdi api={api} onAbrirEmpresa={(id) => router.push("/clientes/" + id)} />;
}
