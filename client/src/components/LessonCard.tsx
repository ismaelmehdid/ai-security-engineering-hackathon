import type { LevelInfo } from '../../../shared/levels';
import { TOTAL_LEVELS } from '../../../shared/types';
import { Confetti } from './Confetti';

export function LessonCard({ level, onNext }: { level: LevelInfo; onNext(): void }) {
  const last = level.id >= TOTAL_LEVELS;
  return (
    <div className="overlay">
      <Confetti count={40} />
      <article className="card lesson-card" style={{ position: 'relative', zIndex: 41 }}>
        <h1>LEVEL CLEARED!</h1>
        <p className="lesson-card__broken">
          <strong>{level.guardName}:</strong> {level.brokenLine}
        </p>
        <span className="badge badge--pop">{level.topic}</span>
        <h3>How real engineers stop this:</h3>
        <p className="lesson-card__lesson">{level.lesson}</p>
        <div className="concept__cta">
          <button className="btn btn--go btn--big" onClick={onNext} autoFocus>
            {last ? 'Escape! →' : 'Next door →'}
          </button>
        </div>
      </article>
    </div>
  );
}
