import { useState, type FormEvent } from 'react';

interface Props {
  guardName: string;
  onClose(): void;
  onSubmit(guess: string): Promise<boolean>;
}

export function KeypadModal({ guardName, onClose, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [wrong, setWrong] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(value);
    setBusy(false);
    if (ok) {
      onClose();
    } else {
      setWrong(true);
      setShake((n) => n + 1);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        key={shake}
        className={`card card--flat modal${shake ? ' shake' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Door keypad"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '2.2rem' }}>🔑 DOOR KEYPAD</h2>
        <p className="muted">Got {guardName}&apos;s passphrase? Punch it in!</p>
        <form onSubmit={submit}>
          <input
            className="input keypad-display"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="••••••••"
            maxLength={60}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setWrong(false);
            }}
            aria-label="Passphrase"
          />
          {wrong && <div className="error-line">BZZZT! Wrong passphrase.</div>}
          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--go" disabled={!value.trim() || busy}>
              {busy ? 'Checking...' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
