import type { LevelInfo } from '../../../shared/levels';
import { TOTAL_LEVELS } from '../../../shared/types';

export function ConceptCard({ level, onStart }: { level: LevelInfo; onStart(): void }) {
  return (
    <div className="overlay overlay--intro">
      <article className="card concept pop-in" key={level.id}>
        <div className="concept__head">
          <span className="concept__level">DOOR {level.id} OF {TOTAL_LEVELS}</span>
          <span className="badge badge--pop">{level.topic}</span>
        </div>
        <h1 className="concept__title">{level.title}</h1>
        <p style={{ margin: 0 }}>
          Guarded by <strong>{level.guardName}</strong>
        </p>
        <div className="concept__funny">{level.concept.funny}</div>
        <section className="concept__section">
          <h3>What is it?</h3>
          <p>{level.concept.what}</p>
        </section>
        <section className="concept__section">
          <h3>Why does it work?</h3>
          <p>{level.concept.why}</p>
        </section>
        <div className="concept__cta">
          <button className="btn btn--danger btn--big" onClick={onStart} autoFocus>
            Face {level.guardName}
          </button>
        </div>
      </article>
    </div>
  );
}
