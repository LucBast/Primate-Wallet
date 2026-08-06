/**
 * Rotas do app. Os nomes acompanham os deep links do doc 12
 * (`familyfinance://`), para que atalho, push e navegação interna cheguem ao
 * mesmo destino.
 */

import type {
  Account,
  Member,
  PlannedEntry,
  PlannedEntryNature,
  Transaction,
} from '@ff/api-contracts';

export type AuthStackParamList = {
  Login: undefined;
  CriarConta: undefined;
  /** Chegada por link mágico ou confirmação de e-mail. */
  Token: { token: string; purpose: 'MAGIC_LINK' | 'EMAIL_VERIFICATION' };
};

export type AppStackParamList = {
  Tabs: undefined;
  /** Lançamento rápido, aberto pelo botão central "+". */
  LancamentoRapido: undefined;
  Familia: undefined;
  MembroPermissoes: { member: Member };
  ConvidarMembro: undefined;
  Atividade: undefined;
  Sessoes: undefined;
  Aprovacoes: undefined;
  EditarFamilia: undefined;
  Contas: undefined;
  NovaConta: undefined;
  DetalheConta: { account: Account };
  Categorias: undefined;
  NovaContaPrevista: { nature: PlannedEntryNature };
  DetalheContaPrevista: { entry: PlannedEntry };
  DarBaixa: { entry: PlannedEntry };
  DetalheMovimentacao: { transaction: Transaction };
  Transferencia: undefined;
  Fatura: { card: Account };
  CompraCartao: undefined;
  Relatorios: undefined;
  Notificacoes: undefined;
  /** Aceite de convite chegando por deep link, já com sessão. */
  Convite: { token: string };
  /** Destinos ainda não entregues; some conforme as fases avançam. */
  EmConstrucao: { destination: string };
};

/** Fluxo de quem entrou e ainda não pertence a nenhuma família. */
export type OnboardingStackParamList = {
  CriarFamilia: undefined;
  Convite: { token: string };
};

export type TabKey = 'inicio' | 'planejamento' | 'movimentacoes' | 'mais';
