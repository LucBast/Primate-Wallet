# CLARIFICATIONS-01 — respostas de design (2026-08-07)

Contrato alterado: design-tokens.ts ganhou lineHeight em todas as entradas de type (+ novo estilo \`banner\`) e label passou de lineHeight implícito para 15. Nenhuma cor, tamanho de fonte ou medida de layout mudou.

1. **Line-heights**: publicados em design-tokens.ts (verbatim). moneyLg permanece fontSize 32 (o exemplo com 34 do questionamento estava errado).
2. **Botão primário**: 54 confirmado — o token vence; os ~50dp medidos no PNG são artefato de antialiasing + a moldura de 1px da captura (392×846 para 390×844).
   **Field**: 53 fechado confirmado e publicado no COMPONENT-SPECS (1+9+15+18+9+1).
3. **Ícones**: mapa oficial publicado no COMPONENT-SPECS (§ Ícones por categoria), incluindo a regra: compromissos usam ícone da categoria; movimentações usam ícone da natureza.
4. **Linha de fatura**: formato exato publicado no COMPONENT-SPECS (§ Linha de fatura).
5. **Telas sem screenshot**: serão desenhadas e renderizadas no mesmo padrão; enviar a lista completa (a solicitação chegou truncada após "4. Gestão de categorias"). Até lá, essas telas ficam marcadas "aguardando referência" no PROGRESS.md — não reprovadas.
6. **(Item chegou truncado — reenviar as três perguntas.)**
7. **Tema escuro**: regra global confirmada e publicada no UI-FIDELITY-RULES (§ Tema escuro): mesmo layout, troca 1:1 de tokens; sombras pretas; sem screenshots adicionais.
8. **Assets de publicação**: serão entregues em pacote separado (ícone mipmap/AppIcon: quadrado brand #146E64, raio contínuo, "F" Manrope ExtraBold branca; splash: surface com o mesmo logo centrado; assets de loja depois). Não bloqueia o desenvolvimento.

**Saldo consolidado (fora do prompt, respondido mesmo assim):** a semântica do design é: Saldo consolidado = Σ saldos das CONTAS (não subtrai cartão) = R$ 12.480,55; Disponível = consolidado − cartões em aberto = R$ 9.230,55; Cartões em aberto = Σ dívidas = R$ 3.250,00. O screenshot 1b é internamente consistente com isso. Se o produto quiser patrimônio líquido (consolidado − dívida), é um QUARTO número, não a redefinição deste. Implementar conforme o design; escalar ao dono do escopo financeiro apenas se quiserem o número líquido.
