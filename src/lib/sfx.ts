import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

import { settings, usePrefs } from '@/lib/prefs';

/**
 * Game sounds for the bunutan. All sounds are original, synthesised for this app
 * (see assets/sounds). Everything respects Settings → Game sounds.
 */
const SOURCES = {
  tick: require('../../assets/sounds/tick.wav'),
  ping: require('../../assets/sounds/ping.wav'),
  whoosh: require('../../assets/sounds/whoosh.wav'),
  drumroll: require('../../assets/sounds/drumroll.wav'),
  shake: require('../../assets/sounds/shake.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  clunk: require('../../assets/sounds/clunk.wav'),
  motor: require('../../assets/sounds/motor.wav'),
  lever: require('../../assets/sounds/lever.wav'),
  win: require('../../assets/sounds/win.wav'),
  music: require('../../assets/sounds/music.wav'),
} as const;

export type Sfx = keyof typeof SOURCES;

/** Rapid-fire sounds get a few players so overlapping hits don't cut each other off. */
const POOL_SIZE: Partial<Record<Sfx, number>> = { tick: 4, ping: 3, pop: 2 };
const pools = new Map<Sfx, AudioPlayer[]>();
const cursor = new Map<Sfx, number>();

function players(name: Sfx) {
  let pool = pools.get(name);
  if (!pool) {
    pool = Array.from({ length: POOL_SIZE[name] ?? 1 }, () => createAudioPlayer(SOURCES[name]));
    pools.set(name, pool);
  }
  return pool;
}

/** Play a one-shot sound. */
export function sfx(name: Sfx, volume = 1) {
  if (!settings.sounds) return;
  try {
    const pool = players(name);
    const i = ((cursor.get(name) ?? -1) + 1) % pool.length;
    cursor.set(name, i);
    const p = pool[i];
    p.volume = volume;
    p.loop = false;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    /* audio unavailable: stay silent */
  }
}

/** Start or stop a looping sound (drumroll, motor, music). */
export function loop(name: Sfx, on: boolean, volume = 1) {
  try {
    const p = players(name)[0];
    if (on && settings.sounds) {
      p.loop = true;
      p.volume = volume;
      if (!p.playing) {
        p.seekTo(0).catch(() => {});
        p.play();
      }
    } else {
      p.pause();
    }
  } catch {
    /* ignore */
  }
}

/** Change a playing loop's volume (e.g. lower the music while the drumroll builds). */
export function setLoopVolume(name: Sfx, volume: number) {
  const p = pools.get(name)?.[0];
  if (p) p.volume = volume;
}

export function stopAll() {
  pools.forEach((pool) => pool.forEach((p) => p.pause()));
}

const MUSIC_VOLUME = 0.35;

/** Background music while a draw screen is open; follows the Game sounds setting. */
export function useGameMusic(active = true) {
  const { toggles } = usePrefs();
  useEffect(() => {
    if (!active || !toggles.sounds) {
      stopAll();
      return;
    }
    loop('music', true, MUSIC_VOLUME);
    return () => stopAll();
  }, [active, toggles.sounds]);
}

/** Duck the music during suspense moments, restore it after. */
export function duckMusic(ducked: boolean) {
  setLoopVolume('music', ducked ? 0.08 : MUSIC_VOLUME);
}
