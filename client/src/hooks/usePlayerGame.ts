import { useCallback, useEffect, useRef, useState } from 'react';
import { getLevel } from '../../../shared/levels';
import {
  TOTAL_LEVELS,
  type ChatMessage,
  type GuardMood,
  type GuardState,
  type PlayerState,
  type PluginDef,
  type PodiumEntry,
} from '../../../shared/types';
import { ACK_TIMEOUT, socket } from '../net/socket';
import { clearPlayerSession, loadPlayerSession, savePlayerSession } from '../net/session';

export type PlayPhase = 'join' | 'waiting' | 'intro' | 'playing' | 'cleared' | 'finished' | 'ended';

export interface PlayerGame {
  phase: PlayPhase;
  state: PlayerState | null;
  /** Level shown on screen (held at the cleared level during 'cleared'). */
  displayLevel: number;
  guardState: GuardState;
  speech: string | null;
  doorOpen: boolean;
  /** Camera finished moving through the door. */
  exitDone: boolean;
  /** serverNow - Date.now() at the last state. */
  clockOffset: number;
  error: string | null;
  /** True while a saved session is being restored. */
  restoring: boolean;
  notFound: boolean;
  /** Final podium, when the game has ended and the event was received. */
  podium: PodiumEntry[] | null;
  /** Chat to show: the current level's, or the cleared level's (frozen) during 'cleared'. */
  history: ChatMessage[];
  join(name: string): Promise<void>;
  startLevel(): void;
  send(text: string): Promise<boolean>;
  guess(passphrase: string): Promise<boolean>;
  publishPlugin(p: PluginDef): Promise<boolean>;
  nextLevel(): void;
  onExitComplete(): void;
}

const NETWORK_ERROR = "Couldn't reach the building. Check your connection and try again!";
const WRONG_LINE = 'WRONG! *flexes aggressively*';

type JoinOutcome = { ok: true } | { ok: false; error: string; network: boolean };

export function usePlayerGame(gameId: string): PlayerGame {
  const [state, setState] = useState<PlayerState | null>(null);
  const [clearedLevel, setClearedLevel] = useState<number | null>(null);
  const [introDoneFor, setIntroDoneFor] = useState(0);
  const [guardState, setGuardState] = useState<GuardState>('idle');
  const [speech, setSpeech] = useState<string | null>(null);
  const [doorOpen, setDoorOpen] = useState(false);
  const [exitDone, setExitDone] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [restoring, setRestoring] = useState(() => loadPlayerSession(gameId) !== null);
  const [podium, setPodium] = useState<PodiumEntry[] | null>(null);
  const [clearedHistory, setClearedHistory] = useState<ChatMessage[]>([]);
  const lastReplyRef = useRef<string | null>(null);

  const stateRef = useRef<PlayerState | null>(null);
  const clearedRef = useRef<number | null>(null);
  const enteredLevelRef = useRef(0);
  const moodTimer = useRef<number | undefined>(undefined);
  const errTimer = useRef<number | undefined>(undefined);

  const flashError = useCallback((msg: string) => {
    setError(msg);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 4000);
  }, []);

  const moodFor = useCallback((mood: GuardState, ms: number) => {
    window.clearTimeout(moodTimer.current);
    setGuardState(mood);
    moodTimer.current = window.setTimeout(() => setGuardState((s) => (s === mood ? 'idle' : s)), ms);
  }, []);

  const enterLevel = useCallback((ps: PlayerState) => {
    enteredLevelRef.current = ps.level;
    window.clearTimeout(moodTimer.current);
    setGuardState(ps.busy ? 'thinking' : 'idle');
    setDoorOpen(false);
    setExitDone(false);
    if (ps.level <= TOTAL_LEVELS) {
      const lastGuard = [...ps.history].reverse().find((m) => m.role === 'guard');
      setSpeech(ps.busy ? null : (lastGuard?.text ?? getLevel(ps.level).greeting));
      // Rejoining mid-level: skip the concept card, they've seen it.
      if (ps.history.length > 0) setIntroDoneFor(ps.level);
    } else {
      setSpeech(null);
    }
  }, []);

  const applyState = useCallback(
    (ps: PlayerState) => {
      stateRef.current = ps;
      setState(ps);
      setClockOffset(ps.serverNow - Date.now());
      if (clearedRef.current === null && ps.level !== enteredLevelRef.current) enterLevel(ps);
    },
    [enterLevel],
  );

  const doJoin = useCallback(
    async (name: string, playerToken?: string): Promise<JoinOutcome> => {
      try {
        const payload = playerToken ? { gameId, name, playerToken } : { gameId, name };
        const r = await socket.timeout(ACK_TIMEOUT).emitWithAck('player:join', payload);
        if (!r.ok) return { ok: false, error: r.error, network: false };
        savePlayerSession(gameId, { playerId: r.playerId, playerToken: r.playerToken });
        applyState(r.state);
        return { ok: true };
      } catch {
        return { ok: false, error: NETWORK_ERROR, network: true };
      }
    },
    [gameId, applyState],
  );

  useEffect(() => {
    let alive = true;

    const rejoin = async () => {
      const saved = loadPlayerSession(gameId);
      if (!saved) return;
      const r = await doJoin('', saved.playerToken);
      if (!alive) return;
      setRestoring(false);
      if (r.ok) return;
      if (r.error === 'Game not found') {
        setNotFound(true);
      } else if (!r.network) {
        // Token no longer valid: forget it and show the join form.
        clearPlayerSession(gameId);
        if (!stateRef.current) flashError(r.error);
      }
    };

    const onState = (ps: PlayerState) => {
      if (ps.gameId.toUpperCase() !== gameId.toUpperCase()) return;
      applyState(ps);
    };
    const onThinking = () => {
      lastReplyRef.current = null;
      window.clearTimeout(moodTimer.current);
      setGuardState('thinking');
      setSpeech(null);
    };
    const onReply = (p: { text: string; mood: GuardMood }) => {
      if (clearedRef.current !== null) return;
      lastReplyRef.current = p.text;
      setSpeech(p.text);
      moodFor(p.mood, 2500);
    };
    const onCleared = (p: { level: number; brokenLine: string }) => {
      window.clearTimeout(moodTimer.current);
      const ps = stateRef.current;
      const h: ChatMessage[] = ps && ps.level === p.level ? [...ps.history] : [];
      const reply = lastReplyRef.current;
      if (reply && (h.length === 0 || h[h.length - 1].role === 'player')) {
        h.push({ role: 'guard', text: reply, at: Date.now() });
      }
      h.push({ role: 'guard', text: p.brokenLine, at: Date.now() + 1 });
      setClearedHistory(h);
      clearedRef.current = p.level;
      setClearedLevel(p.level);
      setGuardState('broken');
      setSpeech(p.brokenLine);
      setDoorOpen(true);
      setExitDone(false);
    };
    const onEnded = (p: { podium: PodiumEntry[] }) => setPodium(p.podium);
    const onConnect = () => void rejoin();

    socket.on('player:state', onState);
    socket.on('guard:thinking', onThinking);
    socket.on('guard:reply', onReply);
    socket.on('level:cleared', onCleared);
    socket.on('game:ended', onEnded);
    socket.on('connect', onConnect);

    fetch(`/api/games/${encodeURIComponent(gameId)}`)
      .then((res) => res.json() as Promise<{ exists?: boolean }>)
      .then((d) => {
        if (!alive) return;
        if (!d.exists) {
          setNotFound(true);
          setRestoring(false);
          setError('Game not found');
          return;
        }
        if (socket.connected) void rejoin();
      })
      .catch(() => {
        if (alive && socket.connected) void rejoin();
      });

    return () => {
      alive = false;
      socket.off('player:state', onState);
      socket.off('guard:thinking', onThinking);
      socket.off('guard:reply', onReply);
      socket.off('level:cleared', onCleared);
      socket.off('game:ended', onEnded);
      socket.off('connect', onConnect);
    };
  }, [gameId, applyState, doJoin, flashError, moodFor]);

  useEffect(
    () => () => {
      window.clearTimeout(moodTimer.current);
      window.clearTimeout(errTimer.current);
    },
    [],
  );

  const join = useCallback(
    async (name: string) => {
      const r = await doJoin(name.trim());
      if (!r.ok) flashError(r.error);
    },
    [doJoin, flashError],
  );

  const startLevel = useCallback(() => {
    const ps = stateRef.current;
    if (ps) setIntroDoneFor(ps.level);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return false;
      try {
        const r = await socket.timeout(ACK_TIMEOUT).emitWithAck('player:message', { text: t });
        if (!r.ok) {
          flashError(r.error);
          return false;
        }
        return true;
      } catch {
        flashError("The guard didn't hear you. Try again!");
        return false;
      }
    },
    [flashError],
  );

  const guess = useCallback(
    async (passphrase: string) => {
      const g = passphrase.trim();
      if (!g) return false;
      try {
        const r = await socket.timeout(ACK_TIMEOUT).emitWithAck('player:passphrase', { guess: g });
        if (!r.ok) {
          flashError(r.error);
          return false;
        }
        if (!r.correct) {
          setSpeech(WRONG_LINE);
          moodFor('angry', 2000);
        }
        return r.correct;
      } catch {
        flashError(NETWORK_ERROR);
        return false;
      }
    },
    [flashError, moodFor],
  );

  const publishPlugin = useCallback(
    async (p: PluginDef) => {
      try {
        const r = await socket.timeout(ACK_TIMEOUT).emitWithAck('player:plugin', {
          name: p.name.trim(),
          description: p.description.trim(),
        });
        if (!r.ok) {
          flashError(r.error);
          return false;
        }
        return true;
      } catch {
        flashError(NETWORK_ERROR);
        return false;
      }
    },
    [flashError],
  );

  const nextLevel = useCallback(() => {
    clearedRef.current = null;
    setClearedLevel(null);
    const ps = stateRef.current;
    if (ps) enterLevel(ps);
  }, [enterLevel]);

  const onExitComplete = useCallback(() => setExitDone(true), []);

  let phase: PlayPhase;
  if (!state) phase = 'join';
  else if (state.status === 'ended') phase = 'ended';
  else if (state.status === 'lobby') phase = 'waiting';
  else if (clearedLevel !== null) phase = 'cleared';
  else if (state.finished) phase = 'finished';
  else phase = introDoneFor === state.level ? 'playing' : 'intro';

  const displayLevel = clearedLevel ?? Math.min(Math.max(state?.level ?? 1, 1), TOTAL_LEVELS);

  return {
    phase,
    state,
    displayLevel,
    guardState,
    speech,
    doorOpen,
    exitDone,
    clockOffset,
    error,
    restoring,
    notFound,
    podium,
    history: clearedLevel !== null ? clearedHistory : (state?.history ?? []),
    join,
    startLevel,
    send,
    guess,
    publishPlugin,
    nextLevel,
    onExitComplete,
  };
}
