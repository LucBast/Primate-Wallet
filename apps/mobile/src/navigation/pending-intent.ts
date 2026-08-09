/**
 * Intenção pendente de deep link e de atalho do ícone (docs/12 §2).
 *
 * O requisito do pacote é explícito: o atalho precisa funcionar com o app
 * FECHADO, e "sessão expirada → login → retoma a intenção". Sem um lugar para
 * guardar essa intenção, o app abriria no login e, depois de entrar, cairia no
 * Início — e a pessoa teria de procurar de novo o que já tinha pedido.
 *
 * A intenção mora em memória de propósito. Ela é o eco de um toque que acabou
 * de acontecer; sobreviver a um encerramento do app transformaria "abri por
 * engano e desisti" em "toda vez que abro, aparece um formulário".
 */

import { Linking } from 'react-native';

/** Os destinos que um atalho ou uma notificação podem pedir. */
export type Intent =
  | { readonly kind: 'quick'; readonly nature: 'expense' | 'income' }
  | { readonly kind: 'card-purchase' }
  | { readonly kind: 'payable' };

let pending: Intent | null = null;

/** Traduz a URL do deep link em intenção. `null` = não é uma rota de atalho. */
export function parseIntent(url: string): Intent | null {
  const path = url.replace(/^[a-z]+:\/\//i, '').replace(/\?.*$/, '');
  switch (path) {
    case 'quick/expense':
      return { kind: 'quick', nature: 'expense' };
    case 'quick/income':
      return { kind: 'quick', nature: 'income' };
    case 'quick/card-purchase':
      return { kind: 'card-purchase' };
    case 'planned/payable/new':
      return { kind: 'payable' };
    default:
      return null;
  }
}

export function rememberIntent(intent: Intent): void {
  pending = intent;
}

/**
 * Devolve a intenção guardada e a ESQUECE.
 *
 * Consumir na leitura é o que impede o formulário de reabrir a cada vez que a
 * navegação remonta — e é também o que faz a "proteção contra duplicidade" do
 * pacote valer para o caminho do atalho.
 */
export function takeIntent(): Intent | null {
  const intent = pending;
  pending = null;
  return intent;
}

/**
 * Lê a URL que abriu o app, quando houver.
 *
 * `getInitialURL` cobre o app fechado; o listener de `url` cobre o app já
 * aberto em segundo plano. Os dois caminhos existem porque o sistema entrega o
 * atalho de formas diferentes em cada caso.
 */
export async function captureLaunchIntent(): Promise<void> {
  const url = await Linking.getInitialURL();
  if (url === null) return;
  const intent = parseIntent(url);
  if (intent !== null) rememberIntent(intent);
}

export function subscribeToIntents(onIntent: (intent: Intent) => void): () => void {
  const subscription = Linking.addEventListener('url', ({ url }) => {
    const intent = parseIntent(url);
    if (intent !== null) onIntent(intent);
  });
  return () => subscription.remove();
}
