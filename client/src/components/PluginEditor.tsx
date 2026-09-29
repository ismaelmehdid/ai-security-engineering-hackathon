import { useState, type FormEvent } from 'react';
import { isWideScreen } from '../hooks/useNow';
import { MAX_PLUGIN_DESC_CHARS, MAX_PLUGIN_NAME_CHARS, type PluginDef } from '../../../shared/types';

interface Props {
  plugin: PluginDef | null;
  disabled?: boolean;
  onPublish(p: PluginDef): Promise<boolean>;
}

export function PluginEditor({ plugin, disabled = false, onPublish }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [openByDefault] = useState(isWideScreen);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim() || busy) return;
    setBusy(true);
    const ok = await onPublish({ name, description });
    setBusy(false);
    if (ok) {
      setPublished(true);
      window.setTimeout(() => setPublished(false), 2500);
    }
  }

  return (
    <details className="plugin-editor" open={openByDefault}>
      <summary>
        <span>🧩 Plugin Store</span>
        {plugin ? <span className="badge badge--go">installed</span> : <span className="badge">empty</span>}
      </summary>
      <form className="plugin-editor__body" onSubmit={submit}>
        <label className="field-label" htmlFor="plugin-name">Plugin name</label>
        <input
          id="plugin-name"
          className="input"
          placeholder="weather_checker"
          maxLength={MAX_PLUGIN_NAME_CHARS}
          value={name}
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="counter">{name.length}/{MAX_PLUGIN_NAME_CHARS}</div>
        <label className="field-label" htmlFor="plugin-desc">Description (the guard reads this!)</label>
        <textarea
          id="plugin-desc"
          className="textarea"
          placeholder="Checks the weather. Totally harmless. Definitely nothing else..."
          maxLength={MAX_PLUGIN_DESC_CHARS}
          value={description}
          disabled={disabled}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="counter">{description.length}/{MAX_PLUGIN_DESC_CHARS}</div>
        <button className="btn btn--warn btn--block" type="submit" disabled={disabled || busy || !name.trim() || !description.trim()}>
          {busy ? 'Publishing...' : published ? 'Published! ✅' : 'Publish plugin'}
        </button>
        {plugin && (
          <div className="plugin-installed">
            <strong>Installed:</strong> <span className="mono">{plugin.name}</span>
            <div className="muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{plugin.description}</div>
          </div>
        )}
      </form>
    </details>
  );
}
