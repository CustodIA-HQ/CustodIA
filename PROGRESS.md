# CustodIA — Registro de Progreso
> ETHOnline 2026 · Última actualización: 8 de septiembre de 2026

---

## ✅ COMPLETADO — Optimizaciones de Infraestructura

### 1. Cola FIFO para el Firmante Hedera
**Archivos modificados:**
- [`apps/signer/x402-sign.ts`](./apps/signer/x402-sign.ts)
- [`packages/agent/src/x402.ts`](./packages/agent/src/x402.ts)

**Qué se hizo:**
- Transformado el script CLI de un solo disparo en un **daemon persistente** con `readline`
- El proceso escucha desafíos línea por línea en `stdin` y los encola via `queue = queue.then(...)`
- En el agente: reemplazado `execFileSync` por `spawn` de larga duración con `Mutex` para comunicación IPC
- **Garantía:** las transacciones de Hedera se procesan estrictamente en orden — sin huecos de nonce

---

### 2. Watcher con Patrón Cursor (serverless-safe)
**Archivos creados/modificados:**
- [`apps/web/app/api/cron/route.ts`](./apps/web/app/api/cron/route.ts) ← NUEVO
- [`apps/web/vercel.json`](./apps/web/vercel.json) ← NUEVO
- [`packages/db/src/schema.ts`](./packages/db/src/schema.ts)

**Qué se hizo:**
- Añadida tabla `cursors` en Drizzle (`id`, `last_processed_id`, `updated_at`)
- Endpoint `GET /api/cron` con paginación por cursor: `WHERE id > lastId ORDER BY id LIMIT 50`
- `vercel.json` con cron `* * * * *` (cada minuto) y `maxDuration: 60`
- **Garantía:** si Vercel mata la función, el próximo arranque retoma exactamente donde quedó

---

### 3. Cobertura de Tests Vitest (Zod + Políticas)
**Archivos creados:**
- [`packages/schema/test/schema.test.ts`](./packages/schema/test/schema.test.ts) ← NUEVO
- [`packages/schema/vitest.config.ts`](./packages/schema/vitest.config.ts) ← NUEVO
- [`packages/policy/test/policy.test.ts`](./packages/policy/test/policy.test.ts) ← NUEVO (corregido import)

**Resultados:**
```
packages/policy  → 18 tests ✅ (4 nuevos + 14 existentes)
packages/schema  →  4 tests ✅
Total            → 22 tests PASSED
```

**Qué cubren:**
- Inyección de componentes no permitidos en `UISpec` → debe lanzar `ZodError`
- Tipos inválidos en `range_slider` → rechazado
- Motor de políticas: `pay_x402` dentro/fuera de presupuesto HBAR
- Mandato expirado → denegado
- Violación de `max_trade_usd` → denegado

---

### 4. Índices Drizzle ORM (Neon Postgres)
**Archivo modificado:**
- [`packages/db/src/schema.ts`](./packages/db/src/schema.ts)

**Índices añadidos:**
```sql
-- Optimiza consultas por tarea en la tabla solo-append
CREATE INDEX mandates_task_id_idx ON mandates (task_id);

-- Acelera SUM(amount) para calcular spentUsd del motor de políticas
CREATE INDEX receipts_task_id_idx ON receipts (task_id);
```

> ⚠️ **Pendiente:** correr `pnpm db:generate && pnpm db:migrate` para aplicar los índices a Neon.

---

### 5. Backoff Exponencial para Mirror Node de Hedera
**Archivo modificado:**
- [`apps/risk-api/src/app.ts`](./apps/risk-api/src/app.ts)

**Qué se hizo:**
- Eliminado el `Proxy` frágil sobre `ExactHederaScheme`
- Implementada función `withMirrorBackoff<T>()` aplicada directamente en el handler
- Secuencia: espera **6 s → 12 s → 24 s → 48 s** antes de cada intento
- **Por qué 6 s:** el Mirror Node de Hedera tarda 5–6 s en reflejar una liquidación (doc §6)

---

### 6. Frontend — Hero Page
**Archivos creados/modificados:**
- [`apps/web/app/page.tsx`](./apps/web/app/page.tsx) ← rediseñado
- [`apps/web/app/globals.css`](./apps/web/app/globals.css) ← actualizado
- [`apps/web/app/layout.tsx`](./apps/web/app/layout.tsx) ← Inter font + globals
- [`apps/web/public/hero.jpg`](./apps/web/public/hero.jpg) ← NUEVO (imagen generada)

**Qué se hizo:**
- Página hero con fondo oscuro `#0a0f1e`, imagen del orbe con AI+escudos
- Nav glassmorphism, título con gradiente blanco→teal
- Cards de los 3 sponsors del hackathon: ENSv2, The Graph, Hedera x402
- Corregido error de hidratación React (vendor prefixes en CSS class, no inline)

---

## ⏳ PENDIENTE — Según el documento §12 (Bloqueadores)

### 🔴 BLOQUEADORES INMEDIATOS (sin estos, nada funciona en live)

| # | Tarea | Dónde | Doc dice |
|---|---|---|---|
| **B1** | API Key de The Graph Studio | [thegraph.com/studio](https://thegraph.com/studio/) | *"El único bloqueador de toda la capa de Graph"* |
| **B2** | Cuenta Hedera testnet | [portal.hedera.com](https://portal.hedera.com) | *"Con email, NO faucet anónimo (trampa #6)"* |
| **B3** | Base de datos Neon Postgres | [neon.tech](https://neon.tech) | Necesaria para mandatos, recibos, watcher |
| **B4** | API Key Anthropic | [console.anthropic.com](https://console.anthropic.com) | Necesaria para el agente Claude Opus 5 |
| **B5** | Registrar `custodia.eth` en Sepolia | ENSv2 MockUSDC → commit → wait 60s → register | *"Gratis en la práctica"* |

### Variables del `.env` a rellenar
```bash
# Copiar .env.example → .env y completar:

ANTHROPIC_API_KEY=           ← console.anthropic.com
GRAPH_STUDIO_KEY=            ← thegraph.com/studio → API Keys
DATABASE_URL=                ← neon.tech → connection string
SEPOLIA_RPC_URL=             ← infura.io o alchemy.com (gratis)
ENS_OPERATOR_PRIVATE_KEY=    ← wallet que posee custodia.eth
AGENT_PRIVATE_KEY=           ← wallet del agente (nueva)
RISK_API_PAYTO=0.0.XXXXX    ← tu cuenta Hedera (recibe el HBAR)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=  ← cloud.walletconnect.com
SESSION_SECRET=              ← string aleatorio 32+ chars

# En apps/signer/.env (separado, máxima seguridad):
HEDERA_CLIENT_ID=0.0.XXXXX  ← portal.hedera.com
HEDERA_CLIENT_KEY=302e...    ← clave ECDSA del portal
```

---

## 🔧 PENDIENTE — Código por implementar

Según el calendario del documento (§12), estas tareas aún no tienen código:

| Fecha doc | Tarea | Estado |
|---|---|---|
| 8–9 sept | `packages/ens` — `createTask`, `delegateAgent`, `revokeAgent` | ❌ Sin implementar |
| 9–10 sept | `packages/graph` — adaptadores Uniswap V3 + Aave v3 en vivo | ❌ Sin implementar |
| 10–12 sept | `packages/agent` — conectar tools reales (Graph, risk, ENS) al runner | ❌ Parcial (stubs) |
| 10–12 sept | `apps/web` — renderizador de UISpec (componentes Zod → React) | ❌ Sin implementar |
| 10–12 sept | `apps/web/app/api/chat/route.ts` — SSE chat con el agente | ❌ Stub (devuelve 501) |
| 12–13 sept | Watcher — lógica real (The Graph → política → ENS write) | ❌ Sólo el cursor |
| 12–13 sept | Vista de auditoría (recibos + mandatos en UI) | ❌ Sin implementar |
| 12–13 sept | Adaptador Telegram (`grammy`) | ❌ Sin implementar |
| 14–15 sept | Endurecer, README con archivo y línea por sponsor | ❌ Pendiente |
| 16 sept | 3 videos de demo (uno por sponsor) | ❌ Pendiente |

---

## ✅ Comandos de verificación (una vez configurado el .env)

```bash
# Aplicar migraciones de DB (incluye índices nuevos)
pnpm db:generate
pnpm db:migrate

# Tests unitarios (sin .env, funcionan ahora mismo)
cd packages/policy && npx vitest run   # 18 tests
cd packages/schema && npx vitest run   # 4 tests

# Verificaciones en vivo (requieren .env completo)
pnpm verify:graph   # The Graph — subgraphs en vivo
pnpm verify:x402    # Hedera — pago real de punta a punta
pnpm verify:ens     # ENSv2 — acuñar → delegar → revocar

# Desarrollo local
pnpm dev            # Next.js :3000 + Risk API :8402
```

---

## 📍 Estado actual del proyecto

```
Frontend (localhost:3000)   ✅ Corriendo — hero page visible
Risk API (localhost:8402)   ⚠️  Necesita .env de Hedera
Agente Claude               ⚠️  Necesita ANTHROPIC_API_KEY
The Graph                   ⚠️  Necesita GRAPH_STUDIO_KEY
ENSv2 Sepolia               ⚠️  Necesita cuenta + registro custodia.eth
Base de datos               ⚠️  Necesita DATABASE_URL + migraciones
Hedera x402                 ⚠️  Necesita cuenta portal.hedera.com
```

---

*Documento vivo — actualizar a medida que se completen tareas.*
*Si algo aquí contradice a `QUICKREF.md`, gana `QUICKREF.md` (regla del doc §A).*

## Stage 1 — Foundation: gate passed 2026-09-11

`pnpm verify:durability` — duplicate delivery of one `clientRequestId` yields one run; a job whose worker died mid-lease is stolen and completed on attempt 2. Plan: `docs/superpowers/plans/2026-09-11-stage-1-foundation.md`. Branch `stage-1-foundation` (13 commits).
