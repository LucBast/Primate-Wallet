/**
 * Valores que vêm de design/COMPONENT-SPECS.md mas NÃO existem em
 * design-tokens.ts.
 *
 * `tokens.ts` é cópia verbatim e não pode ser editado (CLAUDE.md item 1).
 * Alguns componentes, porém, especificam medidas próprias — por exemplo o
 * rótulo da BottomNav, "ícone 17 + label 10", que não corresponde a nenhum
 * estilo de `type` (o token `label` de 10 é caixa alta com tracking).
 *
 * Em vez de espalhar números mágicos pelas telas, eles ficam aqui, cada um com
 * a citação da especificação que o originou. Registrado em docs/21-DECISIONS.md.
 */

import { font, light } from './tokens';

/**
 * As duas cores que NÃO trocam com o tema.
 *
 * Não descrevem a superfície do app, e sim o que está POR BAIXO delas — por
 * isso ficam iguais no claro e no escuro, como `cardNavy` e `cardWine`:
 *
 *  - `onBrand`: texto sobre o card brand. Medido em `5b-tema-escuro.png`, o
 *    "Saldo consolidado" é #FFFFFF sobre #1E8A7D. Usar `surfaceElevated` do
 *    tema escuro poria quase-preto sobre verde escuro.
 *  - `scrim`: o véu do BottomSheet escurece a tela que está atrás; no tema
 *    escuro ele continua escuro. COMPONENT-SPECS §BottomSheet pede
 *    rgba(28,27,26,0.45), que é o `textPrimary` do tema CLARO a 45%.
 */
export const fixedColors = {
  onBrand: light.surfaceElevated,
  scrim: light.textPrimary,
} as const;

/** COMPONENT-SPECS §BottomNav: "4 itens (ícone 17 + label 10 ...)". */
export const navLabel = {
  active: { fontFamily: font.extrabold, fontSize: 10 },
  inactive: { fontFamily: font.bold, fontSize: 10 },
} as const;

/** COMPONENT-SPECS §BottomNav: botão central "+" branco 26. */
export const navAddGlyphSize = 26;

/** COMPONENT-SPECS §BottomNav: "margin-top −26". */
export const navAddOffset = -26;

/**
 * COMPONENT-SPECS §BottomNav: sombra "0 6 14 rgba(20,110,100,0.35)".
 * rgb(20,110,100) é exatamente light.brand (#146E64), então a sombra é
 * expressa como o token brand com opacidade 0.35 — sem literal de cor.
 */
export const navAddShadow = {
  offset: { width: 0, height: 6 },
  radius: 14,
  opacity: 0.35,
  androidElevation: 8,
} as const;

/** COMPONENT-SPECS §Botões: bordas de 1.5 nos botões secundários. */
export const secondaryBorderWidth = 1.5;

/**
 * Aplica opacidade a uma cor dos tokens.
 *
 * COMPONENT-SPECS pede fundos como "rgba(122,58,94,0.12)" para categorias sem
 * um token *Soft* próprio. rgb(122,58,94) é exatamente `cardWine` (#7A3A5E),
 * então a cor é DERIVADA do token em vez de escrita como literal — o mesmo
 * princípio já usado na sombra do botão central da BottomNav.
 */
export function withAlpha(token: string, alpha: number): string {
  const hex = token.replace('#', '');
  const value = parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// O texto dos banners virou o token `type.banner` (fontSize 10.5, lineHeight 16)
// em CLARIFICATIONS-01, e a altura do Field passou a decorrer dos lineHeight dos
// tokens. Os dois valores que existiam aqui para cobrir essas lacunas saíram.

/**
 * SCREEN-SPECS §6a: "Logo (quadrado brand raio 20 com 'F')". O tamanho do
 * quadrado e da letra vem da medição do screenshot 6a-login.png — nenhum token
 * de `type` cobre um glifo de logotipo. Registrado em docs/21-DECISIONS.md.
 */
export const loginLogo = {
  size: 64,
  glyph: { fontFamily: font.extrabold, fontSize: 30 },
} as const;
