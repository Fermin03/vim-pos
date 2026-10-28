"use client";
import { useParams } from "next/navigation";
import { ConversacionWhatsapp } from "../../components/whatsapp";
import { useSesion } from "../../lib/sesion";

export default function ConversacionPage() {
  const { id } = useParams<{ id: string }>();
  return <ConversacionWhatsapp api={useSesion().api} id={id} />;
}
