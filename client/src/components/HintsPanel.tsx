import { HINT_UNLOCK_SECONDS } from '../../../shared/types';
import { useState } from 'react';
import { formatMmSs, isWideScreen, useNow } from '../hooks/useNow';

interface Props {
  hints: readonly [string, string, string];
  levelStartedAt: number;
  clockOffset: number;
}

export function HintsPanel({ hints, levelStartedAt, clockOffset }: Props) {
  const now = useNow(1000);
  const [openByDefault] = useState(isWideScreen);
  const elapsed = (now + clockOffset - levelStartedAt) / 1000;
  const unlocked = HINT_UNLOCK_SECONDS.filter((s) => elapsed >= s).length;

  return (
    <details className="hints" open={openByDefault}>
      <summary>
        <span>💡 Hints</span>
        <span className="badge badge--go">{unlocked}/{hints.length}</span>
      </summary>
      <ol className="hints__list">
        {hints.map((h, i) =>
          elapsed >= HINT_UNLOCK_SECONDS[i] ? (
            <li key={i} className="hint">
              <span className="hint__num">#{i + 1}</span>
              {h}
            </li>
          ) : (
            <li key={i} className="hint hint--locked">
              <span><span className="hint__num">#{i + 1}</span>🔒 Locked</span>
              <span className="mono">{formatMmSs(Math.ceil(HINT_UNLOCK_SECONDS[i] - elapsed))}</span>
            </li>
          ),
        )}
      </ol>
    </details>
  );
}
