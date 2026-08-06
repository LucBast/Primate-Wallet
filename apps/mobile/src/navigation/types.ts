/**
 * Rotas do app. Os nomes acompanham os deep links do doc 12
 * (`familyfinance://`), para que atalho, push e navegação interna cheguem ao
 * mesmo destino.
 */

export type AuthStackParamList = {
  Login: undefined;
  CriarConta: undefined;
  /** Chegada por link mágico ou confirmação de e-mail. */
  Token: { token: string; purpose: 'MAGIC_LINK' | 'EMAIL_VERIFICATION' };
};

export type AppStackParamList = {
  Tabs: undefined;
  /** Lançamento rápido, aberto pelo botão central "+" (Fase 8). */
  LancamentoRapido: undefined;
};

export type TabKey = 'inicio' | 'planejamento' | 'movimentacoes' | 'mais';
