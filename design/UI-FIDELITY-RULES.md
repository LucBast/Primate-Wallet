# UI-FIDELITY-RULES — Gate de fidelidade visual (obrigatório)

O design aprovado está em \`screenshots/\` (uma imagem por tela, nomeada pelo id da especificação). Divergir do design é defeito crítico.

## Processo por tela
1. Ler a entrada da tela em SCREEN-SPECS.md e abrir o screenshot correspondente.
2. Implementar usando SOMENTE tokens de design-tokens.ts e componentes de COMPONENT-SPECS.md.
3. Rodar no simulador (viewport 390×844) e comparar lado a lado com o screenshot.
4. Checklist antes de marcar concluída:
   - [ ] Mesma hierarquia e ordem de blocos
   - [ ] Mesmas cores (token certo em cada elemento — ex.: expense #B4442C, nunca "vermelho" genérico)
   - [ ] Manrope carregada de fato (se cair em fallback do sistema, a tela reprova)
   - [ ] Valores monetários com tabular-nums, formato pt-BR (R$ 1.248,05)
   - [ ] Status como chip pill com ● + texto (ou ◌ para sync); estornado com line-through
   - [ ] Botão primário: altura 54, raio 16, brand, texto ExtraBold 15 branco
   - [ ] Bottom nav: 5 posições, botão central + circular 54 elevado (-26 margin-top) com sombra brand
   - [ ] Copy idêntica à especificação (pt-BR)
   - [ ] Toque mínimo 44px; ação primária na região inferior
5. Repetir a comparação no tema escuro (tokens \`dark\`) — referência: screenshot 5b.

## Proibições absolutas
- Temas/kits prontos de UI (Paper, NativeBase, UI Kitten, gluestack, Tamagui com tema default).
- Cores/hex fora de design-tokens.ts; fontes fora de Manrope; emojis fora dos usados no design (🔔 💳 são placeholders de ícone — substituir por ícones de linha consistentes com rótulo, mantendo cor/fundo dos containers).
- Gradientes, sombras coloridas extras, cantos diferentes dos raios definidos, "melhorias" criativas.

## Ícones
O design usa glifos placeholder (⌂ ▦ ⇄ ⋯ ↑ ↓ ↺ ⌫ ⚡). Na implementação, usar um único set de ícones de linha (ex.: Lucide/Phosphor) mapeado 1:1: Início=house, Planejamento=calendar, Movimentações=arrows-left-right, Mais=dots, receita=arrow-up, despesa=arrow-down, transferência=arrows, estorno=rotate-ccw, cartão=credit-card. Tamanho 17–20, cor conforme o screenshot (ativo brand, inativo textSecondary). Containers de ícone: quadrado arredondado (raio 10–12) com fundo *Soft da cor semântica.

## Tema escuro — regra oficial
Vale para TODAS as telas: layout, hierarquia, espaçamentos e copy idênticos aos do tema claro; muda somente o conjunto de tokens (\`light\` → \`dark\`, mapeamento 1:1 por nome). Exceções fixas: sombras no escuro usam preto (botão central da nav: 0 6 14 rgba(0,0,0,0.5)); cardNavy/cardWine permanecem iguais. Nenhum screenshot escuro adicional será produzido — 5b é a prova do mapeamento, não um layout próprio. Gate escuro = mesma comparação estrutural do claro + verificação de que nenhum hex de \`light\` vazou.
