import React from 'react';
import { PhasePlaceholder } from '../../components/PhasePlaceholder';

/**
 * Lançamento rápido — destino do botão central "+" da BottomNav.
 * Fase 8, screenshot 1c-lancamento-rapido.png.
 */
export function QuickEntryScreen(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Novo lançamento"
      phase="Fase 8 — Experiência rápida"
      screenshot="design/screenshots/1c-lancamento-rapido.png"
    />
  );
}
