/**
 * Intenção de atalho do ícone (docs/12 §2; tela 6c).
 *
 * O requisito difícil não é abrir o formulário — é a intenção SOBREVIVER ao
 * desvio pelo login e ser consumida uma única vez. Um atalho que reabre o
 * formulário a cada remontagem da navegação vira exatamente a "duplicidade" que
 * o pacote manda impedir.
 */

import { parseIntent, rememberIntent, takeIntent } from '../src/navigation/pending-intent';

describe('rotas de atalho (docs/12 §1)', () => {
  it('reconhece as quatro ações da 6c', () => {
    expect(parseIntent('familyfinance://quick/expense')).toEqual({
      kind: 'quick',
      nature: 'expense',
    });
    expect(parseIntent('familyfinance://quick/income')).toEqual({
      kind: 'quick',
      nature: 'income',
    });
    expect(parseIntent('familyfinance://quick/card-purchase')).toEqual({ kind: 'card-purchase' });
    expect(parseIntent('familyfinance://planned/payable/new')).toEqual({ kind: 'payable' });
  });

  it('ignora a query string, que é onde vêm os tokens', () => {
    expect(parseIntent('familyfinance://quick/expense?origem=atalho')).toEqual({
      kind: 'quick',
      nature: 'expense',
    });
  });

  it('devolve nulo para rota que não é atalho', () => {
    // `entrar?token=` é link mágico e tem tratamento próprio: confundir os dois
    // faria o app abrir um formulário de despesa em vez de trocar o token.
    expect(parseIntent('familyfinance://entrar?token=abc')).toBeNull();
    expect(parseIntent('familyfinance://familia')).toBeNull();
    // Link de terceiro NÃO abre formulário: o caminho tem de ser exatamente o
    // do atalho, sem host. Um `https://qualquer.coisa/quick/expense` recebido
    // por mensagem não pode disparar um lançamento.
    expect(parseIntent('https://exemplo.com/quick/expense')).toBeNull();
  });
});

describe('retomada da intenção', () => {
  beforeEach(() => {
    takeIntent();
  });

  it('sem intenção guardada, não há o que retomar', () => {
    expect(takeIntent()).toBeNull();
  });

  it('a intenção é consumida UMA vez', () => {
    rememberIntent({ kind: 'payable' });
    expect(takeIntent()).toEqual({ kind: 'payable' });
    // A segunda leitura vem vazia: é isto que impede o formulário de reabrir a
    // cada remontagem da navegação.
    expect(takeIntent()).toBeNull();
  });

  it('uma intenção nova substitui a anterior', () => {
    rememberIntent({ kind: 'quick', nature: 'expense' });
    rememberIntent({ kind: 'card-purchase' });
    expect(takeIntent()).toEqual({ kind: 'card-purchase' });
  });
});
