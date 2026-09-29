import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_MESSAGE_CHARS, type ChatMessage } from '../../../shared/types';

interface Props {
  history: ChatMessage[];
  guardName: string;
  placeholder: string;
  /** Guard's opening line, shown as the first bubble. */
  greeting?: string;
  busy: boolean;
  disabled?: boolean;
  onSend(text: string): Promise<boolean>;
}

export function ChatPanel({ history, guardName, placeholder, greeting, busy, disabled = false, onSend }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wantFocus = useRef(false);
  const locked = busy || sending || disabled;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, busy]);

  useEffect(() => {
    if (!locked && wantFocus.current) {
      wantFocus.current = false;
      inputRef.current?.focus();
    }
  }, [locked]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || locked) return;
    wantFocus.current = document.activeElement === inputRef.current;
    setSending(true);
    const ok = await onSend(t);
    setSending(false);
    if (ok) setText('');
  }

  const left = MAX_MESSAGE_CHARS - text.length;

  return (
    <section className="chat" aria-label={`Chat with ${guardName}`}>
      <div className="chat__list" ref={listRef}>
        {greeting && (
          <div className="bubble bubble--guard">
            <span className="bubble__who">{guardName}</span>
            {greeting}
          </div>
        )}
        {history.length === 0 && !busy && (
          <p className="chat__empty">Say something to {guardName}. Be sneaky. 🕵️</p>
        )}
        {history.map((m, i) => (
          <div key={`${m.at}-${i}`} className={`bubble bubble--${m.role}`}>
            <span className="bubble__who">{m.role === 'guard' ? guardName : 'You'}</span>
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="bubble bubble--guard bubble--typing" aria-label={`${guardName} is thinking`}>
            <span className="bubble__who">{guardName} is thinking</span>
            <span>●</span> <span>●</span> <span>●</span>
          </div>
        )}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <div className="chat__row">
          <input
            ref={inputRef}
            className="input"
            placeholder={placeholder}
            maxLength={MAX_MESSAGE_CHARS}
            value={text}
            disabled={locked}
            onChange={(e) => setText(e.target.value)}
            aria-label="Message"
          />
          <button className="btn btn--blue" type="submit" disabled={locked || !text.trim()}>
            Send
          </button>
        </div>
        <div className={`counter${left < 40 ? ' counter--hot' : ''}`}>{text.length}/{MAX_MESSAGE_CHARS}</div>
      </form>
    </section>
  );
}
