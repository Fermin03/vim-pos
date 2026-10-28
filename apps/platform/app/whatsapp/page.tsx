"use client";
import { Whatsapp } from "../components/whatsapp";
import { useSesion } from "../lib/sesion";

export default function WhatsappPage() {
  return <Whatsapp api={useSesion().api} />;
}
