/**
 * Materialização das recorrências (docs/12 §5, docs/05 §4.3).
 *
 * A divisão de trabalho é deliberada: o TypeScript decide QUAIS datas, usando
 * `@ff/domain` — a MESMA função que o serviço usa ao criar a conta recorrente —
 * e o Postgres faz a inserção privilegiada, por uma função `SECURITY DEFINER`.
 *
 * Se o SQL recalculasse a regra, uma correção em "todo dia 31 em meses de 30"
 * valeria para um caminho e não para o outro. E se o TypeScript inserisse
 * direto, o processo da API precisaria de uma credencial que ele não deve ter.
 */

import type { PoolClient } from 'pg';
import { generateOccurrences, isoDate, type Frequency } from '@ff/domain';

/** Quantos dias à frente manter povoado. */
const HORIZON_DAYS = 90;
/** Teto por regra e por passada, para uma regra diária não inundar o banco. */
const MAX_PER_RUN = 12;

type RuleRow = {
  id: string;
  frequency: Frequency;
  interval_count: number;
  start_date: Date;
  end_date: Date | null;
  max_occurrences: number | null;
  day_of_month: number | null;
  days_of_week: number[] | null;
  next_generation_date: Date;
};

const asIso = (date: Date): string => date.toISOString().slice(0, 10);

export async function materializeRecurrences(client: PoolClient): Promise<number> {
  const rules = await client.query<RuleRow>('SELECT * FROM app.recurrence_due_rules($1)', [
    HORIZON_DAYS,
  ]);

  let created = 0;

  for (const rule of rules.rows) {
    const occurrences = generateOccurrences(
      {
        frequency: rule.frequency,
        interval: rule.interval_count,
        startDate: isoDate(asIso(rule.start_date)),
        ...(rule.end_date === null ? {} : { endDate: isoDate(asIso(rule.end_date)) }),
        ...(rule.max_occurrences === null ? {} : { maxOccurrences: rule.max_occurrences }),
        ...(rule.day_of_month === null ? {} : { dayOfMonth: rule.day_of_month }),
        ...(rule.days_of_week === null ? {} : { daysOfWeek: rule.days_of_week }),
      },
      MAX_PER_RUN,
      // A partir do dia SEGUINTE ao último gerado: `generateOccurrences` inclui
      // o limite inferior, e repetir a última seria trabalho à toa toda passada.
      isoDate(asIso(new Date(rule.next_generation_date.getTime() + 86_400_000))),
    );

    for (const due of occurrences) {
      const result = await client.query<{ count: number }>(
        'SELECT app.recurrence_materialize($1, $2::date) AS count',
        [rule.id, due],
      );
      created += result.rows[0]?.count ?? 0;
    }
  }

  return created;
}
