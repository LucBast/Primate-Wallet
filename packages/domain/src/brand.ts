/**
 * Tipos "marcados" (branded types).
 *
 * Usamos uma propriedade fantasma nomeada — e não `unique symbol` — porque o
 * símbolo único não é nomeável na emissão de `.d.ts` entre pacotes do monorepo
 * (TS4023), o que quebraria @ff/validation ao reexportar schemas destes tipos.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
