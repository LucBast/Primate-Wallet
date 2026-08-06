# PROGRESS.md

## Status geral

- Fase atual: **Fase 8 — Experiência rápida (a iniciar)**
- Fases concluídas: **0, 1, 2, 3, 4, 5, 6, 7**
- Última atualização: 2026-08-06
- Responsável: Claude Code
- Repositório: https://github.com/LucBast/Primte-Wallet (branch `main`)

## Gate de fidelidade visual

**A comparação lado a lado com os screenshots NÃO foi executada em nenhuma tela.**
Ela exige rodar o app em simulador a 390×844 (UI-FIDELITY-RULES §3), e este ambiente
não tem Android SDK nem Xcode. As telas foram construídas a partir de SCREEN-SPECS +
COMPONENT-SPECS, com a copy pt-BR verbatim, e o que dá para verificar por código está
coberto por teste (`apps/mobile/__tests__/`): tokens byte a byte iguais ao design,
Manrope no bundle iOS e Android, copy dos blocos, valores exatos da BottomNav.

**Nenhuma tela pode ser marcada como concluída antes desse gate.** Telas implementadas
e aguardando o gate: 1b, 1d, 1e, 1f, 1g, 2a, 2b, 2c, 2d, 2e, 3a, 3b, 3d, 4a–4d, 6a, 6b,
além das telas sem screenshot (criação de família, convite de membro, sessões,
categorias, transferência, detalhe de movimentação e de conta prevista).

Divergências já identificadas na leitura dos screenshots, a resolver no gate:

1. 6a — o toggle de biometria aparece ligado no design; está desligado por padrão
   (a biometria entra na fase de segurança).
2. 6a — o ícone do card de biometria é placeholder no design; hoje é um ponto brand
   em container `brandSoft`.
3. 6a — o título "Family Finance" parece maior no screenshot que `type.pageTitle` (22).
4. 3a — o screenshot mostra "Administradora"; o app usa "Administrador", o rótulo do
   PRD, porque o modelo não guarda gênero.

## Concluído

### Fase 0 — Fundação

Monorepo npm workspaces, TypeScript strict, ESLint/Prettier com os gates do CLAUDE.md
(literal de cor proibido fora dos tokens, kits de UI bloqueados), CI com migrações,
RLS e scan de segredos. `packages/domain`, `packages/validation`,
`packages/api-contracts`. Backend Fastify com config validada no startup, logs com
request_id e autenticação com sessões revogáveis. App RN CLI com tokens verbatim,
Manrope no bundle, BottomNav e tela de login.

### Fase 1 — Família e segurança

`households`, `household_members`, `invitations`. RLS por papel via helpers
SECURITY DEFINER. Convite nominal por e-mail com token em hash, aceite idempotente,
transferência de propriedade, `expectedVersion` nos membros e auditoria legível por
Proprietário/Admin. Telas 3a, 3b, 3d, 6b e afins.

### Fase 2 — Contas e categorias

`accounts` (contas e cartões na MESMA tabela), `account_member_permissions`,
`categories`, `counterparties`, `transactions`. Visibilidade por RLS — conta restrita
não chega ao cliente. Saldo derivado por `app.account_balance`. Ajuste de saldo com
motivo, idempotência e `expectedVersion`. Telas 2a–2d e categorias.

### Fase 3 — Planejamento

`planned_entries`, `settlements`, `installment_groups`, `recurrence_rules`,
`attachments`. Saldo em aberto e status derivados por função SQL; "vencido" com o fuso
da família, nunca persistido. Recorrência pura em `@ff/domain`. Parcelamento com
centavos na última parcela. Anexos escopados por família. Tela 1d e formulários.

### Fase 4 — Movimentações

Despesa, receita, transferência, rateio e estorno. Idempotência devolve a MESMA
movimentação. Despesa em cartão vira `CARD_PURCHASE`. Transferência atômica com tarifa
separada. Estorno preserva a original e bloqueia duplicidade. Busca, filtros e
paginação por cursor. Tela 1g e detalhes.

### Fase 5 — Baixas

Baixa atômica e SERIALIZABLE, com trava na conta prevista, revalidação do saldo dentro
da transação e `expectedVersion`. Principal nunca ultrapassa o saldo em aberto; juros e
multa por fora, desconto reduz só o que sai da conta. Concorrência testada com duas
baixas simultâneas — só uma passa. Estorno reabre a conta prevista. Tela 1e.

### Fase 6 — Cartões

`card_statements`, `card_statement_items`, `card_statement_payments`, com total, pago e
status derivados. Ciclos de fatura em `@ff/domain` a partir do dia de fechamento e de
vencimento. Compra à vista e parcelada com cada parcela na fatura certa. Pagamento de
fatura NÃO cria despesa e reabre no estorno. Reembolso abate a dívida. Telas 1f e 2e.

### Fase 7 — Dashboard e relatórios

Competência e caixa separados na origem: em competência a compra no cartão é despesa e
o pagamento da fatura não; em caixa é o contrário. Dashboard com saldo consolidado,
previsto × realizado, vencidas e próximos compromissos. Relatórios por categoria, por
membro (somando pelos rateios), por conta e evolução. Exportação CSV auditada, negada a
filho supervisionado. Telas 1b e 4a–4d.

## Em andamento

- Nada. Fase 7 fechada e enviada ao repositório.

## Pendente

- **Fase 8 — Experiência rápida**: lançamento rápido pelo botão central, sugestões,
  recentes, deep links, atalhos do ícone, notificações. Telas 1c, 6c, 6d.
- **Fase 9 — Supervisão familiar**: aprovações, limites, visibilidade, fluxos de filho.
  Tela 3c.
- **Fase 10 — Offline e sincronização**: WatermelonDB, outbox, conflitos, feedback.
- **Fase 11 — Qualidade e hardening**: cobertura, E2E, acessibilidade, performance,
  segurança, device testing, recovery, runbooks.
- **Fase 12 — Publicação**: documentos legais, store assets, beta, release, smoke tests.

## Testes falhando

- Nenhum. Total: **241 testes** (domain 62, validation 7, api-contracts 5, api 147,
  mobile 19).

## Migrações aplicadas

`0001_foundation` … `0013_card_statements` — aplicadas no Postgres de desenvolvimento
(`localhost:5435`) e exercitadas no CI, inclusive re-execução para provar idempotência.

## Decisões recentes

Registradas em `docs/21-DECISIONS.md`. Destaques: três roles de banco com o de runtime
sem `BYPASSRLS`; valores da especificação que não existem nos tokens ficam em
`spec-values.ts` com a citação de origem; `isoDateSchema` anota o retorno do `refine`
como `boolean` para o TypeScript não inferir um predicado de tipo e vazar a marca
`IsoDate` para todos os contratos; o ciclo de fatura vai do dia seguinte ao fechamento
anterior até o fechamento, inclusive.

## Bloqueios

1. **Gate visual não executado** — sem Android SDK, emulador ou Xcode neste ambiente.
   Para destravar: `npm run db:up && npm run db:migrate`,
   `npm run --workspace @ff/api dev`, `npm run --workspace @ff/mobile start` e
   `npm run --workspace @ff/mobile android` (ou `ios`).
2. **Provedor de e-mail transacional** — segredo externo. A porta `Mailer` está pronta;
   em desenvolvimento o link vai para o log.
3. **Bucket S3-compatível para anexos** — registro e caminho escopado prontos; falta o
   provedor e a URL assinada.
4. **Contas de loja, DSN do Sentry, FCM/APNs** — Fases 11 e 12.

## Próxima ação exata

Iniciar a **Fase 8 — Experiência rápida**:

1. Tela 1c (`design/screenshots/1c-lancamento-rapido.png`): BottomSheet com segmented
   ↓ Despesa | ↑ Receita | Mais ▾, MoneyInput 44 com teclado numérico interno,
   SelectorChips de conta/categoria/membro/data, sugestões recentes, "Salvar" e
   "Salvar e lançar outra". Meta: despesa simples em ≤ 10 s.
2. Sugestões e recentes: endpoint que devolve os últimos favorecidos, categorias e
   contas usados, para pré-preencher o formulário.
3. Deep links e atalhos do ícone (telas 6c): `familyfinance://quick/despesa` etc.,
   com retomada de intenção após login.
4. Notificações (tela 6d): tabela `notifications`, preferências por tipo, central no
   app e jobs de vencimento/fatura no fuso da família.
