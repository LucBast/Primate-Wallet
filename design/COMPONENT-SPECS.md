# COMPONENT-SPECS — componentes com valores exatos (unidades = dp)

Todos os valores vêm de design-tokens.ts. "brand" = light.brand etc. Fundo de tela: surface. Cards: surfaceElevated, borda 1 border, raio 16, padding 14×16 (v×h).

## Botões
- **Primário**: altura 54 (48 em pares lado a lado), raio 16 (14 quando 48), fundo brand, texto branco ExtraBold 15 (13–14 quando 48). Label pode incluir o valor: "Confirmar baixa de R$ 534,50".
- **Secundário**: mesmo tamanho, fundo transparente/branco, borda 1.5 rgba(28,27,26,0.16), texto Bold 13–14 textPrimary.
- **Destrutivo secundário**: borda 1.5 rgba(176,46,46,0.4), texto danger.
- Desabilitar no primeiro toque (idempotência). Toque mínimo 44.

## MoneyInput (campo de valor em destaque)
Card branco, borda 1.5 brand, raio 16, padding 10×16. Label caps 10 brand. Valor ExtraBold 24–44 (44 no lançamento rápido, 28 em baixa, 30 em compra) com cursor fino brand. Abaixo, helper 10.5 textSecondary quando houver máximo ("máximo permitido: R$ 510,10 (saldo em aberto)").

## StatusChip
Pill (raio 999), padding 4×11, texto Bold 11.5, ● antes do texto. Combinações: Aberto chipNeutral/textTertiary · Parcial warningSoft/warning (com "falta R$ X") · Pago/Recebido incomeSoft/income · Vencido dangerSoft/danger (com "há N dias") · Aguardando aprovação pendingSoft/pending · Estornado chipNeutral/textSecondary + line-through · Aguardando sincronização infoSoft/info com ◌.

## SelectorChip (conta/categoria/membro/data no lançamento rápido)
Pill raio 12, padding 9×13, fundo brandSoft, texto Bold 12 brand, sufixo ▾. Vazio: borda 1.5 tracejada rgba(28,27,26,0.25), texto textSecondary.

## SegmentedControl (Competência|Caixa, A pagar|A receber|Calendário)
Trilho chipNeutral raio 12 padding 3; segmento ativo: branco, raio 10, sombra leve, ExtraBold 12.5; inativo Bold 12.5 textSecondary.

## ListRow (movimentação / conta prevista / extrato)
Altura mínima 52, padding vertical 9–10, divisor 1 divider entre linhas (dentro de card com padding h 14). Ícone: container 30–36 raio 10–12 com fundo *Soft. Título Bold 13; meta 10.5 textSecondary (ou cor semântica quando é status). Valor à direita ExtraBold 13 tabular: receita income com "+", despesa expense com "−", transferência textTertiary sem sinal.

## ProgressBar (pagamento parcial)
Trilho chipNeutral raio 999 altura 7–8; preenchimento na cor do status (warning para parcial). SEMPRE acompanhado de texto numérico ("44% pago · status: ● Parcial").

## Field (formulários)
Card branco raio 14 borda 1 rgba(28,27,26,0.10), padding 9×14. Label caps 10 textSecondary; valor Bold 13; selects com ▾.

## Toggle
40×24, trilho raio 999 (ligado brand, desligado chipNeutral), bolinha branca 20.

## BottomNav
Fundo surfaceElevated, borda superior 1 rgba(28,27,26,0.08), padding 8 6 20. 5 posições: 4 itens (ícone 17 + label 10; ativo brand ExtraBold, inativo textSecondary Bold) + botão central: círculo 54, brand, "+" branco 26, margin-top −26, sombra 0 6 14 rgba(20,110,100,0.35).

## BottomSheet
Raio superior 28, fundo surface, handle 40×4 rgba(28,27,26,0.18) centrado, scrim rgba(28,27,26,0.45).

## Toast / Snackbar com desfazer
Fundo toastBg, raio 12, padding 10×14, texto branco SemiBold 12.5, ação "Desfazer" toastAction ExtraBold à direita. 5 s.

## Banners informativos
Raio 12, padding 9×14, texto Bold 10.5 line-height 1.5. Info: infoSoft/info (regras: "não vira nova despesa" etc.). Aviso: warningSoft/warning. Erro: dangerSoft/danger + botão "Tentar novamente" com borda danger. Offline: infoSoft/info com ◌.

## Teclado numérico (lançamento rápido)
Grid 3 colunas, gap 7, teclas 52 de altura, branco, borda 1 rgba(28,27,26,0.08), raio 12, dígito Bold 20. Última linha: , · 0 · ⌫.

## Skeleton
Blocos chipNeutral raio 6–10 no layout final da tela. Nunca tela branca.

## Cards de destaque
- **Saldo consolidado** (Início): fundo brand, raio 20, padding 14×18, label caps branco 75%, valor moneyLg branco, linha "Disponível / Cartões em aberto" 11.5.
- **Fatura** (detalhe): fundo cardNavy, mesmo padrão + chip de status translúcido, progress de pagamento (7, preenchimento toastAction) e barra de limite (5, branco).
