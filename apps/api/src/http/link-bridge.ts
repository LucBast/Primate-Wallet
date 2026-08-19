/**
 * Ponte entre o e-mail e o app.
 *
 * Todo link de e-mail apontava direto para `familyfinance://…`, e isso não
 * funciona fora do laboratório: cliente de e-mail não transforma em link um
 * esquema que não seja http(s), e colar o texto na barra do Chrome dá
 * "endereço inválido" — o navegador trata como busca. O efeito era um cadastro
 * que ninguém conseguia confirmar.
 *
 * Aqui o e-mail passa a apontar para uma página https deste mesmo serviço, cujo
 * único trabalho é oferecer um BOTÃO com o deep link. O toque é um gesto do
 * usuário dentro de uma página, e aí o Android entrega o intent ao app como
 * deveria. Nada de Android App Links (`autoVerify`): eles exigiriam servir um
 * `assetlinks.json` num domínio próprio, e o domínio ainda não existe.
 *
 * A página NÃO consome o token nem toca no banco, e isso é deliberado:
 * antivírus de e-mail corporativo abre todo link da mensagem antes de a pessoa
 * ler. Uma página que confirmasse sozinha queimaria o token de uso único no
 * robô, e o dono da conta receberia "link inválido". Quem consome é o app.
 */

import type { FastifyInstance } from 'fastify';

/** Esquema de deep link do app (docs/12). */
export const DEEP_LINK_SCHEME = 'familyfinance';

/**
 * Só estas rotas viram deep link. É uma lista fechada de propósito: sem ela, a
 * página aceitaria qualquer caminho e viraria um redirecionador aberto para
 * `familyfinance://qualquer-coisa`.
 */
const ROUTES = {
  'verificar-email': {
    title: 'Confirme seu e-mail',
    lead: 'Toque no botão para confirmar seu e-mail e entrar no Primate Wallet.',
    action: 'Confirmar no app',
  },
  entrar: {
    title: 'Entrar no Primate Wallet',
    lead: 'Toque no botão para entrar sem digitar a senha.',
    action: 'Entrar no app',
  },
  'senha-nova': {
    title: 'Criar uma senha nova',
    lead: 'Toque no botão para escolher sua nova senha no aplicativo.',
    action: 'Abrir o app',
  },
  convite: {
    title: 'Convite para uma família',
    lead: 'Toque no botão para ver o convite no Primate Wallet.',
    action: 'Ver o convite',
  },
} as const;

export type BridgeRoute = keyof typeof ROUTES;

/**
 * `createSingleUseToken` gera `randomBytes(32).toString('base64url')`: 43
 * caracteres de `[A-Za-z0-9_-]`. A faixa aceita é folgada para não quebrar se o
 * tamanho do token mudar, mas o alfabeto é fechado — é ele que garante que o
 * valor não escapa do atributo HTML.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,256}$/;

/** Paleta clara de `design/design-tokens.ts`, a mesma do corpo do e-mail. */
const BRAND = '#146E64';
const PAGE = '#FAF9F7';
const CARD = '#FFFFFF';
const TEXT = '#1C1B1A';
const MUTED = '#6B6862';

/**
 * Manrope não é embarcada aqui. A fonte da marca vive no bundle do app; servir
 * um TTF nesta página só para uma frase custaria mais do que entrega, e a
 * página existe por dois segundos entre o e-mail e o app.
 */
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Primate Wallet</title>
</head>
<body style="margin:0;padding:24px;background:${PAGE};font-family:${FONT};color:${TEXT}">
<div style="max-width:420px;margin:0 auto;background:${CARD};border-radius:16px;padding:28px">
${body}
</div>
</body>
</html>`;
}

function successPage(route: BridgeRoute, token: string): string {
  const { title, lead, action } = ROUTES[route];
  const deepLink = `${DEEP_LINK_SCHEME}://${route}?token=${encodeURIComponent(token)}`;

  return page(`<h1 style="margin:0 0 12px;font-size:22px;font-weight:800">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:${MUTED}">${escapeHtml(lead)}</p>
<a href="${escapeHtml(deepLink)}" style="display:block;background:${BRAND};color:#FFFFFF;text-decoration:none;text-align:center;font-size:16px;font-weight:700;padding:16px;border-radius:12px">${escapeHtml(action)}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${MUTED}">Abra esta página no celular onde o Primate Wallet está instalado. Se o botão não abrir o aplicativo, é porque ele ainda não está instalado neste aparelho.</p>`);
}

function errorPage(): string {
  return page(`<h1 style="margin:0 0 12px;font-size:22px;font-weight:800">Link inválido</h1>
<p style="margin:0;font-size:15px;line-height:1.5;color:${MUTED}">Este link não é válido ou foi copiado pela metade. Peça um novo pelo aplicativo.</p>`);
}

/**
 * Rota pública, sem autenticação: quem abre o link ainda não tem sessão — é
 * justamente esse o problema que ela resolve.
 */
export function registerLinkBridge(app: FastifyInstance): void {
  app.get<{ Params: { rota: string }; Querystring: { token?: string } }>(
    '/abrir/:rota',
    async (request, reply) => {
      const { rota } = request.params;
      const token = request.query.token ?? '';
      const known = Object.prototype.hasOwnProperty.call(ROUTES, rota);

      void reply
        .type('text/html; charset=utf-8')
        // `no-store` porque a URL carrega um token de uso único: ela não pode
        // ficar em cache de proxy nem no histórico de um navegador partilhado.
        .header('cache-control', 'no-store')
        .header('x-robots-tag', 'noindex, nofollow');

      if (!known || !TOKEN_PATTERN.test(token)) {
        return reply.status(400).send(errorPage());
      }

      return reply.status(200).send(successPage(rota as BridgeRoute, token));
    },
  );
}
