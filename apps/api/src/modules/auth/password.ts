/**
 * Hash de senha com Argon2id (docs/10 §2).
 *
 * Parâmetros seguem a recomendação do OWASP para Argon2id: 19 MiB de memória,
 * 2 iterações, paralelismo 1. `@node-rs/argon2` traz binários pré-compilados,
 * o que evita depender de toolchain nativa em cada máquina e no CI.
 */

import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id` é um `const enum` ambiente e não pode ser lido com
 * `verbatimModuleSyntax`; o valor numérico do enum é 2 (Argon2d=0, Argon2i=1).
 */
const ARGON2ID = 2;

const HASH_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain, HASH_OPTIONS);
  } catch {
    // Hash corrompido ou em formato desconhecido: trata como senha inválida,
    // sem distinguir do caso "senha errada".
    return false;
  }
}

/**
 * Hash de uma senha fictícia, calculado uma vez, usado para equalizar o tempo
 * de resposta quando o e-mail não existe. Sem isso, a diferença de latência
 * entrega quais e-mails estão cadastrados (enumeração de contas).
 */
let dummyHashPromise: Promise<string> | undefined;

export async function equalizeTimingForUnknownUser(): Promise<void> {
  dummyHashPromise ??= hashPassword('senha-inexistente-para-equalizar-tempo');
  const dummy = await dummyHashPromise;
  await verifyPassword('tentativa-invalida', dummy);
}
