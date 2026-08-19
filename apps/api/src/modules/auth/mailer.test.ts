/**
 * O que estes testes protegem: o formato do POST para o Resend, o fato de a
 * falha PROPAGAR (é ela que desfaz o cadastro, ver o docblock de
 * `createResendMailer`) e o link nunca aparecer no log.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { createResendMailer } from './mailer.js';

const LINK = 'familyfinance:///verificar-email?token=abc123';

function fakeLogger(): Logger & { readonly info: ReturnType<typeof vi.fn> } {
  return { info: vi.fn(), error: vi.fn() } as unknown as Logger & {
    readonly info: ReturnType<typeof vi.fn>;
  };
}

function okFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
}

function mailer(fetchImpl: typeof fetch, logger = fakeLogger()) {
  return {
    logger,
    instance: createResendMailer({
      apiKey: 're_chave_de_teste',
      from: 'Primate Wallet <nao-responda@primatetechnology.com>',
      logger,
      fetchImpl,
    }),
  };
}

describe('createResendMailer', () => {
  it('posta no Resend com remetente, destinatário e as duas versões do corpo', async () => {
    const fetchImpl = okFetch();
    const { instance } = mailer(fetchImpl as unknown as typeof fetch);

    await instance.send({
      to: 'familia@exemplo.com',
      subject: 'Confirme seu e-mail',
      body: 'Confirme seu e-mail para começar a usar o aplicativo.',
      link: LINK,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_chave_de_teste');

    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload.from).toBe('Primate Wallet <nao-responda@primatetechnology.com>');
    expect(payload.to).toEqual(['familia@exemplo.com']);
    expect(payload.subject).toBe('Confirme seu e-mail');
    // O link precisa estar nas duas versões: cliente que não renderiza HTML
    // ainda tem de conseguir confirmar.
    expect(payload.text as string).toContain(LINK);
    expect(payload.html as string).toContain(LINK);
  });

  it('escapa o que vai para o HTML', async () => {
    const fetchImpl = okFetch();
    const { instance } = mailer(fetchImpl as unknown as typeof fetch);

    await instance.send({
      to: 'a@b.com',
      subject: 'Convite de <script>alert(1)</script>',
      body: 'Chico & Cia',
    });

    const html = (
      JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string) as {
        html: string;
      }
    ).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Chico &amp; Cia');
  });

  it('propaga a recusa do Resend, para a transação do cadastro desfazer', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"message":"Domain not verified"}', { status: 403 }),
    );
    const { instance, logger } = mailer(fetchImpl as unknown as typeof fetch);

    await expect(
      instance.send({ to: 'a@b.com', subject: 'Confirme seu e-mail', body: 'oi' }),
    ).rejects.toThrow(/403/);
    expect(logger.error).toHaveBeenCalled();
  });

  it('não escreve o link no log: ele é credencial de uso único', async () => {
    const fetchImpl = okFetch();
    const { instance, logger } = mailer(fetchImpl as unknown as typeof fetch);

    await instance.send({ to: 'a@b.com', subject: 'Confirme seu e-mail', body: 'oi', link: LINK });

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('abc123');
  });
});
