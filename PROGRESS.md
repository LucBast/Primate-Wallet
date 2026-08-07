# PROGRESS.md

## Status geral

- Fase atual: **Fase 8 — Experiência rápida (a iniciar)**
- Fases concluídas: **0, 1, 2, 3, 4, 5, 6, 7**
- Última atualização: 2026-08-06
- Responsável: Claude Code
- Repositório: https://github.com/LucBast/Primate-Wallet (branch `main`)

## Gate de fidelidade visual

**O gate foi executado pela primeira vez em 2026-08-07**, no emulador Android
(Medium_Phone_API_36.1, forçado a 1170×2532 @ 480dpi = exatamente 390×844 dp, como
manda UI-FIDELITY-RULES §3). O ambiente tem Android Studio, SDK e emulador; o bloqueio
anterior não existe mais. Falta o gate no iOS (sem macOS aqui) e no tema escuro.

Método: em vez de comparar a olho, os PNGs são medidos em pixel
(`ffmpeg` → rgb24 → varredura de transições de cor). Os screenshots do design têm
moldura de 1px e 1px = 1dp — confirmado medindo o botão central da BottomNav em
`1b-inicio.png`, que dá exatamente os 54 do token `layout.navCenterButton`. Isso torna
as medidas do design e do app diretamente comparáveis.

Para ter o que comparar, `npm run seed:demo --workspace @ff/api` cria a Família Souza
(Ana, Bruno, Caio) com as contas, o cartão e os lançamentos de agosto de 2026 dos
screenshots. O seed é calibrado pelo `1b-inicio.png`; estados que só a 1d mostra
(baixa parcial, conta paga, recorrente, parcelada) são criados à parte para a
captura e desfeitos com um novo `seed:demo` — os dois screenshots do design não
saem do mesmo conjunto de dados.

Os testes de integração rodam em `family_finance_test`, criado por
`npm run db:test:prepare --workspace @ff/api`. Antes disso, o TRUNCATE de cada
arquivo de teste apagava o seed e `npm run verify` deixava o gate sem dados.

### Telas aprovadas no gate

- **6a · Login** — bate com o screenshot depois das correções abaixo.
- **1b · Início (claro)** — bate com o screenshot. Todos os itens do
  CLARIFICATIONS-01 aplicados, incluindo ícone por categoria e linha de fatura.
- **1b · Início (escuro)** — bate com `5b-tema-escuro.png`. Mesmo layout, mesma
  copy, tokens trocados 1:1. Verificado por pixel: `surface` #161514, `brand`
  #1E8A7D e a nav em `surfaceElevated` #201F1D, todos exatamente os valores do
  `dark`. Varredura de 5 colunas não encontrou nenhum hex do `light` — o único
  #FFFFFF está em y=6–8dp, que é o relógio do Android, fora do app.

- **1d · Planejamento (claro)** — bate com o screenshot depois da correção das
  sete divergências abaixo. Medido: pílula de mês 34 (design 34), trilho do
  segmented 39 (39), mini-cards 55 (55), linha simples 56 (56), linha parcial
  64 (66), barra de progresso 247 de largura (250). Os quatro estados da tela
  foram exercitados no emulador — aberta, vencida, parcial e paga, mais
  "recorrente" e "parcelamento".

### Divergências da 1d, corrigidas

1. **Seletor de mês fora do cabeçalho.** O app punha "+ Nova" ali e o seletor
   centralizado no conteúdo. O design tem título à esquerda e "‹ Ago 2026 ›" à
   direita — e não tem botão "+ Nova" (criar é o "+" central da nav).
2. **Setas do seletor de mês em `chevron-left`/`chevron-right`.** O design usa
   os glifos ‹ › (3–4dp contra ~10 do ícone). Virou o componente `MonthPicker`,
   agora compartilhado com a 1b — que tinha a mesma divergência, não vista no
   gate anterior.
3. **Linha paga apresentada errada.** O app riscava o VALOR e mostrava um chip;
   o design risca o TÍTULO, escreve "● Paga em 04/08 · Conta Corrente" em income
   e deixa o valor em textSecondary. Exigiu dois campos novos no contrato
   (`lastSettlementDate`, `lastSettlementAccountName`), com teste.
4. **Baixa parcial sem barra na lista.** Agora traz "● Parcial · falta R$ X de
   R$ Y", a ProgressBar na largura da coluna de texto e "Completar ›".
5. **Status como chip, onde o design usa texto inline** com ponto e cor
   semântica na linha de meta, e a ação à direita abaixo do valor
   (COMPONENT-SPECS §ListRow).
6. **Copy "Vencido"/"Aberto"** onde o design concorda com "conta": Vencida,
   Aberta, Paga, Parcial, Cancelada.
7. **Rótulos dos KPI em caixa normal e todos em textSecondary.** O design usa
   caixa alta e colore o rótulo junto com o valor (PAGO income, FALTA PAGAR
   warning). Os mini-cards também tinham a geometria do Card comum (65 de
   altura) em vez da do Field (55).

Além dessas: a data da meta passou a "vence sáb, 08/08" (formato já aprovado na
1b), o trilho do segmented caiu de 44 para 39 e `settledPercentage` passou a
arredondar — 400,00 de 910,10 é "44% pago" no design, e truncando dava 43.

### Telas ainda sem gate

1e, 1f, 1g, 2a–2e, 3a, 3b, 3d, 4a–4d e as sete do Turno 8 (8a–8g), mais o tema
escuro de todas. O ferramental está pronto e o custo por tela é baixo.

### Divergências encontradas e corrigidas

1. **Field 8dp mais alto que o design** (todos os formulários). O campo forçava
   `minHeight: minTouch − 18`, um valor sem respaldo em spec algum, fechando em 61dp
   contra os 53 do design. Agora usa `fieldValueHeight` (spec-values) e mede 53
   exatos, com interior de 51 — idêntico ao design.
2. **Gap entre campos 12dp** onde o design mede 16 (6a).
3. **Avatar do header em azul** (cor sorteada pelo id) onde o design mostra brand.
   `Avatar` ganhou `tone="brand"`; a paleta por semente continua na lista de membros.
4. **Seletor de família sem o ▾** e visível só com mais de uma família. O screenshot
   mostra "Família Souza ▾" sempre.
5. **Seletor de mês "ago de 2026"** onde o spec e o screenshot pedem "Ago 2026".
6. **"Previsto × realizado" com "ago de 2026"** onde o screenshot mostra "agosto".
7. **Banner de vencidas com em dash inline** ("… R$ 640,00 — Resolver ›"); o
   screenshot separa e alinha "Resolver ›" à direita.
8. **"PRÓXIMOS COMPROMISSOS" em caixa alta acima do card**; o screenshot põe
   "Próximos compromissos" DENTRO do card, em caixa normal, com "Ver todos ›" na
   mesma linha. Mesma correção em "Resumo por membro".
9. **Linhas de compromisso sem o container de ícone** exigido por COMPONENT-SPECS
   §ListRow ("container 30–36 raio 10–12 com fundo *Soft").
10. **Meta "vence 08/08/2026"** onde o screenshot mostra "vence sáb, 08/08".
11. **"Caio" sem a marca de filho supervisionado**; o screenshot mostra "Caio · filho".
12. **"Movimentações" truncado para "Movimentaçõ…"** na BottomNav. Os cinco espaços
    eram divididos por igual (75dp); o slot central agora ocupa os 54 do botão e
    sobram 81 por rótulo.

### Segunda rodada, com as respostas de design/CLARIFICATIONS-01.md

13. **Nenhum token de tipografia tinha `lineHeight`** — cada texto crescia pela métrica
    natural da Manrope e o erro acumulava (o card de biometria da 6a fechava em 81dp
    contra 66 do design). `CLARIFICATIONS-01` publicou o `lineHeight` de todos os
    estilos e criou `type.banner`. `design-tokens.ts` foi recopiado verbatim.
14. **`Field` com altura fixa**: o design determinou não fixar. Com os `lineHeight`
    dos tokens o card fecha sozinho em 52–54dp contra os 53 do design. Os dois
    `spec-values` que existiam para tapar essas lacunas (`fieldValueHeight` e
    `bannerLineHeightRatio`) foram removidos — viraram token.
15. **Saldo consolidado com os rótulos trocados.** O design é consistente na 1b:
    Consolidado = Σ contas (não desconta cartão), Disponível = consolidado − cartões.
    O app fazia o inverso. Corrigido no serviço, com teste.

### Terceira rodada, no gate da 1d

16. **Seletor de mês com os chevrons do set de ícones** também na 1b. O design usa os
    glifos ‹ ›; virou o componente `MonthPicker`, usado pelas duas telas. A pílula
    também esticava até a altura do segmented em vez dos 34 do design.
17. **Trilho do segmented com 44 de altura** contra 39 medidos na 1d (35 na 1b — os
    dois screenshots divergem, e o COMPONENT-SPECS não dá a altura). Ficou 39, com
    `hitSlop` mantendo os 44 de toque.

### Divergências anteriores, reavaliadas

- 6a, toggle de biometria ligado no design e desligado no app: mantido desligado — o
  próprio texto do card diz "ativado em Segurança após o login".
- 6a, altura do botão primário: o screenshot mede ~50dp, mas `design-tokens.ts`
  (`buttonHeight: 54`) e COMPONENT-SPECS dizem 54. Dois contra um, e o token é cópia
  verbatim e inegociável (CLAUDE.md item 1) — fica 54.
- 3a, "Administradora" no screenshot: segue "Administrador"; o modelo não guarda gênero.

Muitas dessas correções são em componentes compartilhados (`Field`, `Avatar`, `Banner`,
`ListRow`, `BottomNav`, `SegmentedControl`, `MonthPicker`), então provavelmente
melhoraram telas ainda não medidas — mas isso é hipótese até o gate de cada uma.

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

## Defeito CORRIGIDO — compra em cartão não entrava na fatura

**Encontrado e corrigido em 2026-08-07, durante o gate visual da 1b.**

A anexação à fatura virou `card/statement.ts`, usada pelos TRÊS caminhos que criam
`CARD_PURCHASE`: o endpoint dedicado, a despesa em conta de cartão e a baixa paga com
cartão. Três testes de regressão em `card.test.ts` provam os dois caminhos novos e o
formato exato da linha no dashboard. Depois do `seed:demo`: 1 fatura com 6 itens
somando R$ 3.250,00, fechando 10/08 e vencendo 15/08 — antes eram 0 e 0.

Também corrigidos junto: o formato da linha (`•••• 4412` e
`fecha 10/08 · vence 15/08`, COMPONENT-SPECS §Linha de fatura) e o tratamento dela na
1b — ícone `credit-card` em brandSoft, sem duplicar "vence", valor em textPrimary
porque fatura não é despesa.

Registro do diagnóstico original, para memória:

Uma despesa lançada em conta de cartão vira `CARD_PURCHASE`
(`transaction/service.ts:282`), mas **nenhum `card_statement_items` é criado**. Só o
endpoint dedicado `POST /card-purchases` (`card/service.ts:467-475`) anexa a compra a
uma fatura, via `cycleForPurchase` + `ensureStatement`.

Evidência no banco de desenvolvimento depois do `seed:demo`: 6 transações
`CARD_PURCHASE` somando R$ 3.250,00, e `card_statements` e `card_statement_items`
ambos VAZIOS. A dívida aparece em "Cartões em aberto" (que soma por
`app.account_balance`), mas a fatura fica zerada — ou seja, a compra nunca é cobrada
e não há como pagá-la pelo fluxo de fatura.

Foi assim que o defeito apareceu: a linha "Fatura · Cartão Azul •••• 4412" não surgiu
em "Próximos compromissos" da 1b. O serviço do dashboard JÁ monta essa linha
(`report/service.ts:311-326`) e o contrato JÁ tem `kind: 'CARD_STATEMENT'` — não havia
fatura nenhuma para listar.

Suspeito do mesmo problema em `planning/settlement-service.ts:206`, que também produz
`CARD_PURCHASE` ao dar baixa pagando com cartão. Não confirmado.

**Correção:** exportar `ensureStatement` de `card/service.ts` (hoje é privada, linha 83)
e chamá-la nos dois outros caminhos que criam `CARD_PURCHASE`, com teste que prove que
uma despesa em cartão aparece na fatura do ciclo certo.

## Formato da linha de fatura — divergente do spec

`report/service.ts:319` monta `Fatura · Cartão Azul • • • • 4412` (bullets separados por
espaço) e o meta só com `fecha 10/08`. O COMPONENT-SPECS §Linha de fatura, publicado em
CLARIFICATIONS-01, pede `•••• 4412` (quatro U+2022 colados, um espaço antes dos dígitos)
e meta `fecha 10/08 · vence 15/08`. Corrigir junto com o defeito acima — sem fatura no
banco, não dá para verificar a linha na tela.

## Ícones por categoria — pendente

O mapa oficial está em COMPONENT-SPECS §Ícones por categoria. O contrato do dashboard
manda a categoria no campo `meta` (`report/service.ts:308`), que é texto de exibição;
o certo é um campo `categoryName` próprio antes de ligar o mapa na UI.

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

1. **Gate visual do iOS e do tema escuro** — o Android está destravado e rodando; iOS
   exige macOS/Xcode, que não existe aqui. O tema escuro (5b) dá para medir no próprio
   emulador e ainda não foi feito.
2. **Os testes da API truncam o banco de DESENVOLVIMENTO.** `tests/helpers.ts` roda
   `TRUNCATE … CASCADE` usando o mesmo `DATABASE_*` do `.env`, então `npm run verify`
   apaga o seed de demonstração no meio de uma sessão de gate visual. Contorno atual:
   rodar `npm run seed:demo --workspace @ff/api` de novo. Correção de verdade: um banco
   `family_finance_test` separado, com `.env.test` próprio.
3. **Referências visuais pendentes com o design** — as 7 telas sem screenshot e as 3
   perguntas pontuais da 6a/3a foram truncadas no envio e precisam ser reenviadas
   (ver `design/CLARIFICATIONS-01.md`, itens 5 e 6).
4. **Provedor de e-mail transacional** — segredo externo. A porta `Mailer` está pronta;
   em desenvolvimento o link vai para o log.
3. **Bucket S3-compatível para anexos** — registro e caminho escopado prontos; falta o
   provedor e a URL assinada.
4. **Contas de loja, DSN do Sentry, FCM/APNs** — Fases 11 e 12.

## Próxima ação exata

**Terminar o gate visual antes de abrir a Fase 8.** O ferramental já existe e o custo
por tela agora é baixo:

1. `npm run db:up && npm run db:migrate`, `npm run dev --workspace @ff/api`,
   `npm run seed:demo --workspace @ff/api`, `npm start --workspace @ff/mobile` e
   `npm run android --workspace @ff/mobile`.
2. Emulador em 390×844 dp: `adb shell wm size 1170x2532 && adb shell wm density 480`.
3. Para cada tela: `adb exec-out screencap -p > tela.png`, medir com a varredura de
   pixel descrita acima e comparar com `design/screenshots/`.
4. Repetir tudo no tema escuro (5b).
5. Decidir a fórmula do saldo consolidado (divergência aberta nº 1).

Só então a **Fase 8 — Experiência rápida**:

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
