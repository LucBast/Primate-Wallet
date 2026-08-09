/**
 * Fase 10 — offline e sincronização.
 *
 * Cobre as duas regras que não dependem do SQLite nativo e que são justamente
 * onde o erro custa dinheiro ou confunde a pessoa: a política de retentativa
 * (o que volta para a fila e o que precisa de decisão humana) e os cinco
 * estados de feedback que docs/11 §4 exige na tela, com a copy exata.
 */

import { isPermanentFailure } from '../src/offline/retry-policy';
import { syncMessage } from '../src/offline/sync-copy';

describe('política de retentativa (docs/11 §3)', () => {
  it('rede caída volta para a fila', () => {
    expect(isPermanentFailure('NETWORK_ERROR')).toBe(false);
    expect(isPermanentFailure('INTERNAL_ERROR')).toBe(false);
    expect(isPermanentFailure(null)).toBe(false);
  });

  it('o servidor dizendo "não" para de tentar', () => {
    expect(isPermanentFailure('VALIDATION_ERROR')).toBe(true);
    expect(isPermanentFailure('INSUFFICIENT_PERMISSION')).toBe(true);
    expect(isPermanentFailure('ACCOUNT_ARCHIVED')).toBe(true);
  });

  it('conflito de versão continua na fila — o pacote manda reaplicar a intenção', () => {
    expect(isPermanentFailure('VERSION_CONFLICT')).toBe(false);
  });

  it('chave repetida continua na fila: significa que o primeiro envio funcionou', () => {
    expect(isPermanentFailure('DUPLICATE_IDEMPOTENCY_KEY')).toBe(false);
  });
});

describe('feedback de sincronização (docs/11 §4)', () => {
  it('sem pendência não há faixa nenhuma', () => {
    expect(syncMessage('ocioso', 0, 0)).toEqual({ kind: 'nenhuma' });
  });

  it('aguardando sincronização, no singular', () => {
    expect(syncMessage('ocioso', 1, 0)).toEqual({
      kind: 'pendente',
      text: 'Aguardando sincronização · 1 lançamento salvo no aparelho',
    });
  });

  it('aguardando sincronização, no plural', () => {
    expect(syncMessage('ocioso', 3, 0).text).toBe(
      'Aguardando sincronização · 3 lançamentos salvos no aparelho',
    );
  });

  it('sincronizando avisa que está em curso', () => {
    expect(syncMessage('sincronizando', 2, 0)).toEqual({
      kind: 'sincronizando',
      text: 'Sincronizando 2 lançamentos…',
    });
  });

  it('falhou promete tentar de novo, sem culpar a pessoa', () => {
    expect(syncMessage('falhou', 1, 0).text).toBe(
      '1 lançamento salvo no aparelho. Tentaremos de novo quando a conexão voltar.',
    );
  });

  it('recusado pelo servidor pede atenção e vence os demais estados', () => {
    expect(syncMessage('sincronizando', 5, 2)).toEqual({
      kind: 'atencao',
      text: '2 lançamentos recusados pelo servidor. Requer atenção.',
    });
  });
});
