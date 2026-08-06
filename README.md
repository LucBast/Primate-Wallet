# Family Finance

Aplicativo de gestão financeira familiar para iOS e Android.

- **Escopo e regras**: `docs/FAMILY_FINANCE_ALL_IN_ONE.md`
- **Stack**: `docs/01-STACK-DECISIONS.md` — React Native CLI + PostgreSQL próprio
- **Design (fonte de verdade visual)**: `design/` — em conflito visual, `design/` vence
- **Estado atual e próxima ação**: `PROGRESS.md`
- **Decisões de implementação**: `docs/21-DECISIONS.md`

## Estrutura

```
apps/
  api/            backend Fastify + PostgreSQL (auth, RLS, observabilidade)
  mobile/         app React Native CLI (design system, navegação, telas)
packages/
  domain/         regras financeiras puras (dinheiro em centavos, datas, status)
  validation/     primitivos Zod compartilhados
  api-contracts/  contratos de API usados pelo backend E pelo app
  test-fixtures/  dados determinísticos para testes
db/migrations/    migrações SQL versionadas
infra/            Postgres de desenvolvimento e provisionamento de roles
```

## Começar

Requisitos: Node 22+, Docker, e (para rodar o app) Android SDK ou Xcode.

```bash
cp .env.example .env          # preencha os segredos locais
npm ci
npm run db:up                 # Postgres em localhost:5435
npm run db:migrate            # migrações versionadas

npm run --workspace @ff/api dev        # backend em localhost:3400
npm run --workspace @ff/mobile start   # Metro
npm run --workspace @ff/mobile android # ou: ios
```

## Gates de qualidade

```bash
npm run verify   # format:check + lint + typecheck + testes
```

Rodados também em cada pull request (`.github/workflows/ci.yml`), junto com a verificação
de migrações, os testes de RLS contra um Postgres real e o scan de segredos.

## Regras que o ferramental cobra sozinho

- **Cor fora dos tokens é erro de lint.** `apps/mobile/src/design-system/tokens.ts` é cópia
  byte a byte de `design/design-tokens.ts`, e um teste falha se as duas divergirem.
- **Kits de UI com tema próprio são proibidos** (Paper, NativeBase, UI Kitten, gluestack).
- **Dinheiro é inteiro em centavos.** O tipo `MinorUnits` e os schemas Zod recusam float.
- **Nenhuma consulta sem identidade.** Toda transação da aplicação define `app.user_id`, e o
  role usado em runtime não pode ignorar RLS.

Antes de dar uma tela como concluída, compare-a lado a lado com o screenshot correspondente
em `design/screenshots/` e registre o resultado em `PROGRESS.md` (`design/UI-FIDELITY-RULES.md`).
