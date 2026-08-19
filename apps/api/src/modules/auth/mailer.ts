/**
 * Porta de envio de e-mail.
 *
 * Três implementações da mesma porta, escolhidas pela configuração e não por
 * `if` espalhado no serviço: `createResendMailer` em produção,
 * `createLogMailer` em desenvolvimento (o link vai para o log, para dar para
 * testar o fluxo sem conta contratada) e `createMemoryMailer` em teste. Quem
 * decide é `main.ts`, olhando `RESEND_API_KEY`.
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

// ---------------------------------------------------------------------------
// Produção: Resend
// ---------------------------------------------------------------------------

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type ResendMailerOptions = {
  readonly apiKey: string;
  /** Remetente completo, ex.: `Primate Wallet <nao-responda@exemplo.com>`. */
  readonly from: string;
  readonly logger: Logger;
  /** Injetável no teste. Padrão: `fetch` global. */
  readonly fetchImpl?: typeof fetch;
  /** Teto do POST. Padrão: 10s. Ver a nota sobre transação abaixo. */
  readonly timeoutMs?: number;
};

/**
 * Envio real, pela API HTTP do Resend.
 *
 * Sem SDK de propósito: a chamada é um POST JSON: uma dependência a menos na
 * imagem é uma superfície a menos para auditar e atualizar.
 *
 * `send` PROPAGA a falha, e isso é deliberado. As duas chamadas que importam
 * — confirmação de cadastro e convite de família — rodam dentro da transação
 * que acabou de criar a linha. Deixar o erro subir desfaz o cadastro e o
 * usuário tenta de novo; engolir o erro criaria uma conta impossível de
 * confirmar, porque o token de verificação só existe naquele e-mail e nunca é
 * reemitido. O preço é segurar a transação durante uma chamada externa — daí o
 * timeout ser curto e obrigatório, e não haver retentativa aqui.
 *
 * Simetria importa: `register` chama `send` no caminho de e-mail novo E no de
 * e-mail já cadastrado, sempre para o mesmo destinatário. Uma falha do Resend
 * derruba os dois do mesmo jeito, então o comportamento continua sem revelar
 * se a conta existia — que é o ponto da resposta neutra em service.ts.
 */
export function createResendMailer(options: ResendMailerOptions): Mailer {
  const { apiKey, from, logger } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    send: async (email) => {
      const response = await fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          text: renderText(email),
          html: renderHtml(email),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        // O corpo da recusa do Resend diz o motivo (domínio não verificado,
        // destinatário inválido, cota estourada) e não devolve a chave: ela vai
        // no cabeçalho e não é ecoada. Vale logar, truncado.
        const detail = await response.text().catch(() => '');
        logger.error(
          { status: response.status, detail: detail.slice(0, 500), subject: email.subject },
          'Resend recusou o envio',
        );
        throw new Error(`Resend respondeu ${response.status} ao enviar "${email.subject}".`);
      }

      // Sem `link` no log: ele é credencial de uso único (confirma e-mail ou
      // troca senha). Quem tem acesso ao log não deve poder assumir a conta.
      logger.info({ to: email.to, subject: email.subject }, 'E-mail enviado');
    },
  };
}

/**
 * O botão leva a uma página https deste serviço (`link-bridge.ts`), não direto
 * ao app: cliente de e-mail nenhum transforma `familyfinance://` em link. A
 * página abre em qualquer aparelho, mas só completa a ação onde o app existe —
 * por isso o aviso continua necessário.
 */
const NOTA_DEEP_LINK =
  'Abra esta mensagem no celular onde o Primate Wallet está instalado: o botão abre uma página que leva ao aplicativo.';

function renderText(email: OutgoingEmail): string {
  if (email.link === undefined) return email.body;
  return `${email.body}\n\n${email.link}\n\n${NOTA_DEEP_LINK}`;
}

/**
 * HTML com estilo em atributo: cliente de e-mail ignora `<style>` e classe.
 * As cores vêm de `design/design-tokens.ts` (paleta clara), como manda a regra
 * de fidelidade visual — o modo escuro fica de fora porque cada cliente inverte
 * de um jeito e não há como conferir contra screenshot. Ver docs/21 §e-mail.
 */
function renderHtml(email: OutgoingEmail): string {
  const corpo = escapeHtml(email.body);
  const botao =
    email.link === undefined
      ? ''
      : `
      <p style="margin:24px 0 0"><a href="${escapeHtml(email.link)}" style="display:inline-block;padding:12px 24px;border-radius:12px;background:#146E64;color:#FFFFFF;font-weight:700;text-decoration:none">Abrir</a></p>
      <p style="margin:16px 0 0;font-size:13px;color:#6B6862">${escapeHtml(NOTA_DEEP_LINK)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#6B6862;word-break:break-all">${escapeHtml(email.link)}</p>`;

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#FAF9F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1C1B1A">
  <div style="max-width:520px;margin:0 auto;padding:32px;background:#FFFFFF;border-radius:20px">
    <p style="margin:0 0 24px;font-size:14px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#146E64">Primate Wallet</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(email.subject)}</h1>
    <p style="margin:0;font-size:16px;line-height:1.5">${corpo}</p>${botao}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#6B6862;text-align:center">Você recebeu esta mensagem porque alguém usou este endereço no Primate Wallet. Não responda a este e-mail.</p>
</body></html>`;
}

const ESCAPES_HTML: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** O assunto e o corpo vêm do serviço, mas o `to` de convite é digitado por
 * usuário: escapar sempre é mais barato que decidir caso a caso. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES_HTML[char] ?? char);
}
