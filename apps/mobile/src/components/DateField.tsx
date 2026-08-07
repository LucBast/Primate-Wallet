/**
 * Campo de data: `SelectField` mais o seletor nativo do sistema.
 *
 * O screenshot 1e mostra "DATA · Hoje, 06/08 ▾" — um select, não um campo de
 * texto onde se digita "2026-08-08". O calendário é o do sistema operacional
 * (`@react-native-community/datetimepicker`), que não traz tema próprio: o
 * CLAUDE.md proíbe kits de UI com opinião visual, não utilitários.
 */

import React, { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SelectField } from './SelectField';
import { dayMonth } from '../services/dates';

export type DateFieldProps = {
  readonly label: string;
  /** Data civil (AAAA-MM-DD) — nunca um instante. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Dia de hoje na família, para escrever "Hoje, 06/08". */
  readonly today: string;
  readonly minimum?: string | undefined;
  readonly maximum?: string | undefined;
  readonly testID?: string | undefined;
};

/** "Hoje, 06/08" quando é o dia corrente; "06/08" nos demais (1e). */
export function dateFieldLabel(value: string, today: string): string {
  return value === today ? `Hoje, ${dayMonth(value)}` : dayMonth(value);
}

export function DateField({
  label,
  value,
  onChange,
  today,
  minimum,
  maximum,
  testID,
}: DateFieldProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SelectField
        testID={testID}
        label={label}
        value={dateFieldLabel(value, today)}
        onPress={() => setOpen(true)}
      />

      {open ? (
        <DateTimePicker
          value={new Date(`${value}T12:00:00Z`)}
          mode="date"
          display="calendar"
          {...(minimum === undefined ? {} : { minimumDate: new Date(`${minimum}T12:00:00Z`) })}
          {...(maximum === undefined ? {} : { maximumDate: new Date(`${maximum}T12:00:00Z`) })}
          onChange={(event, selected) => {
            setOpen(false);
            // O dia escolhido é lido no fuso do aparelho, que é o mesmo em que
            // o usuário tocou no calendário — nada de UTC aqui.
            if (event.type !== 'set' || selected === undefined) return;
            const year = selected.getFullYear();
            const month = String(selected.getMonth() + 1).padStart(2, '0');
            const day = String(selected.getDate()).padStart(2, '0');
            onChange(`${year}-${month}-${day}`);
          }}
        />
      ) : null}
    </>
  );
}
