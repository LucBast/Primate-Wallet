/**
 * Configuração validada no startup (docs/15 §6).
 *
 * Se qualquer variável estiver ausente ou inválida, o processo NÃO sobe — é
 * preferível falhar no deploy a servir tráfego com configuração incompleta.
 */

import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const intFromEnv = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const envSchema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'production']),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: intFromEnv(1, 65_535).default(3333),
    API_CORS_ORIGINS: z.string().default(''),
    /**
     * Base https pública deste serviço, sem barra no fim. É dela que sai o link
     * dos e-mails: `<base>/abrir/verificar-email?token=…`. Vazia, os e-mails
     * caem no deep link cru `familyfinance://…`, que serve para teste local e
     * NÃO funciona em cliente de e-mail nenhum — por isso é exigida em produção.
     */
    PUBLIC_BASE_URL: z.string().default(''),

    DATABASE_URL: z.string().min(1),
    DATABASE_AUTH_URL: z.string().min(1).optional(),
    DATABASE_MIGRATION_URL: z.string().min(1),
    DATABASE_POOL_MAX: intFromEnv(1, 100).default(10),
    DATABASE_SSL: booleanFromEnv.default(false),
    /**
     * Certificado raiz do banco, em PEM codificado em base64.
     *
     * Existe porque provedores gerenciados nem sempre usam uma CA pública. O
     * Supabase, por exemplo, serve o pooler com a "Supabase Root 2021 CA", que
     * é auto-assinada: sem esta variável, a conexão do runtime falha com
     * SELF_SIGNED_CERT_IN_CHAIN — e a saída fácil seria desligar a verificação,
     * o que deixaria a credencial do banco exposta a quem estivesse no meio.
     *
     * Base64 e não PEM cru para caber numa linha de `.env` e num segredo do
     * Cloud Run sem depender de como cada um trata quebra de linha.
     */
    DATABASE_SSL_CA: z.string().default(''),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter ao menos 32 caracteres.'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter ao menos 32 caracteres.'),
    JWT_ACCESS_TTL: intFromEnv(60, 86_400).default(900),
    JWT_REFRESH_TTL: intFromEnv(3_600, 31_536_000).default(2_592_000),
    JWT_ISSUER: z.string().min(1).default('family-finance'),

    SENTRY_DSN: z.string().default(''),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

    /**
     * Envio de e-mail transacional (Resend). Vazio = `createLogMailer`: o link
     * de confirmação só aparece no log. Serve em desenvolvimento e é
     * inaceitável em produção, onde ninguém consegue confirmar o cadastro.
     */
    RESEND_API_KEY: z.string().default(''),
    /** Remetente completo, no formato `Nome <caixa@dominio>`. */
    EMAIL_FROM: z.string().default(''),

    STORAGE_ENDPOINT: z.string().default(''),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_BUCKET: z.string().default(''),
    STORAGE_ACCESS_KEY_ID: z.string().default(''),
    STORAGE_SECRET_ACCESS_KEY: z.string().default(''),
    STORAGE_SIGNED_URL_TTL: intFromEnv(30, 3_600).default(300),
  })
  .superRefine((env, ctx) => {
    // Um base64 truncado decodifica em silêncio e vira lixo; o erro só
    // apareceria depois, como falha de TLS, longe da causa.
    if (env.DATABASE_SSL_CA.trim() !== '' && decodeCaPem(env.DATABASE_SSL_CA) === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_SSL_CA'],
        message:
          'Deve ser um certificado PEM codificado em base64 (esperado "-----BEGIN CERTIFICATE-----" após decodificar).',
      });
    }

    // O par é indivisível: chave sem remetente faz o Resend recusar todo envio,
    // e o erro apareceria só na primeira tentativa de cadastro, em produção.
    if (env.RESEND_API_KEY.trim() !== '' && env.EMAIL_FROM.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message:
          'Obrigatório quando RESEND_API_KEY está definida (ex.: "Primate Wallet <nao-responda@exemplo.com>").',
      });
    }

    if (env.APP_ENV === 'production') {
      if (env.API_CORS_ORIGINS.trim() === '' || env.API_CORS_ORIGINS.includes('*')) {
        ctx.addIssue({
          code: 'custom',
          path: ['API_CORS_ORIGINS'],
          message: 'Em produção, as origens de CORS devem ser explícitas (nunca "*").',
        });
      }
      if (env.RESEND_API_KEY.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['RESEND_API_KEY'],
          message:
            'Em produção, RESEND_API_KEY é obrigatória: sem ela o cadastro cria contas que ninguém consegue confirmar.',
        });
      }
      if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(env.PUBLIC_BASE_URL.trim().replace(/\/+$/, ''))) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_BASE_URL'],
          message:
            'Em produção, PUBLIC_BASE_URL é obrigatória e precisa ser https: os links de e-mail saem dela, e um deep link cru não é clicável em nenhum cliente de e-mail.',
        });
      }
      if (env.SENTRY_DSN.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['SENTRY_DSN'],
          message: 'Em produção, SENTRY_DSN é obrigatório (docs/14 §1).',
        });
      }
      if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_REFRESH_SECRET'],
          message: 'Os segredos de access e refresh devem ser diferentes.',
        });
      }
    }
  });

/**
 * Decodifica o PEM da CA, ou `null` se o valor não for um certificado.
 * `Buffer.from(..., 'base64')` ignora caracteres inválidos em vez de falhar,
 * então a checagem tem de ser pelo conteúdo decodificado.
 */
function decodeCaPem(base64: string): string | null {
  const pem = Buffer.from(base64.trim(), 'base64').toString('utf8');
  return pem.includes('-----BEGIN CERTIFICATE-----') ? pem : null;
}

export type RawEnv = z.infer<typeof envSchema>;

export type AppConfig = {
  readonly env: RawEnv['APP_ENV'];
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly logLevel: RawEnv['LOG_LEVEL'];
  readonly http: {
    readonly host: string;
    readonly port: number;
    readonly corsOrigins: readonly string[];
    /** Base https pública, sem barra no fim. Vazia = deep link cru nos e-mails. */
    readonly publicBaseUrl: string;
  };
  readonly database: {
    /** Conexão do runtime da aplicação (role ff_app, sujeito a RLS). */
    readonly url: string;
    /** Conexão do serviço de autenticação (role ff_auth). */
    readonly authUrl: string;
    readonly poolMax: number;
    readonly ssl: boolean;
    /** Certificado raiz já decodificado (PEM). Vazio = usar as CAs públicas. */
    readonly sslCa: string;
  };
  readonly auth: {
    readonly accessSecret: string;
    readonly refreshSecret: string;
    readonly accessTtlSeconds: number;
    readonly refreshTtlSeconds: number;
    readonly issuer: string;
  };
  readonly sentry: { readonly dsn: string; readonly tracesSampleRate: number };
  /** `apiKey` vazia = sem provedor: `main.ts` cai no mailer de log. */
  readonly email: { readonly resendApiKey: string; readonly from: string };
  readonly storage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly signedUrlTtlSeconds: number;
  };
};

export class ConfigError extends Error {
  constructor(issues: readonly string[]) {
    super(`Configuração inválida:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const env = parsed.data;

  return {
    env: env.APP_ENV,
    isProduction: env.APP_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    logLevel: env.LOG_LEVEL,
    http: {
      host: env.API_HOST,
      port: env.API_PORT,
      corsOrigins: env.API_CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
      publicBaseUrl: env.PUBLIC_BASE_URL.trim().replace(/\/+$/, ''),
    },
    database: {
      url: env.DATABASE_URL,
      // Sem URL dedicada, o serviço de autenticação usa a mesma conexão. Em
      // homologação e produção, DATABASE_AUTH_URL (role ff_auth) é obrigatória
      // para valer a separação de privilégios — ver docs/02-ENVIRONMENTS.md.
      authUrl: env.DATABASE_AUTH_URL ?? env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL,
      sslCa: env.DATABASE_SSL_CA.trim() === '' ? '' : (decodeCaPem(env.DATABASE_SSL_CA) ?? ''),
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL,
      refreshTtlSeconds: env.JWT_REFRESH_TTL,
      issuer: env.JWT_ISSUER,
    },
    sentry: { dsn: env.SENTRY_DSN, tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE },
    email: { resendApiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM },
    storage: {
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      bucket: env.STORAGE_BUCKET,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      signedUrlTtlSeconds: env.STORAGE_SIGNED_URL_TTL,
    },
  };
}
