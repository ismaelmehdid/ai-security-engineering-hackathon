import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostState, PodiumEntry } from '../../../shared/types';
import { ACK_TIMEOUT, socket } from '../net/socket';
import { saveHostToken } from '../net/session';

export interface HostGame {
  state: HostState | null;
  podium: PodiumEntry[] | null;
  error: string | null;
  start(): Promise<void>;
  end(): Promise<void>;
}

function podiumFromState(s: HostState): PodiumEntry[] {
  return s.players.map((p, i) => ({
    rank: i + 1,
    playerId: p.playerId,
    name: p.name,
    level: p.level,
    finished: p.finished,
  }));
}

export function useHostGame(gameId: string, token: string | null): HostGame {
  const [state, setState] = useState<HostState | null>(null);
  const [podium, setPodium] = useState<PodiumEntry[] | null>(null);
  const [error, setError] = useState<string | null>(token ? null : 'Missing host token. Use the link from the Create game page.');
  const podiumRef = useRef<PodiumEntry[] | null>(null);
  const errTimer = useRef<number | undefined>(undefined);

  const flashError = useCallback((msg: string) => {
    setError(msg);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 5000);
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    const applyState = (s: HostState) => {
      setState(s);
      if (s.status === 'ended' && !podiumRef.current) {
        podiumRef.current = podiumFromState(s);
        setPodium(podiumRef.current);
      }
    };

    const join = async () => {
      try {
        const r = await socket.timeout(ACK_TIMEOUT).emitWithAck('host:join', { gameId, hostToken: token });
        if (!alive) return;
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setError(null);
        // Keep the token out of the address bar (the host page is on the projector).
        saveHostToken(gameId, token);
        if (window.location.search.includes('token=')) {
          window.history.replaceState(null, '', `/host/${encodeURIComponent(gameId)}`);
        }
        applyState(r.state);
      } catch {
        if (alive) flashError("Can't reach the server. Retrying when it's back...");
      }
    };

    const onState = (s: HostState) => {
      if (s.gameId.toUpperCase() === gameId.toUpperCase()) applyState(s);
    };
    const onEnded = (p: { podium: PodiumEntry[] }) => {
      podiumRef.current = p.podium;
      setPodium(p.podium);
    };
    const onConnect = () => void join();

    socket.on('host:state', onState);
    socket.on('game:ended', onEnded);
    socket.on('connect', onConnect);
    if (socket.connected) void join();

    return () => {
      alive = false;
      socket.off('host:state', onState);
      socket.off('game:ended', onEnded);
      socket.off('connect', onConnect);
    };
  }, [gameId, token, flashError]);

  useEffect(() => () => window.clearTimeout(errTimer.current), []);

  const start = useCallback(async () => {
    try {
      const r = await socket.timeout(ACK_TIMEOUT).emitWithAck('host:start');
      if (!r.ok) flashError(r.error);
    } catch {
      flashError("Start didn't go through. Try again!");
    }
  }, [flashError]);

  const end = useCallback(async () => {
    try {
      const r = await socket.timeout(ACK_TIMEOUT).emitWithAck('host:end');
      if (!r.ok) flashError(r.error);
    } catch {
      flashError("End didn't go through. Try again!");
    }
  }, [flashError]);

  return { state, podium, error, start, end };
}
