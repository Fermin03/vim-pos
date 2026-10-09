<!-- fuente: https://developer.clip.mx/reference/configuración-de-dependencias · capturado 2026-10-08 -->

---
updatedAt: 2025-10-31T00:30:17.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Configuración de Dependencias

Para integrar el SDK del Terminal, necesitas agregar la dependencia del SDK desde nuestros Paquetes de GitHub a tus repositorios de Maven.

* **Agregar Repositorio de GitHub en Packages:** Abre tu archivo settings.gradle.kts y agrega en Packages el repositorio GitHub de Clip a tu lista de repositorios de Maven.

```java
dependencyResolutionManagement {
       repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
       repositories {
            mavenCentral()
            maven { url 'https://jitpack.io' }
       }
}
```

* **Agregar dependencia:** Abre tu archivo build.gradle.kts y agrega la dependencia del SDK:

```java
dependencies {	   
    implementation("com.github.ClipMX:mobile.android.blaze.pinpad.sdk:1.1.0")
}

```

> 📘 ¿Necesitas Ayuda?
>
> Si lo que buscas no está documentado, contáctanos por el siguiente medio:
>
> * Envía un correo electrónico a la dirección <sdk@payclip.com>.