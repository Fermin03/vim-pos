# Documentación de VIM POS

## La regla de precedencia

Cuando dos documentos digan cosas distintas —y van a decirlas— este es el orden:

1. **`decisiones/`** — lo que cambió respecto al plan original. Manda siempre.
2. **`especificacion/`** — la especificación original, ya dentro del repo. Manda en todo lo que
   ningún ADR haya superado.
3. **`diseno/`** y el código — mandan en cómo se ve y cómo se comporta.

> Si el código contradice a los tres, es un bug **o un ADR que nadie escribió**. Averigua cuál de
> los dos antes de "arreglarlo".

La especificación original sigue siendo válida en la mayor parte: el modelo de datos, los flujos
por vertical, la matriz de permisos, CFDI, impresión. Lo que envejeció está listado en
`decisiones/`, y por eso se puede leer entera sin miedo.

## Qué hay en cada carpeta

| Carpeta | Qué es | Se edita |
|---|---|---|
| `decisiones/` | Un archivo por decisión que superó al plan. Corto: qué decía el plan, qué hacemos, por qué. | Se añade; rara vez se edita |
| `diseno/` | El núcleo de marca y un documento por app | Sí, en el mismo commit que el código |
| `operacion/` | Runbooks: publicar, desplegar, go-live, sitio, SSO | Sí, cuando cambia el procedimiento |
| `producto/` | Roadmap y backlog | Sí |
| `bitacora/` | Auditorías, remediaciones, cosas que pasaron. Fechadas. | **No.** Son un registro, no un documento vivo |

## Por dónde empezar

- **Retomas el proyecto:** `../../MEMORY.md`, luego `decisiones/`.
- **Vas a tocar una pantalla:** `diseno/nucleo.md` + el de esa app.
- **Vas a publicar:** `operacion/` y `../desktop/RUNBOOK.md`.
- **Algo no cuadra con la especificación:** `decisiones/`. Probablemente ya está explicado.

## Escribir un ADR

Cuando tomes una decisión que contradiga la especificación, escríbela **en ese momento**. Cuesta
diez minutos y es lo único que evita que dentro de tres meses alguien —o tú— implemente el plan
viejo creyendo que sigue vigente.

Formato: `NNNN-titulo-en-kebab-case.md`, y dentro:

```markdown
# NNNN — Título en una línea

**Fecha:** … · **Estado:** vigente | superado por NNNN

## Qué decía el plan
## Qué hacemos ahora
## Por qué
## Consecuencias      ← incluidas las malas
```

Corto. El valor está en que exista y se encuentre, no en la prosa.
