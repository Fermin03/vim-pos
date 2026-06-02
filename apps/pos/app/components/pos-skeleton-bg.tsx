"use client";

/**
 * Esqueleto abstracto del POS de fondo (mockups P-010/P-012): comunica "tu ticket /
 * tu trabajo sigue ahí" tras el velo de bloqueo o sesión expirada. Decorativo.
 */
export function PosSkeletonBg({ variant = "caja" }: { variant?: "caja" | "app" }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] flex flex-col" aria-hidden="true">
      <div className="flex h-14 items-center gap-3 border-b border-line px-6">
        <div className="h-7 w-7 rounded-[7px] bg-ink" />
        <div className="h-3.5 w-32 rounded-full bg-line" />
        {variant === "app" && <div className="ml-auto h-3.5 w-24 rounded-full bg-line" />}
      </div>

      {variant === "caja" ? (
        <div className="flex min-h-0 flex-1">
          <div className="grid flex-1 auto-rows-[120px] grid-cols-4 content-start gap-3.5 p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line" />
            ))}
          </div>
          <div className="flex w-[360px] flex-col gap-3.5 border-l border-line p-6">
            <div className="h-3.5 w-4/5 rounded-full bg-line" />
            <div className="h-3.5 w-3/5 rounded-full bg-line" />
            <div className="h-3.5 w-4/5 rounded-full bg-line" />
            <div className="h-3.5 w-3/5 rounded-full bg-line" />
            <div className="mt-auto h-12 rounded-lg bg-accent-soft" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[200px] flex-col gap-3.5 border-r border-line p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={i % 2 ? "h-3 w-2/3 rounded-full bg-line" : "h-3 rounded-full bg-line"} />
            ))}
          </div>
          <div className="grid flex-1 auto-rows-[130px] grid-cols-3 content-start gap-4 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
