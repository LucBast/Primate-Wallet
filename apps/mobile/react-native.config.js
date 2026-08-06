/**
 * Fontes Manrope no bundle (CLAUDE.md §Fidelidade visual, item 2).
 *
 * Depois de alterar esta lista, rode `npm run link-assets --workspace @ff/mobile`
 * para copiar os TTFs para android/app/src/main/assets/fonts e registrá-los no
 * Info.plist do iOS. Cair no fallback do sistema reprova a tela no gate visual.
 */
module.exports = {
  project: {
    ios: { sourceDir: './ios' },
    android: { sourceDir: './android' },
  },
  assets: ['./assets/fonts'],
};
