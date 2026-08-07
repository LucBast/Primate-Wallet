// design-tokens.ts — FONTE ÚNICA de estilo. Copie este arquivo para src/design-system/tokens.ts
// PROIBIDO usar qualquer cor, espaçamento, raio ou tamanho de fonte fora deste arquivo.

export const light = {
  brand: '#146E64', brandSoft: '#E3EFEC',
  income: '#1B7A4B', incomeSoft: '#E4F1E9',        // success usa os mesmos
  expense: '#B4442C', expenseSoft: '#F7E8E3',
  danger: '#B02E2E', dangerSoft: '#F8E5E5',        // overdue usa os mesmos
  warning: '#9A6E14', warningSoft: '#F6EDD8',      // partial usa os mesmos
  info: '#2E64A8', infoSoft: '#EAF0F7',
  pending: '#6E58A8', pendingSoft: '#EDE8F6',
  surface: '#FAF9F7', surfaceElevated: '#FFFFFF',
  textPrimary: '#1C1B1A', textSecondary: '#6B6862', textTertiary: '#3E3C38',
  border: 'rgba(28,27,26,0.10)', divider: 'rgba(28,27,26,0.06)',
  chipNeutral: '#E9E7E2',
  cardNavy: '#2B3550', cardWine: '#7A3A5E',        // cores decorativas de cartões
  toastBg: '#1C1B1A', toastAction: '#7FD0C2',
};

export const dark = {
  brand: '#1E8A7D', brandSoft: '#1E3330',
  income: '#4CBF8B', incomeSoft: '#1E3328',
  expense: '#E77D5F', expenseSoft: '#3A241E',
  danger: '#F08A8A', dangerSoft: '#3A2020',
  warning: '#E5B454', warningSoft: '#3A2E1E',
  info: '#7FA8D9', infoSoft: '#1E2A3A',
  pending: '#A995DC', pendingSoft: '#2A2438',
  surface: '#161514', surfaceElevated: '#201F1D',
  textPrimary: '#F2F0EC', textSecondary: '#8F8B83', textTertiary: '#C9C5BE',
  border: 'rgba(242,240,236,0.10)', divider: 'rgba(242,240,236,0.06)',
  chipNeutral: '#33312E',
  cardNavy: '#2B3550', cardWine: '#7A3A5E',
  toastBg: '#33312E', toastAction: '#7FD0C2',
};

// Tipografia — Manrope (bundle os TTFs 400/500/600/700/800 no app; nada de fonte do sistema)
export const font = {
  regular: 'Manrope-Regular', medium: 'Manrope-Medium',
  semibold: 'Manrope-SemiBold', bold: 'Manrope-Bold', extrabold: 'Manrope-ExtraBold',
};

// Estilos de texto. Valores monetários SEMPRE com fontVariant: ['tabular-nums'].
// lineHeight é OBRIGATÓRIO em todo Text — nunca deixar a métrica natural da Manrope decidir.
export const type = {
  moneyLg:    { fontFamily: font.extrabold, fontSize: 32, lineHeight: 40, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  moneyMd:    { fontFamily: font.extrabold, fontSize: 20, lineHeight: 26, fontVariant: ['tabular-nums'] },
  moneyRow:   { fontFamily: font.extrabold, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  pageTitle:  { fontFamily: font.extrabold, fontSize: 22, lineHeight: 28 },
  screenTitle:{ fontFamily: font.extrabold, fontSize: 17, lineHeight: 22 },
  section:    { fontFamily: font.extrabold, fontSize: 13, lineHeight: 18 },
  sectionCaps:{ fontFamily: font.extrabold, fontSize: 11, lineHeight: 15, letterSpacing: 0.5, textTransform: 'uppercase' },
  body:       { fontFamily: font.medium, fontSize: 14, lineHeight: 21 },
  rowTitle:   { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
  rowMeta:    { fontFamily: font.semibold, fontSize: 10.5, lineHeight: 15 },
  banner:     { fontFamily: font.bold, fontSize: 10.5, lineHeight: 16 },
  label:      { fontFamily: font.bold, fontSize: 10, lineHeight: 15, letterSpacing: 0.4, textTransform: 'uppercase' },
  chip:       { fontFamily: font.bold, fontSize: 11.5, lineHeight: 16 },
  button:     { fontFamily: font.extrabold, fontSize: 15, lineHeight: 20 },
  caption:    { fontFamily: font.semibold, fontSize: 12, lineHeight: 17 },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
export const radius = { sm: 10, md: 12, lg: 14, xl: 16, xxl: 20, sheet: 28, pill: 999 };
export const layout = {
  screenPaddingH: 18, cardPaddingH: 16, cardPaddingV: 14,
  minTouch: 44, buttonHeight: 54, buttonHeightSm: 48,
  navCenterButton: 54, progressBar: 7, progressBarLg: 8,
};
export const motion = { fast: 150, base: 200, slow: 250 }; // ms; respeitar "reduzir movimento"
