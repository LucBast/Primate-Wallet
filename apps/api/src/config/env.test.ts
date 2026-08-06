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

  it('em produção, recusa CORS aberto, Sentry vazio e segredos iguais', () => {
    const production = {
      ...base,
      APP_ENV: 'production',
      SENTRY_DSN: 'https://exemplo@sentry.io/1',
      API_CORS_ORIGINS: 'https://app.exemplo.com',
    };
    expect(() => loadConfig(production)).not.toThrow();
    expect(() => loadConfig({ ...production, API_CORS_ORIGINS: '*' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...production, API_CORS_ORIGINS: '' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...production, SENTRY_DSN: '' })).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...production, JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET }),
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
