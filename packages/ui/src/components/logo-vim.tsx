import { cn } from "../cn";

/**
 * Isotipo de VIM POS.
 *
 * Antes la marca se dibujaba a mano en cada pantalla: un cuadrado negro, una "V" en texto y un
 * punto naranja en un `<span>` posicionado en absoluto. Estaba repetida en doce sitios entre el POS
 * y el panel, así que cambiar el logotipo significaba tocar doce archivos y rezar por no olvidar
 * ninguno — y además dependía de que el dispositivo tuviera la tipografía instalada.
 *
 * Aquí va el vector de verdad, el mismo archivo que genera el icono de la app y los favicons
 * (`apps/admin/public/icon.svg`). El borde inferior en zigzag es el corte del papel del ticket.
 *
 * Los colores van literales y NO por token: un logotipo no cambia de color con el tema. El azul de
 * marca es el mismo `#0078C9` que ahora usa `--accent`, pero son dos decisiones distintas — si
 * mañana el acento de la interfaz cambia, el logotipo no debe seguirlo.
 *
 * Sin `rounded`: la esquina redondeada recorta las puntas del zigzag, que es lo que distingue a la
 * marca. El tamaño se pasa por `className` (`h-8 w-8`, `h-[clamp(…)]`, lo que haga falta).
 */
export function LogoVim({ className, titulo = "VIM POS" }: { className?: string; titulo?: string }) {
  return (
    <svg
      viewBox="0 0 1080 1080"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block", className)}
      role="img"
      aria-label={titulo}
    >
      <polygon
        fill="#0078C9"
        points="0 0 0 908.18 180 1080 360 908.18 540 1080 720 908.18 900 1080 1080 908.18 1080 0 0 0"
      />
      <path
        fill="#FFFFFF"
        d="M595.3,712.37c-10.37,25.06-36.29,33.7-55.3,33.7s-45.79-8.64-56.16-33.7l-212.55-486.43c-4.32-9.5-6.05-18.14-6.05-26.78,0-34.56,32.83-57.02,64.8-57.02,21.6,0,42.34,10.37,51.84,34.56l158.11,388.8,157.25-388.8c9.5-24.19,30.24-34.56,51.84-34.56,31.97,0,65.66,23.33,65.66,57.89,0,7.78-1.73,16.42-6.05,25.92l-213.41,486.43Z"
      />
    </svg>
  );
}
