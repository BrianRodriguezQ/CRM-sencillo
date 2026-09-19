# REGLA OBLIGATORIA — Terminales externas para backend y frontend

> Creada: 2026-09-18. Pedido explícito del CTO (Luis Batista / Brian R).
> **Nivel: BLOQUEANTE.** Violar esta regla = romper el entorno de desarrollo.

## La regla

**TODO proceso de desarrollo (backend y frontend) se ejecuta EXCLUSIVAMENTE en terminales externas visibles. NUNCA como proceso oculto/background lanzado desde la herramienta de shell del agente.**

- ❌ PROHIBIDO: `Start-Process ... -WindowStyle Hidden`
- ❌ PROHIBIDO: lanzar `npm run dev` con la salida redirigida a un log y esperar
- ❌ PROHIBIDO: matar/levantar procesos de backend o frontend sin avisar al CTO
- ✅ OBLIGATORIO: abrir una terminal externa visible (`start powershell` / `Start-Process powershell` SIN `-WindowStyle Hidden`, o `wt`, o `cmd /k`) con el comando exacto
- ✅ OBLIGATORIO: el agente le comunica al CTO QUÉ abrir y DÓNDE, y espera confirmación de que quedó corriendo

## Por qué (historial real del proyecto)

1. **18/09/2026 — Corrupción severa de `backend/.pglite`**: tres instancias de `npm run dev --workspace=backend` lanzadas como procesos ocultos compitieron por el puerto 3001 (EADDRINUSE) y por el MISMO data dir PGlite. Resultado: `RuntimeError: Aborted()` en `Module._pg_initdb`, backend caído, "Unexpected end of JSON input" en TODOS los endpoints de creación del frontend, equipo sin miembros.
2. **Diagnóstico tramposo**: con el proceso oculto no se ve el error en vivo; se pierden horas descifrando logs redirigidos.
3. **Windows + npm workspace**: `npm run dev --workspace=backend` desde la raíz del repo resuelve `./.pglite` relativo al cwd real del proceso — si el cwd no es `backend/`, PGlite crea una base FANTASMA en la raíz (`.pglite` del repo root) y el server apunta a una base vacía sin tablas.

## Cómo ejecutar SIEMPRE (runbook canónico)

### Backend (puerto 3001)
```
Abrir PowerShell y ejecutar:
  cd "D:\BrianR\POR ORDENAR DE MI TRABAJO\LUIS BATISTA\CRM BATISTA\backend"
  npm run dev
```
Verificación: `curl.exe http://localhost:3001/api/health` (o login) responde JSON, y aparece `CRM Batista API running on http://localhost:3001`.

### Frontend (puerto 5173)
```
Abrir PowerShell y ejecutar:
  cd "D:\BrianR\POR ORDENAR DE MI TRABAJO\LUIS BATISTA\CRM BATISTA\frontend"
  npm run dev
```

## Bases de datos PGlite — NUNCA tocar sin permiso

- Base REAL con datos: `backend/.pglite` (MUY importante — contiene los miembros/equipo)
- NO confundir con `.pglite` de la raíz del repo (fantasma, creada por cwd incorrecto — se movió a `.pglite.fantasma-20260918-193708`)
- Backup disponible: `backend/.pglite.bak-20260918-193708`
- Antes de borrar/regenerar una base: SIEMPRE hacer backup con timestamp y avisar al CTO.

## Sanciones de estilo

- El agente que lance backend/frontend oculto DEBE reportar la violación y rehacerlo en terminal externa.
- Nunca asumir que el backend está arriba: SIEMPRE verificar con un request real antes de seguir.