// Impresión por la COLA DE WINDOWS — para impresoras que ya están instaladas en el sistema (USB,
// serial, o de red con su propio driver) y que la caja no puede alcanzar por IP.
//
// El caso que lo pidió: un negocio que viene de otro POS trae las impresoras dadas de alta en el
// panel de Windows y conectadas por USB. Ahí no hay IP que capturar.
//
// Se mandan los MISMOS bytes ESC/POS que por el puerto 9100, con el tipo de dato "RAW": la cola los
// entrega tal cual y el driver no los toca. Por eso el corte, el QR y el cajón salen igual.
//
// Sin módulo nativo a propósito: winspool se llama desde PowerShell, que ya viene en todo Windows.
// Un .node habría que recompilarlo en cada salto de Electron y es justo el tipo de pieza que falta
// en un instalador sin que nadie lo note.
import { spawn } from "node:child_process";

/** Nombre de impresora razonable: sin saltos de línea ni nulos, y con un tope. Va por variable de
 *  entorno —nunca dentro del texto del script—, así que esto no es lo que evita una inyección; es
 *  para contestar algo claro en vez de dejar que la cola falle con un código. */
export function nombreValido(nombre) {
  return typeof nombre === "string" && nombre.trim().length > 0 && nombre.length <= 260 && !/[\r\n\0]/.test(nombre);
}

// El script es FIJO: el nombre de la impresora llega por entorno y los bytes por la entrada
// estándar. Nada de lo que manda la UI se interpola aquí.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class VimColaRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string nombre, out IntPtr h, IntPtr def);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int nivel, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr h, byte[] datos, int n, out int escritos);

  // "OK", "ABRIR <codigo>" (no existe / sin acceso) o "ENVIAR <codigo>" (la cola no aceptó el trabajo).
  public static string Enviar(string nombre, byte[] datos, bool soloAbrir) {
    IntPtr h;
    if (!OpenPrinter(nombre, out h, IntPtr.Zero)) return "ABRIR " + Marshal.GetLastWin32Error();
    try {
      if (soloAbrir) return "OK";
      DOCINFO di = new DOCINFO();
      di.pDocName = "VIM POS";
      di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "ENVIAR " + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "ENVIAR " + Marshal.GetLastWin32Error();
        int escritos;
        bool ok = WritePrinter(h, datos, datos.Length, out escritos);
        int err = Marshal.GetLastWin32Error();
        EndPagePrinter(h);
        if (!ok || escritos != datos.Length) return "ENVIAR " + err;
        return "OK";
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
$b64 = [Console]::In.ReadToEnd().Trim()
$datos = if ($b64) { [Convert]::FromBase64String($b64) } else { New-Object byte[] 0 }
[Console]::Out.Write([VimColaRaw]::Enviar($env:VIM_IMPRESORA, $datos, $env:VIM_SOLO_ABRIR -eq '1'))
`;

/** Traduce lo que escribió el script a lo que entiende la UI. Función pura: es lo que se prueba. */
export function interpretarSalida(salida, codigoSalida) {
  const texto = String(salida ?? "").trim();
  if (texto === "OK") return { ok: true };
  const m = /^(ABRIR|ENVIAR) (\d+)$/.exec(texto);
  if (m?.[1] === "ABRIR") {
    // 1801 = nombre de impresora no válido: la quitaron de Windows o le cambiaron el nombre.
    const error = m[2] === "1801"
      ? "Esa impresora ya no está instalada en Windows."
      : `Windows no dejó abrir la impresora (código ${m[2]}).`;
    return { ok: false, motivo: "OFFLINE", error };
  }
  if (m?.[1] === "ENVIAR") return { ok: false, motivo: "ERROR", error: `La cola de impresión rechazó el trabajo (código ${m[2]}).` };
  return { ok: false, motivo: "ERROR", error: `No se pudo usar la cola de Windows (salida ${codigoSalida ?? "?"}).` };
}

/**
 * Manda bytes crudos a una impresora instalada en Windows. `soloConectar` solo comprueba que la
 * impresora exista y se pueda abrir.
 *
 * OJO con lo que significa `ok`: la cola ACEPTÓ el trabajo. Si la impresora está apagada o sin
 * papel, Windows lo deja encolado y aquí no hay forma de saberlo — por eso la UI dice "enviado",
 * no "impreso".
 */
export function imprimirEnColaWindows({ nombre, datosB64 = "", soloConectar = false } = {}, { lanzar = spawn, plataforma = process.platform } = {}) {
  if (plataforma !== "win32") return Promise.resolve({ ok: false, motivo: "ERROR", error: "Solo disponible en Windows." });
  if (!nombreValido(nombre)) return Promise.resolve({ ok: false, motivo: "ERROR", error: "Falta elegir la impresora." });
  if (typeof datosB64 !== "string" || !/^[A-Za-z0-9+/=]*$/.test(datosB64)) return Promise.resolve({ ok: false, motivo: "ERROR", error: "Datos de impresión inválidos." });

  return new Promise((resolve) => {
    let resuelto = false;
    let reloj;
    const fin =(r) => { if (resuelto) return; resuelto = true; clearTimeout(reloj); resolve(r); };
    let hijo;
    try {
      hijo = lanzar("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(SCRIPT, "utf16le").toString("base64")], {
        env: { ...process.env, VIM_IMPRESORA: nombre, VIM_SOLO_ABRIR: soloConectar ? "1" : "0" },
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch (e) {
      return fin({ ok: false, motivo: "ERROR", error: e?.message ?? "No se pudo abrir PowerShell." });
    }
    // PowerShell compila el tipo en cada arranque (1–2 s en una máquina lenta). 20 s es para una
    // caja atorada de verdad, no para la espera normal.
    reloj = setTimeout(() => { try { hijo.kill(); } catch { /* */ } fin({ ok: false, motivo: "ERROR", error: "La cola de Windows no respondió." }); }, 20000);
    let salida = "";
    hijo.stdout.on("data", (d) => { salida += d; });
    hijo.on("error", (e) => fin({ ok: false, motivo: "ERROR", error: e?.message ?? "No se pudo abrir PowerShell." }));
    hijo.on("close", (codigo) => fin(interpretarSalida(salida, codigo)));
    hijo.stdin.on("error", () => { /* el hijo murió antes de leer: lo reporta `close` */ });
    hijo.stdin.end(datosB64);
  });
}

/** Deja de la lista de Electron (`webContents.getPrintersAsync`) lo que la UI necesita. */
export function resumirImpresoras(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((p) => p && nombreValido(p.name))
    .map((p) => ({ nombre: p.name, predeterminada: p.isDefault === true }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
