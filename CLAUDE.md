# CLAUDE.md

## Projeto
Aplicativo completo de gestão financeira familiar (Family Finance) para iOS e Android.
Fonte de verdade de escopo e regras: \`docs/FAMILY_FINANCE_ALL_IN_ONE.md\` (pacote completo, ler na ordem do 00-README interno).
Fonte de verdade VISUAL: \`design/\` (tokens, especificações e screenshots). Em conflito visual, \`design/\` vence.

## Stack (decisão atualizada — substitui o 07-ARCHITECTURE do pacote)
Ver \`docs/01-STACK-DECISIONS.md\`. Resumo:
- React Native **CLI** (sem Expo) + TypeScript strict.
- **WatermelonDB** para persistência local, cache e outbox offline.
- **PostgreSQL** auto-hospedado + backend Node/TypeScript próprio (contratos Zod do pacote).
- O restante do pacote (regras financeiras, modelo de dados, RLS, testes, DoD) permanece válido.

## ⚠ FIDELIDADE VISUAL — REGRA MAIS IMPORTANTE
Experiências anteriores geraram UI diferente do design aprovado. Isto é considerado DEFEITO CRÍTICO. Regras inegociáveis:

1. **Tokens**: copie \`design/design-tokens.ts\` verbatim para \`src/design-system/tokens.ts\`. É PROIBIDO usar cor hex, tamanho de fonte, raio ou espaçamento que não venha dele. Lint: bloquear literais de cor fora desse arquivo.
2. **Fonte**: Manrope (TTFs 400–800 no bundle, iOS e Android). Nunca usar a fonte do sistema, Inter ou Roboto. Valores monetários sempre com \`fontVariant: ['tabular-nums']\`.
3. **Screenshots são o critério de aceite**: cada tela implementada deve ser comparada lado a lado com sua imagem em \`design/screenshots/\`. Antes de marcar uma tela como concluída no PROGRESS.md, liste as divergências encontradas e corrija. Divergência de layout, hierarquia, cor ou copy = tela NÃO concluída.
4. **Componentes**: construa exatamente os componentes de \`design/COMPONENT-SPECS.md\`, com os valores especificados. PROIBIDO usar temas prontos de bibliotecas de UI (react-native-paper, NativeBase, UI Kitten, gluestack etc.). Bibliotecas utilitárias sem opinião visual são permitidas.
5. **Copy**: os textos em pt-BR das especificações são finais — copie-os verbatim (inclusive "Falta pagar", "Dar baixa", "Aguardando sincronização"). Não parafrasear.
6. **Status**: sempre cor + ponto (●/◌) + texto. Nunca só cor. Estornado = texto com line-through + chip.
7. **Navegação**: bottom nav de 5 itens com botão central "+" circular elevado (54px, sombra da cor brand), exatamente como nos screenshots.
8. **Não "melhorar" o design**: nenhuma decisão visual própria. Dúvida visual → seguir o screenshot; se o screenshot não cobrir, seguir COMPONENT-SPECS; se ainda faltar, registrar em DECISIONS e escolher o mais próximo do existente.

## Invariantes financeiras (inalteradas)
- Dinheiro em centavos inteiros; nunca float. Formatação: Intl pt-BR.
- Contas bancárias e cartões na mesma tabela \`accounts\`.
- Pagamento de fatura não é despesa. Transferência não é receita/despesa.
- Baixa parcial preserva saldo em aberto; "Vencido" é derivado, nunca persistido.
- Registros postados são estornados (com motivo), nunca excluídos.
- Comandos financeiros exigem idempotency key; baixa/pagamento/transferência/estorno são atômicos com controle de concorrência (expectedVersion).
- Rateios somam o total exato; centavos de parcelamento na última parcela.
- Relatórios distinguem competência (ACCRUAL) e caixa (CASH).

## Segurança
- Toda linha familiar tem \`household_id\`; isolamento por família aplicado no Postgres (RLS com GUC de sessão) E revalidado na camada de serviço.
- Nunca confiar em role/household do cliente. Nunca armazenar número completo de cartão, CVV ou credenciais bancárias.
- Anexos em storage privado com URL assinada. Auditar ações sensíveis.

## Workflow
1. Ler docs relevantes + \`PROGRESS.md\`. 2. Testes primeiro para regras financeiras. 3. Fatia vertical completa (migração → contrato → serviço → UI fiel). 4. Gate visual (comparação com screenshot). 5. Lint, typecheck, testes. 6. Atualizar PROGRESS.md. 7. Próxima fase — sem parar em versão "usável".

## Conclusão
O projeto só está pronto quando a definição de pronto e o checklist de release do pacote estiverem satisfeitos — incluindo o gate de fidelidade visual em TODAS as telas, claro e escuro.
