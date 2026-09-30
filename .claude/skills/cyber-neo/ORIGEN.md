# Origen de esta skill

- Repositorio: https://github.com/Hainrixz/cyber-neo (licencia MIT, ver `LICENSE`)
- Commit instalado: `dcac0a8f111954e543e1e66e02a222c0c489ca74` (17 jul 2026)
- Se copió solo `skills/cyber-neo/` (SKILL.md, references/, scripts/); se omitieron las imágenes.
- Revisión previa (30 sep 2026): `scripts/scan_secrets.py` y `scripts/check_lockfiles.py` solo leen
  archivos; la única llamada externa es `git diff --cached --name-only` (lectura). Sin red, sin escrituras.

Para actualizarla, repite la revisión de los scripts antes de copiar la versión nueva.
