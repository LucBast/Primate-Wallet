import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

const base = {
  APP_ENV: 'development',
  DATABASE_URL: 'postgres://ff_app:x@localhost:5433/ff',
  DATABASE_MIGRATION_URL: 'postgres://ff_migrator:x@localhost:5433/ff',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('loadConfig (docs/15 §6)', () => {
  it('aplica padrões e normaliza origens de CORS', () => {
    const config = loadConfig({
      ...base,
      API_CORS_ORIGINS: 'http://localhost:8081, https://app.exemplo.com ,',
    });
    expect(config.http.port).toBe(3333);
    expect(config.auth.accessTtlSeconds).toBe(900);
    expect(config.http.corsOrigins).toEqual(['http://localhost:8081', 'https://app.exemplo.com']);
  });

  it('derruba o processo quando falta variável obrigatória', () => {
    expect(() => loadConfig({ APP_ENV: 'development' })).toThrow(ConfigError);
  });

  it('recusa segredo de JWT curto', () => {
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: 'curto' })).toThrow(ConfigError);
  });

  it('em produção, recusa CORS aberto, Sentry vazio, e-mail sem provedor e segredos iguais', () => {
    const production = {
      ...base,
      APP_ENV: 'production',
      SENTRY_DSN: 'https://exemplo@sentry.io/1',
      API_CORS_ORIGINS: 'https://app.exemplo.com',
      RESEND_API_KEY: 're_chave',
      EMAIL_FROM: 'Primate Wallet <nao-responda@exemplo.com>',
      PUBLIC_BASE_URL: 'https://api.exemplo.app',
    };
    expect(() => loadConfig(production)).not.toThrow();
    // Sem base pública os e-mails sairiam com deep link cru, que nenhum
    // cliente de e-mail transforma em link: cadastro impossível de confirmar.
    expect(() => loadConfig({ ...production, PUBLIC_BASE_URL: '' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...production, PUBLIC_BASE_URL: 'http://api.exemplo.app' })).toThrow(
      ConfigError,
    );
    // Barra no fim é tolerada: loadConfig normaliza antes de montar o link.
    expect(() =>
      loadConfig({ ...production, PUBLIC_BASE_URL: 'https://api.exemplo.app/' }),
    ).not.toThrow();
    expect(() => loadConfig({ ...production, API_CORS_ORIGINS: '*' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...production, API_CORS_ORIGINS: '' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...production, SENTRY_DSN: '' })).toThrow(ConfigError);
    // Sem provedor de e-mail, produção criaria contas que ninguém confirma.
    expect(() => loadConfig({ ...production, RESEND_API_KEY: '' })).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...production, JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET }),
    ).toThrow(ConfigError);
  });

  it('exige remetente junto com a chave do Resend, em qualquer ambiente', () => {
    // Vazio dos dois lados é o caminho de desenvolvimento: cai no mailer de log.
    expect(loadConfig(base).email).toEqual({ resendApiKey: '', from: '' });
    expect(() => loadConfig({ ...base, RESEND_API_KEY: 're_chave' })).toThrow(ConfigError);
    expect(
      loadConfig({ ...base, RESEND_API_KEY: 're_chave', EMAIL_FROM: 'X <a@b.com>' }).email,
    ).toEqual({ resendApiKey: 're_chave', from: 'X <a@b.com>' });
  });

  it('decodifica a CA do banco e recusa base64 que não seja certificado', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
    const base64 = Buffer.from(pem, 'utf8').toString('base64');

    expect(loadConfig({ ...base, DATABASE_SSL_CA: base64 }).database.sslCa).toBe(pem);
    // Ausente é o caso normal de quem usa CA pública: nada de erro, campo vazio.
    expect(loadConfig(base).database.sslCa).toBe('');
    // Base64 válido, conteúdo que não é certificado — o erro tem de sair aqui, e
    // não lá na frente, disfarçado de falha de TLS.
    expect(() =>
      loadConfig({ ...base, DATABASE_SSL_CA: Buffer.from('nada disso').toString('base64') }),
    ).toThrow(ConfigError);
  });

  it('usa DATABASE_URL como fallback da conexão de autenticação', () => {
    expect(loadConfig(base).database.authUrl).toBe(base.DATABASE_URL);
    expect(
      loadConfig({ ...base, DATABASE_AUTH_URL: 'postgres://ff_auth:x@localhost:5433/ff' }).database
        .authUrl,
    ).toBe('postgres://ff_auth:x@localhost:5433/ff');
  });
});
