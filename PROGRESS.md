# PROGRESS.md

## Status geral

- Fase atual: **Fase 0 — Fundação (implementada; gate visual pendente de execução em simulador)**
- Última atualização: 2026-08-06
- Responsável: Claude Code

## Gate de fidelidade visual

Formato: "tela → comparada com screenshots/<id>.png → divergências corrigidas".

- **Login → `screenshots/6a-login.png` → comparação lado a lado NÃO executada.**
  A comparação exige rodar o app em simulador a 390×844 (UI-FIDELITY-RULES §3), e este
  ambiente não tem Android SDK nem Xcode. O que foi verificado por código está em
  `apps/mobile/__tests__/` (tokens verbatim, Manrope no bundle iOS e Android, copy verbatim
  dos 10 blocos da tela, valores exatos da BottomNav). **A tela NÃO está marcada como concluída.**

  Divergências já identificadas na leitura do screenshot, a resolver:
  1. O toggle de biometria aparece **ligado** no screenshot; está implementado **desligado**
     por padrão, porque a biometria só entra na fase de segurança. Rever quando implementada.
  2. O ícone do card de biometria é um glifo placeholder no design; está implementado como
     ponto brand em container `brandSoft`. Substituir pelo ícone de linha do set (fingerprint)
     junto com a funcionalidade.
  3. O título "Family Finance" parece maior no screenshot do que `type.pageTitle` (22).
     Confirmar na comparação em simulador antes de criar um valor em `spec-values.ts`.

- **BottomNav → `screenshots/1b-inicio.png` → valores verificados por teste**, comparação
  visual pendente pelo mesmo motivo (botão central 54 circular, deslocamento −26, sombra brand,
  4 rótulos com a copy da especificação).

## Concluído

### Monorepo e ferramental

- npm workspaces: `apps/api`, `apps/mobile`, `packages/{domain,validation,api-contracts,test-fixtures}`.
- TypeScript strict com `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e
  `verbatimModuleSyntax` em todos os pacotes.
- ESLint + Prettier com os gates do CLAUDE.md: **literal de cor proibido** fora de
  `tokens.ts`, **kits de UI com tema próprio proibidos**, `Math.round` bloqueado em código
  financeiro.
- CI (GitHub Actions): instalação limpa, format, lint, typecheck, testes unitários,
  migrações (aplicadas duas vezes, para provar idempotência), integração + RLS contra
  Postgres real, testes do app, build de validação e scan de segredos (gitleaks).
- Ambientes documentados (`docs/02-ENVIRONMENTS.md`) com `.env.example` versionado e
  validação de configuração no startup.

### packages/domain (43 testes)

- Dinheiro em centavos inteiros com tipo marcado `MinorUnits`; float é recusado na entrada.
- `allocate` (rateio que fecha o total exato) e `splitInstallments` (centavos na última parcela).
- Formatação e leitura pt-BR (`R$ 1.248,05`), com round-trip testado.
- Datas de calendário no fuso da família; "vencido" derivado, nunca persistido.
- Saldo em aberto, status derivado (`OPEN`/`PARTIAL`/`SETTLED`/`CANCELED`) e percentual pago.
- Códigos de erro tipados do doc 09, com mensagem pt-BR e status HTTP.

### packages/validation e api-contracts (12 testes)

- Primitivos Zod: UUID, centavos, data ISO, chave de idempotência, `expectedVersion`, cursor.
- Envelope de erro `{ code, message, details, requestId }` e contratos de autenticação.

### Banco (5 migrações)

- `0001` schema `app`, `app.current_user_id()` (GUC de sessão), gatilho de `updated_at`.
- `0002` `profiles` com RLS e privilégio por coluna (o role da aplicação não enxerga `password_hash`).
- `0003` `devices` (sessões revogáveis, refresh em hash, rotação contada).
- `0004` `auth_tokens` (uso único, invisível para o role da aplicação).
- `0005` `audit_logs` append-only.
- Três roles com privilégio mínimo: `ff_migrator`, `ff_app` (`NOBYPASSRLS`), `ff_auth`.

### apps/api (40 testes, incluindo RLS contra Postgres real)

- Fastify 5 com helmet, CORS restrito, rate limit e `x-request-id` em toda resposta.
- Configuração validada no startup; em produção recusa CORS aberto, Sentry vazio e
  segredos de JWT iguais.
- Logs estruturados (pino) com redação de senha, token e hash.
- Autenticação: cadastro, confirmação de e-mail, login, magic link, refresh com rotação,
  logout, `/auth/me`, listar e revogar sessões.
- Proteções verificadas por teste: enumeração de contas, replay de token de uso único,
  reuso de refresh token (revoga a sessão), bloqueio de conta por tentativas, sessão
  revogada invalidando o access token na hora.
- Testes de RLS: isolamento entre pessoas, acesso direto por ID, ausência de identidade
  (nega por padrão), privilégio de coluna e trilha append-only.

### apps/mobile (19 testes)

- React Native CLI 0.86.2 + TypeScript strict, integrado ao monorepo (Metro com `watchFolders`).
- Fontes Manrope 400–800 no bundle, vinculadas em iOS (`UIAppFonts`) e Android (`assets/fonts`).
- `tokens.ts` cópia verbatim, com teste que falha se divergir de `design/design-tokens.ts`.
- Tema claro/escuro/sistema a partir dos tokens.
- Componentes de `COMPONENT-SPECS` com os valores exatos: Button, Field, StatusChip
  (● + texto, ◌ para sync, line-through em estornado), Toggle, Banner, **BottomNav**.
- Navegação base: stack de autenticação e stack do app com as 5 posições da BottomNav.
- Tela de login (6a) com os 10 blocos e a copy pt-BR verbatim; criar conta; aterrissagem
  de deep link para confirmação de e-mail e link mágico.
- Sessão no Keychain/Keystore; cliente HTTP que traduz o envelope de erro do servidor.

## Em andamento

- Nada. Fase 0 fechada, exceto o gate visual (ver Bloqueios).

## Pendente

- Fases 1–12 do plano (docs/FAMILY_FINANCE_ALL_IN_ONE.md §16).
- WatermelonDB e o `outbox` offline: previstos para a Fase 10; nenhuma dependência
  instalada ainda, para não carregar o app antes da hora.

## Testes falhando

- Nenhum. Total: **114 testes** (domain 43, validation 7, api-contracts 5, api 40, mobile 19).

## Migrações aplicadas

- `0001_foundation`, `0002_profiles`, `0003_devices`, `0004_auth_tokens`, `0005_audit_logs`
  — aplicadas no Postgres de desenvolvimento (`localhost:5435`) e exercitadas no CI.

## Decisões recentes

- Registradas em `docs/21-DECISIONS.md` (D-001 a D-039). Destaques:
  - TypeScript 6 e ESLint 9 por limite de peer dependency das ferramentas de lint (D-001, D-002).
  - Três roles de banco, com o role da aplicação sem `BYPASSRLS` (D-010) — é o que faz os
    testes de RLS provarem alguma coisa.
  - Valores da especificação que não existem nos tokens ficam em `spec-values.ts`, com a
    citação de origem, em vez de espalhados como números mágicos (D-032).

## Bloqueios

1. **Gate visual não executado** — não há Android SDK, emulador nem Xcode neste ambiente.
   Para destravar: `npm run db:up && npm run db:migrate`, `npm run --workspace @ff/api dev`,
   `npm run --workspace @ff/mobile start` e `npm run --workspace @ff/mobile android` (ou `ios`),
   e então comparar a tela de login com `design/screenshots/6a-login.png` a 390×844, em tema
   claro e escuro.
2. **Provedor de e-mail transacional** (segredo externo). A porta `Mailer` está pronta; em
   desenvolvimento o link é registrado no log, o que permite testar cadastro e magic link
   ponta a ponta sem provedor.
3. **Contas de loja, DSN do Sentry e bucket de anexos** — segredos externos, previstos para
   as Fases 11 e 12.

## Próxima ação exata

1. Executar o gate visual da tela de login e da BottomNav no simulador (item 1 dos Bloqueios),
   corrigir as três divergências listadas acima e então marcá-las como concluídas aqui.
2. Iniciar a **Fase 1 — Família e segurança**: migrações de `households`, `household_members`
   e `invitations`; policies de RLS por papel; contratos e serviços de convite e associação;
   telas 3a (Família), 3b (Permissões) e 6b (Aceite de convite), com o gate visual de cada uma.
   Testes primeiro, conforme docs/13 §3 (matriz de permissões).
