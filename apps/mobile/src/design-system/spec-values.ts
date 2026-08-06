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

import { font } from './tokens';

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

/** COMPONENT-SPECS §Banners: "texto Bold 10.5 line-height 1.5". */
export const bannerLineHeightRatio = 1.5;

/**
 * SCREEN-SPECS §6a: "Logo (quadrado brand raio 20 com 'F')". O tamanho do
 * quadrado e da letra vem da medição do screenshot 6a-login.png — nenhum token
 * de `type` cobre um glifo de logotipo. Registrado em docs/21-DECISIONS.md.
 */
export const loginLogo = {
  size: 64,
  glyph: { fontFamily: font.extrabold, fontSize: 30 },
} as const;
