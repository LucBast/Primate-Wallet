import React from 'react';
import { PhasePlaceholder } from '../../components/PhasePlaceholder';

/** Planejamento (A pagar | A receber | Calendário) — Fase 3, screenshot 1d. */
export function PlanningScreen(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Planejamento"
      phase="Fase 3 — Planejamento"
      screenshot="design/screenshots/1d-planejamento.png"
    />
  );
}
