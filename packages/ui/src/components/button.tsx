import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-2 font-display font-semibold rounded " +
  // Responde al presionar: scale .97 al instante (60 ms) y vuelve con la curva de la casa. Sin
  // esto, en táctil un botón no daba ninguna señal de haber sido tocado — ni Cobrar.
  "transition-[background-color,color,opacity,transform] duration-150 ease-vim " +
  "active:scale-[.97] active:duration-[60ms] " +
  "disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  ghost: "border border-line-strong text-ink-2 hover:bg-hover hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

/** Las clases del botón, para un enlace que debe verse como botón (un <button> dentro de un <a>
 *  es HTML inválido: dos paradas de tabulador y un clic que no siempre navega). */
export function botonClases({ variant = "primary", size = "md" }: { variant?: Variant; size?: Size } = {}): string {
  return cn(base, variants[variant], sizes[size]);
}

/** Botón base accesible. Siempre <button> real (foco por teclado, no <div onclick>). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
