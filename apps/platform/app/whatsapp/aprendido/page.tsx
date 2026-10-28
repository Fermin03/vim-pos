"use client";
import { Aprendido } from "../../components/whatsapp";
import { useSesion } from "../../lib/sesion";

export default function AprendidoPage() {
  return <Aprendido api={useSesion().api} />;
}
