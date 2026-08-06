/**
 * Porta de envio de e-mail.
 *
 * Fase 0 entrega a porta e uma implementação de desenvolvimento que apenas
 * registra a mensagem. O provedor real (SMTP/API transacional) é um segredo
 * externo — depende de conta contratada — e entra na configuração de ambiente
 * sem alterar este contrato. Ver PROGRESS.md §Bloqueios.
 */

import type { Logger } from 'pino';

export type OutgoingEmail = {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  /** Link acionável, quando houver (confirmação de e-mail, magic link). */
  readonly link?: string;
};

export type Mailer = {
  send: (email: OutgoingEmail) => Promise<void>;
  /** Só em teste/dev: mensagens enviadas, para inspeção. */
  readonly outbox?: OutgoingEmail[];
};

/** Desenvolvimento: registra no log (com o link, para permitir testar o fluxo). */
export function createLogMailer(logger: Logger): Mailer {
  const outbox: OutgoingEmail[] = [];
  return {
    outbox,
    send: async (email) => {
      outbox.push(email);
      logger.info({ to: email.to, subject: email.subject, link: email.link }, 'E-mail (dev)');
    },
  };
}

/** Teste: apenas acumula, sem log. */
export function createMemoryMailer(): Mailer {
  const outbox: OutgoingEmail[] = [];
  return {
    outbox,
    send: async (email) => {
      outbox.push(email);
    },
  };
}
