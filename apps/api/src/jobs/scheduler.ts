/**
 * Agendador de tarefas periódicas (docs/12 §5, docs/15 §4).
 *
 * Duas coisas fazem este arquivo ser seguro, e as duas são deliberadas:
 *
 * **Trava de aviso do Postgres.** `pg_try_advisory_lock` garante que, com duas
 * ou três instâncias da API no ar, só UMA roda o ciclo. Sem isso, três
 * instâncias gerariam três avisos — e mesmo com a `dedupe_key` protegendo o
 * resultado, seriam três varreduras concorrentes sobre as mesmas tabelas. A
 * trava é liberada no fim, e o Postgres a solta sozinho se o processo morrer.
 *
 * **Funções privilegiadas, não credencial privilegiada.** O job não tem usuário
 * na sessão, e a RLS — corretamente — não deixaria uma sessão sem GUC ler nada.
 * A saída NÃO foi dar a credencial de migração ao processo da API — a
 * configuração de runtime valida que ela existe mas não a expõe, de propósito.
 * O trabalho vive em funções `SECURITY DEFINER`, donas das tabelas, que o
 * `ff_app` chama. Mesmo padrão de `app.account_balance` e `app.member_id`.
 *
 * O pacote sugere BullMQ + Redis ou pg_cron. Nenhum dos dois está provisionado,
 * e acrescentar um Redis só para disparar uma função a cada quinze minutos seria
 * uma peça de infraestrutura a mais para operar, monitorar e explicar no
 * runbook. Um intervalo com trava resolve o mesmo problema com o que já existe;
 * o dia em que houver Redis, `runOnce` é a função que a fila vai chamar.
 * Registrado em docs/21-DECISIONS.md.
 */

import type pg from 'pg';
import type { Logger } from 'pino';
import { materializeRecurrences } from './recurrence.js';

/** Identificador arbitrário e fixo da trava — só precisa não colidir. */
const LOCK_KEY = 815_243_001;

export type SchedulerDeps = {
  readonly pool: pg.Pool;
  readonly logger: Logger;
  /** Quanto tempo entre passadas. Quinze minutos por padrão. */
  readonly intervalMs?: number;
};

export type SchedulerHandle = {
  stop: () => void;
  /** Exposto para teste e para o script de linha de comando. */
  runOnce: () => Promise<{ created: number; canceled: number; recurrences: number }>;
};

export async function runOnce(
  pool: pg.Pool,
  logger: Logger,
): Promise<{ created: number; canceled: number; recurrences: number }> {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [LOCK_KEY],
    );
    if (lock.rows[0]?.locked !== true) {
      logger.debug('Outra instância está rodando o ciclo; esta passa a vez.');
      return { created: 0, canceled: 0, recurrences: 0 };
    }

    try {
      // Preferências primeiro: sem a linha, o membro não entra em nenhuma
      // consulta de geração e simplesmente não receberia aviso.
      await client.query('SELECT app.notification_preferences_backfill()');
      // Recorrência antes dos avisos: a conta prevista que nasce agora precisa
      // poder gerar o aviso de vencimento na MESMA passada.
      const recurrences = await materializeRecurrences(client);
      // Cancelar antes de gerar: uma conta com vencimento adiado perde o aviso
      // velho e ganha o novo no mesmo ciclo, em vez de conviver com os dois.
      const canceled =
        (
          await client.query<{ count: number }>(
            'SELECT app.notifications_cancel_resolved() AS count',
          )
        ).rows[0]?.count ?? 0;
      const created =
        (await client.query<{ count: number }>('SELECT app.notifications_generate() AS count'))
          .rows[0]?.count ?? 0;
      if (created > 0 || canceled > 0 || recurrences > 0) {
        logger.info({ created, canceled, recurrences }, 'Ciclo de agendamento concluído');
      }
      return { created, canceled, recurrences };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function startScheduler(deps: SchedulerDeps): SchedulerHandle {
  const { pool, logger } = deps;
  const intervalMs = deps.intervalMs ?? 15 * 60 * 1000;

  const tick = (): void => {
    // Uma falha do ciclo NÃO pode derrubar a API: o app continua útil sem o
    // aviso de vencimento, e o próximo tique tenta de novo.
    void runOnce(pool, logger).catch((erro: unknown) => {
      logger.error({ err: erro }, 'Ciclo de agendamento falhou; tentaremos no próximo intervalo');
    });
  };

  const timer = setInterval(tick, intervalMs);
  // `unref` para o temporizador não segurar o processo no encerramento.
  timer.unref();
  // Uma passada no arranque: subir a API depois de uma janela de manutenção não
  // deve esperar quinze minutos para reconciliar o que ficou para trás.
  tick();

  return {
    stop: () => clearInterval(timer),
    runOnce: () => runOnce(pool, logger),
  };
}
