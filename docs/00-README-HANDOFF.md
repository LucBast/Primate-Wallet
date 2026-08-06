# Pacote de handoff — Family Finance (para Claude Code)

## Como usar
1. Crie o repositório e copie **CLAUDE.md** deste pacote para a raiz.
2. Copie a pasta \`docs/\` e a pasta \`design/\` para a raiz do repositório.
3. Copie \`PROGRESS.md\` para a raiz.
4. Abra o Claude Code na raiz e peça: "Leia CLAUDE.md e docs/00-README-HANDOFF.md e inicie a Fase 0".

## Ordem de leitura para o Claude Code
1. \`CLAUDE.md\` (raiz)
2. \`docs/01-STACK-DECISIONS.md\` — stack RN CLI + WatermelonDB + PostgreSQL
3. \`docs/FAMILY_FINANCE_ALL_IN_ONE.md\` — pacote completo original (escopo, PRD, regras, dados, contratos, testes, fases)
4. \`design/UI-FIDELITY-RULES.md\` — regras de fidelidade visual (gate obrigatório)
5. \`design/design-tokens.ts\` — tokens em código
6. \`design/COMPONENT-SPECS.md\` — componentes com valores exatos
7. \`design/SCREEN-SPECS.md\` — telas, uma a uma, com referência de screenshot
8. \`design/STATES-AND-MATRICES.md\` — estados, permissões e ciclos de vida

## O que é imutável
- Tokens, componentes, copy pt-BR e layout das telas: seguir \`design/\` fielmente (screenshots = critério de aceite).
- Invariantes financeiras e escopo completo do pacote original (não é MVP).

## O que o Claude Code decide livremente
Estrutura de pastas, nomes técnicos, bibliotecas utilitárias sem opinião visual, detalhes de implementação — registrando decisões relevantes.
