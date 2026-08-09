/**
 * Banco local (WatermelonDB sobre SQLite).
 *
 * Adaptador pelo bridge, não pelo JSI: o instalador JSI do WatermelonDB 0.28
 * pede o ponteiro do runtime pelo caminho antigo, que o modo bridgeless do
 * React Native 0.86 não expõe. O adaptador padrão passa pelo módulo nativo
 * clássico, que a camada de interoperabilidade do bridgeless ainda atende, e o
 * volume de dados aqui (algumas centenas de linhas de cache) está longe de
 * precisar do ganho do JSI. Registrado em docs/21-DECISIONS.md.
 */

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { localSchema } from './schema';
import { modelClasses } from './models';

let instance: Database | null = null;

export function localDatabase(): Database {
  instance ??= new Database({
    adapter: new SQLiteAdapter({
      schema: localSchema,
      dbName: 'familyfinance',
      // Sem `jsi: true` — ver o comentário do topo.
      onSetUpError: (error) => {
        // Cache corrompido não pode derrubar o app: ele é descartável por
        // definição. O outbox é o que dói perder, e por isso o erro sobe ao log.
        console.warn('Banco local indisponível; o app segue online.', error);
      },
    }),
    modelClasses,
  });
  return instance;
}
