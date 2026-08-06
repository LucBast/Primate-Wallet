# SCREEN-SPECS — telas com referência visual obrigatória

Viewport de referência: 390×844. Cada tela tem screenshot em \`screenshots/\` — o critério de aceite. Copy em pt-BR é FINAL (copiar verbatim). Componentes citados = COMPONENT-SPECS.md.

## Turno 1 — Núcleo

### 1a · Design tokens (screenshots/1a-tokens.png)
Folha de referência de cores, chips de status, tipografia e componentes base. Não é tela do app — é o gabarito.

### 1b · Início / Dashboard (screenshots/1b-inicio.png)
Header: avatar 38 + "Olá, {nome}" + seletor "Família Souza ▾" + sino. Segmented Competência|Caixa + seletor de mês "‹ Ago 2026 ›". Card Saldo consolidado (brand): moneyLg + Disponível/Cartões em aberto. Card "Previsto × realizado": 2 barras (income/expense) com "R$ X de R$ Y" + linha "Resultado realizado" com total income. Banner dangerSoft "● 2 contas vencidas · R$ 640,00 — Resolver ›". Card "Próximos compromissos": 3 ListRows (conta a pagar, fatura, receita prevista) + "Ver todos ›". Card "Resumo por membro": mini-cards por membro com total expense. BottomNav (Início ativo).
Comportamento: alternar Competência/Caixa muda TODOS os números (nunca misturar); mês navegável; cards tocáveis levam a Planejamento/Fatura/Relatórios.

### 1c · Lançamento rápido (screenshots/1c-lancamento-rapido.png)
BottomSheet sobre scrim. Segmented ↓ Despesa | ↑ Receita | Mais ▾ (Mais: conta a pagar/receber, compra no cartão, transferência, pagamento de fatura). MoneyInput 44 com foco automático e teclado numérico interno. Linha de SelectorChips: Conta · Categoria · Membro · Data (pré-preenchidos com recentes/atual). Linha de sugestões recentes (pills outline, scroll horizontal) + "Descrição…". Botões: "Salvar" (primário flex 1.6) + "Salvar e lançar outra" (secundário). Link "Mais detalhes ▾" (competência, favorecido, recorrência, parcelas, rateio, anexo, observação).
Meta: despesa simples em ≤ 10 s. Salvamento idempotente, feedback toast com desfazer, funciona offline.

### 1d · Planejamento — A pagar (screenshots/1d-planejamento.png)
Título + mês. Segmented A pagar | A receber | Calendário. 3 mini-cards: Previsto / Pago (income) / Falta pagar (warning). Listas agrupadas: "Vencidas · N" (card com borda danger 25%; rows com status vencido ou parcial + ProgressBar + ação "Dar baixa ›"/"Completar ›"), "Esta semana", "Mais adiante" (paga = título line-through + status income). BottomNav (Planejamento ativo).

### 1e · Baixa parcial (screenshots/1e-baixa-parcial.png)
Header "Dar baixa" + contexto. Card resumo: Valor original / Já pago (income) / Falta pagar (warning) + ProgressBar 8 + "44% pago · status: ● Parcial". MoneyInput "Valor desta baixa" com máximo = outstanding. 3 Fields lado a lado: Juros / Multa / Desconto. Fields: Conta usada / Data. Banner brandSoft "Total que sai da conta" com soma. "Histórico de baixas": row com ✓, valor, conta, data, autor + ação "Estornar". CTA "Confirmar baixa de R$ X" + microcopy "A conta ficará como ● Paga. Baixas podem ser estornadas, nunca apagadas."

### 1f · Fatura do cartão (screenshots/1f-fatura.png)
Header "Fatura de agosto" + cartão + navegação ‹ jul · ago · set ›. Card cardNavy: status + chip, valor da fatura moneyLg, Pago/Falta pagar + progress, barra de limite (usado/disponível). Seções: "Compras · N" (rows com avatar do membro; parcela com badge "parcela 03/10"; estornada line-through com "− R$" income), "Pagamentos" (row ✓ "não vira nova despesa"). CTA por estado (7b): aqui "Completar pagamento · R$ 1.680,40".

### 1g · Movimentações (screenshots/1g-movimentacoes.png)
Título + busca "⌕ Buscar por descrição, valor, favorecido…". Filtros pill scroll horizontal: Período(ativo brand com ✕) · Conta · Categoria · Membro · Status. Banner offline quando aplicável. Lista agrupada por dia: rows de despesa (aguardando sync ◌), transferência ("não é despesa", valor neutro), pendente de aprovação (pending, "não afeta saldo"), reembolso (+income), estornada (line-through + motivo), pagamento de fatura ("não vira nova despesa"). BottomNav (Movimentações ativo).

## Turno 2 — Contas & cartões

### 2a · Lista de contas (screenshots/2a-contas.png)
Header + botão "+ Nova conta". Card resumo: Total em contas / Dívida em cartões (expense). Grupo "Contas · 4": rows com ícone colorido, nome, titular + selo de visibilidade (Família brand / Só adultos warning / Restrita pending), saldo. Grupo "Cartões de crédito · 2": rows com bloco do final (cardNavy/cardWine), fecha/vence dia, mini barra de limite, dívida (expense) + status da fatura. Linha "Arquivadas · 1 — Mostrar ▾" + microcopy de arquivamento.

### 2b · Nova conta (screenshots/2b-nova-conta.png)
Formulário ÚNICO. Chips de tipo (Corrente, Poupança, Dinheiro, Carteira digital, Investimento, ✓ Cartão de crédito). Fields comuns: Nome, Instituição, Titular. Ao selecionar Cartão: banner brandSoft "Campos do cartão…" + Fields Bandeira, Final (4 dígitos), Limite, Fecha dia, Vence dia, Conta padrão para pagar a fatura. Field "Quem pode ver e usar" (Família · Só adultos · Membros escolhidos · Só eu). Cor (swatches) + Moeda. Banner warningSoft "Nunca pedimos número completo, CVV ou senha do cartão." CTA "Salvar cartão".

### 2c · Detalhe da conta + extrato (screenshots/2c-detalhe-conta.png)
Header com nome/instituição/selo + editar. Card brand com Saldo atual + linha de reconciliação "Conferido: saldo inicial + movimentações = saldo atual ✓". 3 ações: Transferir / Ajustar saldo / Permissões. Extrato com seletor de mês: rows de ajuste (±, motivo, autor), transferência, pagamento de fatura, baixa, receita. Rodapé: "Arquivar conta impede novos usos, mantém histórico." + ação Arquivar (danger).

### 2d · Ajuste de saldo (screenshots/2d-ajuste-saldo.png)
BottomSheet. Card comparativo: Saldo no aplicativo / Saldo real (informado) / Ajuste a criar (income ou expense). MoneyInput "Novo saldo". Field "Motivo · obrigatório". Banner infoSoft "O ajuste vira uma movimentação própria no extrato, com autor e motivo. O histórico anterior não é alterado." CTA "Confirmar ajuste de + R$ 12,75" + Cancelar.

### 2e · Compra parcelada (screenshots/2e-compra-parcelada.png)
MoneyInput "Valor total". Fields: Cartão, Data, Descrição, Categoria · Membro. Chips de parcelas: À vista · 2× · ✓3× · 6× · 10× · Outro ▾. Preview das parcelas (fatura/vencimento de cada; última com badge "+ R$ 0,01 de arredondamento"). Banner brandSoft "Soma das parcelas R$ 1.000,00 ✓". Banner infoSoft "A compra entra como despesa por competência e consome limite. Sua conta bancária só muda quando a fatura for paga." Linha "Limite após a compra". CTA "Registrar compra em 3×".

## Turno 3 — Família & permissões

### 3a · Membros (screenshots/3a-familia.png)
Header família + moeda/fuso. Lista de membros: avatar colorido + nome + selo do papel (cores: Proprietário brand, Admin info, Filho pending com regra de aprovação, Membro textSecondary). "Convites pendentes · 1": card tracejado com e-mail, "● Aguardando aceite · papel · expira em N dias" + Revogar. Links: Aprovações pendentes (badge pending) / Atividade / Dispositivos e sessões. CTA "+ Convidar membro".

### 3b · Permissões do membro (screenshots/3b-permissoes.png)
Header com avatar + papel. Chips de papel. "Contas autorizadas": rows com "✓ ver · ✓ lançar · ✕ editar" + Toggle; bloco de contas sem acesso com microcopy "o servidor nega mesmo por chamada direta". "Aprovação de lançamentos": Exigir aprovação (Acima de um valor ▾) + Valor limite (R$ 50,00). Banner infoSoft sobre pendências. Botões: Suspender (destrutivo) + Salvar permissões.

### 3c · Aprovação pendente (screenshots/3c-aprovacao.png)
BottomSheet do adulto. Header com avatar do filho + "Caio pediu aprovação" + chip ● Pendente. Card da despesa proposta: valor expense 30, Descrição/Conta/Categoria/Regra acionada (pending)/Saldo da conta. Banner infoSoft "Enquanto pendente, nada muda no saldo…". Field mensagem opcional. Botões: Recusar (destrutivo) + "Aprovar R$ 89,90" (primário).

### 3d · Atividade / auditoria (screenshots/3d-atividade.png)
Lista agrupada por dia, cada item: frase legível "{Autor} {ação} {objeto}" + hora + linha antes → depois (com chips de status quando aplicável) + motivo. Banner infoSoft: registrada toda criação/alteração/baixa/estorno/aprovação/permissão; visível a Proprietário e Admins.

## Turno 4 — Relatórios

### 4a · Visão geral (screenshots/4a-relatorios.png)
Segmented Competência|Caixa SEMPRE visível. 3 KPI cards (Receitas/Despesas/Resultado com previsto e comparação vs mês anterior). Gráfico de barras "Evolução — últimos 6 meses" (pares income/expense por mês, mês atual destacado, legenda). Lista de navegação: Por categoria / Por membro / Por conta e cartão / Parcelamentos e faturas / Exportar dados.

### 4b · Por categoria (screenshots/4b-categoria.png)
Barras horizontais por categoria (valor + %; cores variadas dos tokens). Drill-down de subcategorias. Banner infoSoft: "Estornos não compõem os totais. Pagamentos de fatura não aparecem aqui…". Ações: Ver movimentações / Exportar.

### 4c · Por membro (screenshots/4c-membro.png)
Barras por membro. Card "Exemplo de rateio incluído": barra empilhada com as fatias por membro + "✓ Soma dos rateios = valor total (validado pelo servidor)". Banner: relatório soma pelos rateios; membros só veem contas visíveis.

### 4d · Exportação (screenshots/4d-exportacao.png)
BottomSheet. Formato CSV (selecionado) | PDF. Field Conteúdo. Fields De/Até. Toggle "Incluir estornos". Banner warningSoft "Exportações são registradas na atividade da família… Filhos supervisionados não exportam dados amplos." CTA "Gerar CSV · jan–ago 2026".

## Turno 5 — Estados & tema escuro

### 5a · Matriz de estados (screenshots/5a-estados.png) — ver STATES-AND-MATRICES.md
### 5b · Início escuro (screenshots/5b-tema-escuro.png)
Mesmo layout de 1b com tokens \`dark\`. Semântica idêntica com cores clareadas (AA). Temas: Claro · Escuro · Sistema.

## Turno 6 — Entrada, atalhos, notificações

### 6a · Login (screenshots/6a-login.png)
Logo (quadrado brand raio 20 com "F") + nome + tagline "As finanças da família, num lugar só." Fields E-mail/Senha (mostrar). CTA Entrar. Links: "Entrar com link mágico" / "Esqueci a senha". Divisor "ou" + "Criar conta nova" (secundário). Card de biometria (opcional, pós-login) + microcopy de sessões revogáveis.

### 6b · Aceite de convite (screenshots/6b-convite.png)
Avatares sobrepostos da família. "{Nome} convidou você para a {Família}" + meta (membros · moeda · expira em N dias). Card "Seu papel" com chip + lista ✓/✕ do que o papel permite. Banner infoSoft: convite único, por e-mail; multi-família suportada. CTAs: Aceitar / Recusar.

### 6c · Atalhos do ícone (screenshots/6c-atalhos.png)
Long-press no ícone → menu com 4 ações: Registrar despesa / Registrar receita / Compra no cartão / Nova conta a pagar. Comportamento: app fechado OK; deep link familyfinance://quick/…; sessão expirada → login → retoma intenção; salvar volta à tela inicial do aparelho; idempotência.

### 6d · Notificações (screenshots/6d-notificacoes.png)
Central: aprovação (com ações Revisar/Depois inline), vencida (toque = dar baixa), fatura fechando. Preferências com toggles: Vencimentos (3 dias antes, 9h) / Faturas e limite (80%) / Aprovações (imediato) / Resumo diário (20h, off). Banner: tocar valida sessão/permissão e abre o contexto; avisos de itens pagos são cancelados; fuso da família.

## Turno 7 — Matrizes (screenshots/7a…7c) — ver STATES-AND-MATRICES.md

## Telas sem screenshot (seguir os mesmos padrões e componentes)
Splash, cadastro, recuperação de acesso, criação de família, seleção de família, perfil, segurança/biometria, categorias (lista/edição com ícone+cor+ordem+arquivar), configurações (família, notificações, aparência com Claro/Escuro/Sistema, dados e privacidade, exportação, exclusão), calendário do planejamento, detalhe de movimentação (com rateio e anexos), transferência, reembolso, recorrência (escopos: somente esta / esta e próximas / série inteira), busca com filtros completos. Nenhuma dessas pode introduzir padrão visual novo.
