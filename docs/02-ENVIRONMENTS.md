# 02 — Ambientes

Três ambientes, com banco, segredos, storage e push **separados** (docs/15 §1).

| Ambiente          | `APP_ENV`     | Banco                              | Storage           | Push                    |
| ----------------- | ------------- | ---------------------------------- | ----------------- | ----------------------- |
| Desenvolvimento   | `development` | Postgres local (`infra/docker-compose.yml`, porta 5435) | bucket `ff-dev`   | projeto FCM/APNs de dev |
| Homologação       | `staging`     | Postgres gerenciado do ambiente    | bucket `ff-stg`   | projeto FCM/APNs de stg |
| Produção          | `production`  | Postgres gerenciado do ambiente    | bucket `ff-prd`   | projeto FCM/APNs de prd |

## Regras

- Nenhum segredo no repositório. `.env` está no `.gitignore`; o modelo versionado é `.env.example`.
- Todas as variáveis são **validadas no startup** (`apps/api/src/config/env.ts`). Variável faltando ou inválida derruba o processo antes de aceitar tráfego.
- Dois usuários de banco por ambiente:
  - `ff_migrator` — dono do schema, aplica DDL/migrações.
  - `ff_app` — usuário de runtime do backend, criado com `NOBYPASSRLS`. É o que garante que as políticas de RLS realmente valem.
- Em produção, `API_CORS_ORIGINS` nunca pode ser `*` (a validação de env recusa).
- Rotação de segredos documentada em `docs/15` (operações); `JWT_*_SECRET` mínimo de 32 caracteres.

## Subir o ambiente de desenvolvimento

```bash
cp .env.example .env         # preencha os segredos locais
npm ci
npm run db:up                # Postgres em localhost:5433
npm run db:migrate           # migrações versionadas
npm run --workspace @ff/api dev
npm run --workspace @ff/mobile start
```

## Fluxo de deploy (docs/15 §3)

- **Homologação**: deploy automático após merge em `main` → migração controlada → build interno → smoke tests.
- **Produção**: aprovação manual → backup → migração → verificação → release gradual → monitoramento, com plano de rollback (roll-forward preferencial no banco).
