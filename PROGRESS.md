# PROGRESS.md

## Status geral

- Fase atual: **Fase 5 — Baixas (a iniciar)**
- Fases concluídas: **0, 1, 2, 3, 4**
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
e aguardando o gate: 6a (Login), 3a (Família), 3b (Permissões), 3d (Atividade),
6b (Convite), 2a (Contas), 2b (Nova conta), 2c (Detalhe da conta), 2d (Ajuste de
saldo), 1d (Planejamento), 1g (Movimentações).

Divergências já identificadas na leitura dos screenshots, a resolver no gate:

1. 6a — o toggle de biometria aparece ligado no design; está desligado por padrão
   (a biometria entra na fase de segurança).
2. 6a — o ícone do card de biometria é placeholder no design; hoje é um ponto brand
   em container `brandSoft`.
3. 6a — o título "Family Finance" parece maior no screenshot que `type.pageTitle` (22).
4. 3a — o screenshot mostra "Administradora"; o app usa "Administrador", o rótulo do
   PRD, porque o modelo não guarda gênero (D-040 em docs/21-DECISIONS.md).

## Concluído

### Fase 0 — Fundação

Monorepo npm workspaces, TypeScript strict, ESLint/Prettier com os gates do CLAUDE.md
(literal de cor proibido fora dos tokens, kits de UI bloqueados), CI com migrações,
RLS e scan de segredos. `packages/domain` (dinheiro em centavos, rateio exato,
parcelamento, datas no fuso da família), `packages/validation`, `packages/api-contracts`.
Backend Fastify com config validada no startup, logs com request_id e autenticação
com sessões revogáveis. App RN CLI com tokens verbatim, Manrope no bundle, BottomNav
e tela de login.

### Fase 1 — Família e segurança

`households`, `household_members`, `invitations`. RLS por papel via helpers
SECURITY DEFINER (`app.is_member`, `app.is_admin`, `app.is_owner`, `app.can_operate`).
Convite nominal por e-mail com token em hash, aceite idempotente, transferência de
propriedade, `expectedVersion` nos membros e auditoria legível por Proprietário/Admin.
Telas 3a, 3b, 3d, 6b, criação de família, convite e Dispositivos e sessões.

### Fase 2 — Contas e categorias

`accounts` (contas e cartões na MESMA tabela, com constraints que exigem e proíbem
campos de cartão), `account_member_permissions`, `categories` (um nível de
subcategoria), `counterparties`, `transactions`. Visibilidade por RLS
(`app.can_view_account`, `app.can_transact_account`) — conta restrita não chega ao
cliente. Saldo derivado por `app.account_balance`; cartão devolve dívida e limite
disponível. Ajuste de saldo com motivo, idempotência e `expectedVersion`.
Telas 2a, 2b, 2c, 2d e categorias.

### Fase 3 — Planejamento

`planned_entries`, `settlements`, `installment_groups`, `recurrence_rules`,
`attachments`. Saldo em aberto e status derivados por função SQL; "vencido" calculado
com o fuso da família e nunca persistido. Geração de recorrência pura em `@ff/domain`
(mesmo código no servidor e na prévia do app). Parcelamento com centavos na última
parcela. Anexos com caminho escopado pelo `household_id` e MIME restrito.
Telas 1d, formulário de conta prevista e detalhe.

### Fase 4 — Movimentações

Despesa, receita, transferência, rateio e estorno. Idempotência que devolve a MESMA
movimentação em vez de erro (chave no corpo ou no cabeçalho `Idempotency-Key`).
Despesa em cartão vira `CARD_PURCHASE` e não toca a conta bancária. Transferência
atômica, com tarifa como despesa separada. Estorno cria `REVERSAL`, preserva a
original e bloqueia duplicidade. Busca por texto ou valor exato, filtros e paginação
por cursor. Telas 1g, detalhe da movimentação e transferência.

## Em andamento

- Nada. Fase 4 fechada e enviada ao repositório.

## Pendente

- **Fase 5 — Baixas**: total, parcial, múltiplas, juros/multa/desconto, concorrência,
  idempotência, estorno de baixa, reconciliação. Tela 1e.
- **Fase 6 — Cartões**: compras, parcelas, ciclos, faturas, fechamento, pagamento
  parcial/total, reembolso, limite. Telas 1f e 2e.
- **Fase 7 — Dashboard e relatórios**: competência × caixa, previsto × realizado, por
  categoria/membro/conta/cartão, evolução, exportações. Telas 1b, 4a–4d, 5b.
- **Fase 8 — Experiência rápida**: botão central, formulários rápidos, sugestões,
  deep links, atalhos, notificações. Telas 1c, 6c, 6d.
- **Fase 9 — Supervisão familiar**: aprovações, limites, visibilidade, fluxos de filho.
  Tela 3c.
- **Fase 10 — Offline e sincronização**: WatermelonDB, outbox, conflitos, feedback.
- **Fase 11 — Qualidade e hardening**: cobertura, E2E, acessibilidade, performance,
  segurança, recovery, runbooks.
- **Fase 12 — Publicação**: documentos legais, store assets, beta, release.

## Testes falhando

- Nenhum. Total: **195 testes** (domain 53, validation 7, api-contracts 5, api 111,
  mobile 19).

## Migrações aplicadas

`0001_foundation` … `0012_attachments` — aplicadas no Postgres de desenvolvimento
(`localhost:5435`) e exercitadas no CI, inclusive re-execução para provar idempotência.

## Decisões recentes

Registradas em `docs/21-DECISIONS.md` (D-001 a D-039, mais as de fase). Destaques:
três roles de banco com o de runtime sem `BYPASSRLS`; valores da especificação que não
existem nos tokens ficam em `spec-values.ts` com a citação de origem; `isoDateSchema`
anota o retorno do `refine` como `boolean` de propósito, para o TypeScript não inferir
um predicado de tipo e vazar a marca `IsoDate` para todos os contratos.

## Bloqueios

1. **Gate visual não executado** — sem Android SDK, emulador ou Xcode neste ambiente.
   Para destravar: `npm run db:up && npm run db:migrate`,
   `npm run --workspace @ff/api dev`, `npm run --workspace @ff/mobile start` e
   `npm run --workspace @ff/mobile android` (ou `ios`).
2. **Provedor de e-mail transacional** — segredo externo. A porta `Mailer` está pronta;
   em desenvolvimento o link vai para o log, o que permite testar cadastro, convite e
   magic link ponta a ponta.
3. **Bucket S3-compatível para anexos** — o registro do anexo e o caminho escopado já
   existem; falta o provedor de storage e a URL assinada.
4. **Contas de loja, DSN do Sentry** — Fases 11 e 12.

## Próxima ação exata

Iniciar a **Fase 5 — Baixas**:

1. Serviço `settlePlannedEntry` em `apps/api/src/modules/planning/`: transação
   SERIALIZABLE, `expectedVersion`, principal ≤ saldo em aberto
   (`OUTSTANDING_AMOUNT_EXCEEDED`), juros/multa/desconto separados, criação da
   movimentação vinculada e recálculo do status.
2. Estorno de baixa: reabre a conta prevista (SETTLED → PARTIAL/OPEN), exige motivo,
   bloqueia estorno duplicado.
3. Testes obrigatórios de docs/13 §2: baixa parcial, baixa completa após parcial,
   excesso, concorrência (duas baixas simultâneas), idempotência.
4. Tela 1e (`design/screenshots/1e-baixa-parcial.png`) com MoneyInput 28, os três
   campos de encargos, o banner "Total que sai da conta", o histórico de baixas e o
   CTA "Confirmar baixa de R$ X".
