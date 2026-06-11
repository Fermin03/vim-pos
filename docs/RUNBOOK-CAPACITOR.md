# Runbook · Empaquetado nativo del POS (Capacitor)

> Fase 3. La app nativa es un **shell remoto**: carga `https://pos.vimpos.com.mx` y el
> offline lo proveen el service worker (app-shell) + Dexie (outbox/cache) — exactamente
> igual que la PWA. El binario aporta: ícono en el launcher, pantalla completa sin barra
> del navegador, autoarranque en kiosko y distribución por APK (sin Play Store).
>
> **La PWA ya cubre el caso de uso** (Chrome → ⋮ → "Instalar app"); usa Capacitor solo si
> necesitas APK propio (ej. MDM/kiosko gestionado).

## Requisitos (una vez, en tu máquina)
- Node 20+ y pnpm (ya los tienes)
- **Android Studio** (incluye el SDK; instala "Android SDK Platform 34" en el setup)

## Build del APK (pasos)
```bash
cd apps/pos

# 1) Dependencias de Capacitor (solo la primera vez)
pnpm add @capacitor/core && pnpm add -D @capacitor/cli @capacitor/android

# 2) Crear el proyecto Android (solo la primera vez; usa capacitor.config.ts del repo)
npx cap add android

# 3) Sincronizar config → proyecto nativo (cada vez que cambie capacitor.config.ts)
npx cap sync android

# 4) Abrir en Android Studio y generar el APK
npx cap open android
#    Android Studio: Build → Generate Signed App Bundle / APK → APK
#    (para pruebas internas basta un debug APK: Build → Build APK(s))
```

El APK resultante se instala en las tablets (activar "instalar apps de origen desconocido").

## Notas
- `server.url` apunta a producción; no hay que recompilar por cambios de la web app
  (push a `main` → Vercel → la app nativa ya lo ve).
- Modo kiosko: usar una launcher app de kiosko (ej. Fully Kiosk) apuntando al APK, o
  Android Enterprise si el cliente tiene MDM.
- iOS: mismo flujo con `@capacitor/ios` + Xcode (requiere Mac + cuenta Apple Developer).
