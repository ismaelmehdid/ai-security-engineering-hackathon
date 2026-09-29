import { Home } from './pages/Home';
import { Host } from './pages/Host';
import { Play } from './pages/Play';
import { DevGuard } from './pages/DevGuard';
import { DevWorld } from './pages/DevWorld';

export function App() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'host' && parts[1]) return <Host gameId={parts[1].toUpperCase()} />;
  if (parts[0] === 'play' && parts[1]) return <Play gameId={parts[1].toUpperCase()} />;
  if (parts[0] === 'dev' && parts[1] === 'guard') return <DevGuard />;
  if (parts[0] === 'dev' && parts[1] === 'world') return <DevWorld />;
  return <Home />;
}
