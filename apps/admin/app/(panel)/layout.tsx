import { AdminShell } from "../components/admin-shell";

/** Layout de las páginas autenticadas del admin: shell (sidebar + main) + guard. */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
