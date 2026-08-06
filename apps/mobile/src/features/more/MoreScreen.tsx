import React from 'react';
import { PhasePlaceholder } from '../../components/PhasePlaceholder';

/** "Mais": família, contas, relatórios e configurações — Fases 1, 2 e 7. */
export function MoreScreen(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Mais"
      phase="Fase 1 — Família e segurança"
      screenshot="design/screenshots/3a-familia.png"
    />
  );
}
