/**
 * Tests for configuration loading and validation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Snapshot current env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
  });

  it('should load valid configuration', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_AUDIENCE = 'api.example.com';
    process.env.OIDC_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';

    const config = loadConfig();

    expect(config.DATABASE_URL).toBe('postgresql://localhost/test');
    expect(config.RABBITMQ_URL).toBe('amqp://localhost');
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
  });

  it('should use default values', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_AUDIENCE = 'api.example.com';
    process.env.OIDC_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';

    const config = loadConfig();

    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.DATABASE_POOL_MAX).toBe(10);
    expect(config.ENABLE_RATE_LIMITING).toBe(true);
  });

  it('should throw on missing required variables', () => {
    delete process.env.DATABASE_URL;

    expect(() => loadConfig()).toThrow();
  });

  it('should parse numeric values correctly', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_AUDIENCE = 'api.example.com';
    process.env.OIDC_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';
    process.env.PORT = '8080';
    process.env.DATABASE_POOL_MAX = '20';

    const config = loadConfig();

    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_POOL_MAX).toBe(20);
  });

  it('should parse comma-separated origins', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_AUDIENCE = 'api.example.com';
    process.env.OIDC_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';
    process.env.ALLOWED_ORIGINS = 'http://localhost:4200,https://app.example.com';

    const config = loadConfig();

    expect(config.ALLOWED_ORIGINS).toEqual(['http://localhost:4200', 'https://app.example.com']);
  });

  it('should validate NODE_ENV enum', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_AUDIENCE = 'api.example.com';
    process.env.OIDC_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';
    process.env.NODE_ENV = 'production';

    const config = loadConfig();

    expect(config.NODE_ENV).toBe('production');
  });

  it('should throw on invalid NODE_ENV', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_AUDIENCE = 'api.example.com';
    process.env.OIDC_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';
    process.env.NODE_ENV = 'invalid';

    expect(() => loadConfig()).toThrow();
  });
});
