# PROGRESS.md

## Status geral

- Fase atual: **Fase 12 — Publicação (o que não depende de conta de loja está feito)**
- Fases concluídas: **0 a 11**
- Última atualização: 2026-08-09
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

### O defeito que o gate escuro achou sem ser visual

Durante as capturas a sessão caiu duas vezes com "Sua sessão expirou", em menos
de meia hora de uso. A causa: **o app só renovava o access token no arranque**.
O token vale 15 minutos (`JWT_ACCESS_TTL=900`); passados eles, toda requisição
respondia 401 e a pessoa era devolvida ao login — que é exatamente o que o
refresh token existe para evitar.

Pior: o cabeçalho do `api-client.ts` já **prometia** a renovação automática
("Renovar o access token automaticamente uma vez por requisição, quando o
servidor responde 401"). O comentário descrevia um código que não existia.

Agora existe: `setTokenRefresher` liga o cliente HTTP ao `session-store`, o 401
de token expirado renova e repete a requisição uma única vez, e renovações
concorrentes compartilham a mesma promessa (single-flight) — dez telas que
falham juntas disparam um refresh, não dez. Se o refresh falhar de verdade
(sessão revogada em outro aparelho), aí sim o app limpa o Keychain e volta ao
login.

### Tema escuro — o defeito que a varredura estática pegou

Antes de capturar qualquer tela, uma varredura estática confirmou o que o
CLAUDE.md exige: **nenhum literal de cor fora de `tokens.ts`**, e `light` só é
importado em `theme.tsx`. Mas ela também revelou um defeito repetido em **sete
lugares**: "branco sobre cor" tinha sido escrito como `colors.surfaceElevated`,
que no tema escuro é #201F1D — quase preto.

No claro ninguém notava, porque lá `surfaceElevated` é #FFFFFF. No escuro,
o "Saldo consolidado" ficava quase preto sobre o verde, o "+" da BottomNav
sumia no círculo, o texto do botão primário desaparecia, e o scrim do
BottomSheet virava um véu BRANCO sobre a tela.

A correção é `spec-values.fixedColors`: duas cores que **não trocam com o
tema**, porque não descrevem a superfície do app e sim o que está por baixo
delas — `onBrand` (branco sobre o card brand, medido em `5b-tema-escuro.png`:
#FFFFFF sobre #1E8A7D) e `scrim` (escuro nos dois temas). Corrigidos: `Text`
tone onBrand, `Button`, `BottomNav`, `Chip`, `StatusChip` onCard, `Avatar` e o
filtro ativo da 1g.

A captura da 1f no escuro achou o oitavo: a **barra de limite** do card da
fatura usava `colors.surface` como preenchimento — branco no claro, quase
preto no escuro, sumindo dentro do cardNavy. Também virou `fixedColors`.

Reconferidas no escuro depois das correções: **1b, 1c, 1d, 1e, 1f, 1g, 2a, 3a,
4a, 8c, 8d e 8g** — doze das vinte e seis. Quatro delas são as que provam cada
correção:

- **3a** — os avatares: iniciais **brancas** sobre os círculos coloridos. Antes
  seriam quase-pretas.

- **1c** — a folha do lançamento rápido: a tela por trás aparece escurecida,
  não clareada. É o scrim.
- **1f** — o card cardNavy: chip translúcido branco, barra de pagamento em
  toastAction e barra de limite branca, todas legíveis sobre o navy.
- **1g** — o filtro "Agosto ✕" ativo: texto branco sobre brand.

Faltam as demais — a expectativa é que estejam certas, já que as oito
correções foram todas em componentes compartilhados, mas isso é hipótese até
capturar, que é exatamente o erro que o CLAUDE.md manda não cometer.

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

- **1e · Dar baixa (claro)** — bate com o screenshot depois das oito divergências
  abaixo, com os dois estados exercitados (conta sem baixa e conta com baixa
  parcial, que traz o histórico).

- **1f · Fatura do cartão (claro)** — bate com o screenshot depois das dez
  divergências abaixo, com fatura fechada, compra parcelada, compra estornada e
  pagamento parcial na tela.

- **8g · Detalhe de conta prevista (claro)** — bate com o screenshot depois de
  cinco correções, incluindo **os dois blocos que o `CLARIFICATIONS-02` pediu**:
  **Histórico de baixas** (mesma linha da 1e; baixa estornada aparece riscada
  com "● Estornada" e o motivo, e não conta no "Já pago") e **Anexos** (chip por
  arquivo com o badge do formato e a área tracejada "+ Foto"). Além deles: o
  subtítulo do cabeçalho saiu, o status virou texto inline em vez de chip, os
  campos viraram rótulo/valor com "agosto 2026 · vence 05/08", e o CTA "Dar
  baixa" subiu para logo depois dos campos.
- **8f · Detalhe de movimentação (claro)** — bate com o screenshot depois de
  quatro correções: título fixo "Movimentação" (era a descrição do lançamento),
  card de cabeçalho com ícone da categoria, "TIPO · ESTADO" em caixa alta,
  descrição e o chip de envio, campo a campo como **rótulo à esquerda e valor à
  direita** (eram ListRow empilhados), e o rateio com avatar, percentual e a
  linha de fechamento "✓ Soma dos rateios = total". **Falta o "Editar"** do
  cabeçalho: movimentação postada não se edita — corrige-se por estorno, que é
  o que o próprio banner da tela diz.
- **8e · Transferência (claro)** — bate com o screenshot depois de seis
  correções: título "Transferência", valor grande **neutro** e centralizado (o
  app usava o MoneyInput com borda brand, que é o card de receita/despesa), o
  par De/Para num card único com os saldos atuais em vez de duas filas de
  chips, Membro e Data lado a lado, a tarifa atrás de um toggle "Houve tarifa
  bancária" com valor e categoria próprios — antes era um campo solto chamado
  "Tarifa (opcional)" —, e a prévia dos saldos depois, que não existia.
- **8d · Gestão de categorias (claro)** — bate com o screenshot depois de seis
  correções: "+ Nova" como botão primário no cabeçalho (era um formulário solto
  no fim da tela), segmented no singular, linhas com o ícone da categoria e a
  meta "do sistema · N subcategorias" / "criada pela família · N", subcategorias
  numa linha só, arquivada com line-through e "Reativar", e o card
  **"Editar «nome»"** com a grade de ícones e os swatches de cor — que não
  existia. A escolha grava o NOME do ícone e o NOME do token de cor nas colunas
  `icon`/`color` que já existiam; `categoryVisual` resolve nessa ordem: escolha
  da família → mapa por nome → "Outros". Categoria do sistema não tem "Editar".
  O conjunto curado tem 14 ícones (o screenshot mostra "+24" de um conjunto de
  30), então o botão diz "+8" — o número real do que está implementado.
- **8c · Dispositivos e sessões (claro)** — bate com o screenshot depois de
  cinco correções: subtítulo explicando o que revogar faz, a **sessão atual
  separada** em "ESTE APARELHO", num card de borda brand com o chip "● Atual"
  (antes era mais uma linha da lista, marcada só por "· este aparelho"),
  "OUTRAS SESSÕES · N" com ícone de aparelho e a meta em tempo relativo
  ("há 2 horas", "ontem", "há 38 dias") no lugar da data de criação, a linha
  "◌ Inativa há mais de 30 dias" derivada de `lastSeenAt`, e o CTA "Revogar
  todas as outras sessões" com a microcopy — que não existiam.
- **8b · Convite de membro (claro)** — também era "sem screenshot dedicado" e
  foi refeita: e-mail antes do nome (é ele que identifica o convite), rótulo
  "Nome de exibição", e a correção que o `CLARIFICATIONS-02` pediu — o chip é
  **"Filho"**, e "supervisionado" virou um toggle num card próprio, com
  "Exigir aprovação" e o valor limite dentro dele; antes o app derivava
  `isSupervised` do papel e mostrava "Filho supervisionado" como se fosse um
  quinto papel. Ganhou também o card "Prévia do convite" (texto derivado, não
  persistido) e perdeu o card de habilidades por papel, que não existe no
  design.
- **8a · Criação de família (claro)** — a tela existia como formulário genérico
  ("sem screenshot dedicado"); o Turno 8 trouxe o screenshot e ela foi refeita:
  ícone de casa em brandSoft, título e subtítulo verbatim, helper "é o nome que
  os outros membros veem", Moeda e Fuso horário como selects lado a lado (eram
  fixos em BRL/São Paulo, sem UI), e o card informativo "Seu papel" com o selo
  Proprietário e as três habilidades — informativo porque o papel é derivado de
  quem cria, não escolhido. **Falta o link "Tenho um convite para aceitar"**: a
  rota de convite exige um token, que só chega por deep link, e não existe
  fluxo de digitar código.
- **4a · Visão geral / 4b · Por categoria / 4c · Por membro (claro)** — batem
  com os screenshots depois de sete correções: seletor de mês em pílula no
  cabeçalho (era linha centralizada), o segmented "Geral | Categoria | Membro"
  deu lugar à **lista de navegação** do design, KPI com rótulo em caixa alta e
  seta ("↑ RECEITAS") e a comparação nomeando o mês ("+ 12% vs julho"), gráfico
  de evolução em **barras verticais pareadas** com o mês corrente em brand
  (eram barras horizontais empilhadas), título "Evolução — últimos 6 meses"
  dentro do card, legenda com ■, e as barras da 4b com cores variadas dos
  tokens em vez de tudo em expense. 4b e 4c viraram visões com cabeçalho
  próprio, alcançadas pela lista.
  **Faltam "Por conta e cartão" e "Parcelamentos e faturas"** na lista: os dois
  destinos aparecem no screenshot da 4a, mas nem o SCREEN-SPECS nem os
  screenshots descrevem essas telas — linha que não leva a lugar nenhum é pior
  que linha ausente.
- **3d · Atividade (claro)** — bate com o screenshot depois de cinco correções:
  título "Atividade", cabeçalho de dia "HOJE · SEX, 07/08", banner fechando a
  tela em vez de abrindo, com a copy verbatim, e — a mais séria — a linha
  "antes → depois" deixou de despejar interno: mostrava
  `status: POSTED → REVERSED · reversalId: — → 62825a04-…` e `netMinor: — →
  15000`. Agora só campos de uma lista de permissão aparecem, com rótulo em
  pt-BR e centavos formatados como dinheiro. Dez ações que caíam no nome cru em
  inglês ("Ana card statement closed") ganharam frase.
  **Falta o botão "Filtrar ▾"** do cabeçalho: nem o SCREEN-SPECS nem o
  COMPONENT-SPECS dizem por o que ele filtra, e inventar as opções seria criar
  copy fora da especificação.
- **3b · Permissões do membro (claro)** — bate com o screenshot depois de três
  correções: "Exigir aprovação" vira select em pílula pendingSoft (era fila de
  chips), "Valor limite sem aprovação" vira linha do mesmo card com o valor à
  direita, e o rodapé perde a divisória. A lista de contas autorizadas aparece
  quando o membro tem permissão concedida; sem nenhuma, todas caem no bloco
  "Sem acesso", como manda o próprio design.
- **3a · Membros (claro)** — bate com o screenshot depois de quatro correções:
  lápis no lugar do botão "Editar", "· você" discreto ao lado do nome,
  "Revogar" como texto danger e rodapé sem divisória. **Falta o chip
  "● 1 aguardando"** em "Aprovações pendentes": aprovação de lançamento ainda
  não existe no servidor — é a Fase 9, e inventar o número seria mentir na
  tela.
- **2e · Compra parcelada (claro)** — bate com o screenshot depois de sete
  correções: Cartão e Data como selects lado a lado (a data era um campo de
  texto ISO), Descrição ao lado de "Categoria · Membro" num select só, chip
  "Outro ▾" no lugar do 12× fixo, prévia das parcelas como linhas
  ("Parcela 1 de 3" / "fatura de agosto · vence 15/08") com o arredondamento
  virando selo ao lado do título, soma das parcelas em banner brandSoft com o
  valor à direita, e "Limite após a compra" como linha simples, sem card.
- **2d · Ajuste de saldo (claro)** — já estava fiel; faltavam o subtítulo com a
  conta ("Conta Corrente · Banco Andar") e o "Cancelar" como link centralizado,
  não como botão secundário. O banner informativo fica abaixo da dobra da folha
  no viewport do Android, que tem a barra de status mais alta que a do design.
- **2c · Detalhe da conta (claro)** — bate com o screenshot depois de seis
  correções: subtítulo com titular e selo de visibilidade colorido, lápis de
  editar no cabeçalho, ícones nos três botões de ação, "Extrato" à esquerda com
  o seletor de mês em pílula à direita, linhas do extrato com ícone da natureza
  e meta "06/08 · motivo: … · por Ana" (transferência neutra, nomeando o
  destino), e o rodapé de arquivamento numa linha só com a ação em danger. O
  autor e a conta de destino precisaram entrar no contrato do extrato.
- **2b · Nova conta (claro)** — bate com o screenshot depois de sete correções:
  título fixo "Nova conta" (o formulário é um só; quem muda de nome é o CTA),
  Instituição e Titular dividindo a linha, Titular e "Quem pode ver e usar"
  como selects — este com a lista das opções embaixo —, banner do cartão com a
  copy exata, campos do cartão distribuídos como no design (Bandeira | Final,
  Limite | Fecha dia | Vence dia), "Conta padrão para pagar a fatura", e os
  blocos Cor (swatches, guardando o NOME do token) e Moeda, que faltavam.
- **2a · Lista de contas (claro)** — bate com o screenshot depois de seis
  correções: título "Contas" (não "Contas e cartões"), "+ Nova conta" como botão
  primário em brand, rótulos do resumo em caixa alta com "DÍVIDA EM CARTÕES" em
  expense, linha de conta com círculo claro e iniciais no lugar do ícone
  genérico ("CC" de Conta Corrente), título com a instituição e selo de
  visibilidade colorido dentro da meta, e linha de cartão com o bloco do final
  em cardNavy/cardWine, o titular na meta e o estado da fatura
  ("● Fatura parcial") — este último exigiu expor `currentStatementStatus` no
  contrato da conta.
- **1c · Lançamento rápido (claro)** — a tela era um placeholder de fase; foi
  construída inteira contra o screenshot: folha sobre scrim, segmented
  "↓ Despesa | ↑ Receita | Mais ▾", valor em 44 centralizado com cursor brand,
  chips de conta/categoria/membro/data, sugestões recentes, teclado numérico
  próprio (3 colunas, teclas 52, última linha , · 0 · ⌫), "Salvar" com flex 1.6
  ao lado de "Salvar e lançar outra" e o link "Mais detalhes ▾". Dois defeitos
  de layout apareceram no caminho: texto de 44 sem `lineHeight` era cortado no
  Android, e o `BottomSheet` empurrava o rodapé para fora da tela quando o
  conteúdo passava dos 88% — os dois valem para todas as folhas.
- **1g · Movimentações (claro)** — bate com o screenshot depois das nove
  divergências abaixo, com despesa, receita, compra no cartão e movimentação
  estornada na tela.

### Divergências da 1g, corrigidas

1. **Rótulos dos filtros cortados a um pixel de altura.** A fila de filtros é um
   ScrollView horizontal e estava sendo espremida pela lista; faltava `flex: 1`
   na lista e `flexGrow: 0` na fila.
2. **Faltava o filtro de período** ("Agosto ✕", aplicado por padrão).
3. **Ícone da busca era o ⇄ da navegação**, não a lupa.
4. **Cabeçalho de dia em "07/08/2026"**; o design escreve "HOJE · QUI, 06/08",
   "ONTEM · QUA, 05/08", "TER, 04/08".
5. **Meta começando pelo tipo da movimentação** ("Despesa · Moradia · Ana"). O
   design não repete em texto o que o ícone já diz: é conta · membro ·
   categoria, ou o estado quando existe.
6. **Compra no cartão com ícone de cartão.** COMPONENT-SPECS §Ícones: no extrato
   o ícone é da NATUREZA — compra no cartão é despesa (seta para baixo); o
   cartão é o do PAGAMENTO da fatura. Transferência e estorno passam a
   chipNeutral/textTertiary, e o ajuste ganhou o ícone que faltava.
7. **Transferência, pagamento de fatura e estorno com sinal e cor de despesa.**
   Nenhum é despesa: valor neutro, sem sinal.
8. **Estado como pílula abaixo da linha**; o design põe "● Estornada · motivo:
   valor errado · por Ana" na própria meta, com o título riscado. Isso exigiu
   expor o motivo e o autor do estorno no contrato — eles moram na movimentação
   de REVERSAL, não na original.
9. **A movimentação de estorno virava linha própria**, contando o mesmo fato
   duas vezes. O screenshot mostra só a original riscada.

### Divergências da 1f, corrigidas

1. **Navegação entre faturas numa linha própria**, com chevrons e o intervalo do
   ciclo. O design põe "‹ jul · ago · set ›" no subtítulo, ao lado de
   "Cartão Azul • • • • 4412".
2. **A tela abria na fatura mais recente** — que, com um parcelamento em 10x, é
   a de daqui a dez meses. Agora abre no ciclo corrente.
3. **Faixa de status do card só com "FATURA"**; o design escreve
   "FATURA FECHADA · VENCE 15/08".
4. **Chip de status opaco** sobre o cartão escuro; COMPONENT-SPECS pede
   translúcido (branco a 16%, medido).
5. **Pago/Falta pagar e limite numa frase só**, abaixo das barras. O design põe
   dois rótulos alinhados às pontas ACIMA de cada barra.
6. **Barras com as cores erradas**: o preenchimento do pagamento é toastAction e
   o do limite é branco, sobre trilho branco a 18% — não income e info.
7. **"COMPRAS · 12"** onde o design escreve "COMPRAS · 12 ITENS", e
   **"PAGAMENTOS · N"** onde o design não conta.
8. **Parcela grudada na descrição da compra.** O servidor gravava
   "Curso de inglês — Caio · parcela 03/10" como nome da movimentação; o design
   mostra o título limpo e um selo. Virou coluna (migração 0014, com o resgate
   das linhas já existentes), nasceu o componente `Badge` e um teste garante a
   descrição limpa.
9. **Valor da compra em expense com sinal.** Medido no screenshot: textPrimary
   sem sinal — na fatura a compra já é despesa por definição. Estorno e
   reembolso ficam em income com "−". A linha estornada esmaece inteira.
10. **Avatar do membro com a cor da paleta** onde o design usa chipNeutral com a
    inicial em textTertiary; **linha de pagamento** sem valor à direita e com o
    ✓ dentro do título, em vez do container incomeSoft do design. Faltava também
    a microcopy do CTA.

### Divergências da 1e, corrigidas

1. **Subtítulo com a data de vencimento** ("Água · vence 03/08/2026") onde o
   design traz a natureza da conta: "Mensalidade escola — Caio · conta a pagar".
2. **"Já pago" sem a contagem de baixas**; o design escreve "Já pago (1 baixa)".
3. **Status como chip**, onde o design usa "44% pago · status: ● Parcial" numa
   linha de texto só, com o ponto na cor do estado. E "Vencido" virou "Vencida".
4. **Juros, multa e desconto como texto solto** ("0,00"); o design mostra
   dinheiro formatado dentro do campo ("R$ 6,20").
5. **Conta usada como fila de chips** e **data como campo de texto ISO**
   ("2026-08-07"). O design tem dois selects lado a lado: "CONTA USADA · Conta
   Corrente · Bruno ▾" e "DATA · Hoje, 06/08 ▾". Nasceram daí os componentes
   `SelectField`, `OptionSheet` e `DateField` — este último com o seletor de
   data nativo do sistema, que não traz tema próprio.
6. **Banner do total em info (azul), com a soma escrita na frase.** O design usa
   brandSoft com o rótulo à esquerda e o valor à direita.
7. **Histórico de baixas fora do desenho**: o design tem ✓ em container
   incomeSoft, "R$ 400,00 · Conta Corrente" no título, "02/08 · por Ana" na meta
   e "Estornar" como texto danger à direita — o app usava um botão com borda.
8. **Microcopy alinhada à esquerda** e rodapé com linha divisória; o design
   centraliza a microcopy e não desenha divisor.

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

### Fase 9 — Supervisão familiar

A movimentação do filho supervisionado nasce `PENDING_APPROVAL` em `transactions` e,
por isso, já não afeta saldo, limite nem relatório — todos somam apenas `POSTED`
(D-055). `approval_requests` guarda quem pediu, **qual regra estava valendo no momento
do pedido** e quem decidiu. Gatilho no banco torna a proposta imutável enquanto pendente
e restringe a decisão a quem opera finanças — no Postgres, não só no serviço. Recusar
não apaga: vira `REJECTED` e continua auditável. Compra em cartão pendente não entra na
fatura nem consome limite antes da decisão. Telas 3c e a lista que a 3a abre.

### Fase 10 — Offline e sincronização

WatermelonDB sobre SQLite, espelhando as tabelas de LEITURA de docs/11 §1 mais a
`outbox`, que é a única de escrita. A chave de idempotência nasce no enfileiramento,
não no envio — é isso que torna o reenvio seguro quando não se sabe se o primeiro
envio chegou. Só despesa, receita, compra simples no cartão e conta prevista saem
offline; baixa, pagamento de fatura, transferência, estorno e aprovação devolvem
`OFFLINE_OPERATION_REJECTED`, porque NÃO ficam guardadas esperando a rede. Os cinco
estados de feedback de docs/11 §4 aparecem na faixa de sincronização. Verificado no
emulador em modo avião: lançamento salvo no aparelho, faixa "◌ Aguardando
sincronização", rede de volta e o lançamento postado sem duplicar.

Dois defeitos que este ciclo achou, os dois em componentes já "aprovados": a `Banner`
sobrepunha a ação ao texto quando a mensagem era longa (faltava `flexShrink`), e o
rótulo de ação era decorativo — não tinha toque nenhum ligado.

### Fase 11 — Qualidade e hardening

E2E dos 15 fluxos de docs/13 §5 num teste narrativo, com o saldo conferido em
centavos a cada passo. Cobertura com piso no CI (linhas 92,2%, funções 92,8%).
Índice de cursor `(household_id, occurred_at DESC, id DESC)` — confirmado no
`EXPLAIN` como Index Scan sem nó de Sort — e dois índices redundantes removidos.
`docs/22-RUNBOOKS.md` cobre backup, restauração, migração, revogação,
recuperação de acesso, diagnóstico por `request_id`, fila de sync parada e
rotação de segredos.

O varrimento de acessibilidade achou um defeito maior do que procurava:
**"Esqueci a senha" chamava o mesmo handler do link mágico**. A pessoa pedia
para trocar a senha e recebia um link de entrada. "Recuperação de acesso" é tela
obrigatória do pacote (docs/07 §3) e não existia. Agora tem endpoint próprio,
resposta neutra, token de uso único de 60 minutos, tela de senha nova por deep
link, e a redefinição derruba todas as outras sessões.

### Fase 12 — Publicação

`docs/23-STORE.md` (ficha das duas lojas, classificação, declarações de coleta e
justificativas de permissão), `docs/legal/` (minutas de política de privacidade e
termos, conferidas contra o código e marcadas para revisão jurídica),
`docs/24-RELEASE-CHECKLIST.md` (status real item a item) e o smoke test pós-release,
9/9 verde no ambiente local. Removida do `Info.plist` a permissão de localização
que vinha do template e nunca foi usada — declarar permissão que não se usa é
motivo de recusa na App Store.

## Pendente

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

O status item a item do checklist de release está em `docs/24-RELEASE-CHECKLIST.md`.
Aqui ficam só os que impedem chamar o projeto de pronto.

### Resolvíveis por código, nesta máquina

1. **Central de notificações (6d) e preferências** — as duas telas de
   "Aparência, notificações e privacidade" ainda são `PhasePlaceholder`. Faltam a
   tabela `notifications`, as preferências por tipo e a central no app; só o
   ENVIO depende de FCM/APNs.
2. **Atalhos do ícone** (docs/12, telas 6c) — o lançamento rápido existe; falta
   expor os atalhos e retomar a intenção depois do login.
3. **Jobs de recorrência e notificação agendada** — a recorrência pura está em
   `@ff/domain`; falta quem a dispare no fuso da família.

### Bloqueios de responsabilidade humana

Nenhum destes sai por código, e todos estão registrados também em
`docs/23-STORE.md`:

1. **macOS com Xcode** — build e gate visual do iOS.
2. **Contas de loja** (App Store Connect, Play Console) e certificados.
3. **Revisão jurídica** das minutas em `docs/legal/`.
4. **Provedor de e-mail transacional** — a porta `Mailer` está pronta; em
   desenvolvimento o link vai para o log.
5. **Bucket S3-compatível** para anexos — registro e caminho escopado prontos.
6. **DSN do Sentry** e infraestrutura de homologação e produção.
7. **FCM/APNs** para push.
8. **Aparelhos reais** para teste de dispositivo e leitor de tela.

### Gate do tema escuro — FECHADO

As **27 telas** foram medidas no emulador em tema escuro. O caminho achou quatro
defeitos, nenhum deles de cor pura:

- o **nono** caso de `fixedColors`: o "F" do logotipo da 6a saía #201F1D sobre
  verde. Escapou da varredura anterior por usar `RNText` direto, sem passar pelo
  `tone` do componente `Text`;
- a 8b mostrava "R$ 50,00" como PLACEHOLDER: a prévia dizia "acima de R$ 0,00" e
  o convite saía com limite ZERO — toda despesa do filho exigindo aprovação,
  enquanto a tela prometia o contrário;
- o botão "Transferir" da 2c ia para o placeholder de "fase seguinte", deixando
  a `TransferScreen` (existente desde a Fase 4) inalcançável pelo caminho natural;
- a auditoria mostrava "Alguém" para todo mundo menos você, e jogava o enum em
  inglês na tela quando a ação não tinha frase escrita.

### Resolvidos desde o registro anterior

- ~~Os testes truncavam o banco de desenvolvimento~~ — banco de teste próprio
  (D-050).
- ~~Gate do tema escuro não iniciado~~ — **as 27 telas fechadas**, com quatro
  defeitos achados no caminho (acima), além do `surfaceElevated` e do `maxHeight`
  do BottomSheet encontrados nas primeiras passadas.

## Próxima ação exata

1. Central de notificações (6d) e preferências por tipo.
2. Atalhos do ícone (6c) e jobs agendados.
3. Entregar os bloqueios humanos a quem os destrava.
