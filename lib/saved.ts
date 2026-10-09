"use client";

import { useSyncExternalStore } from "react";

/**
 * Saved companies, kept on this device only (browser storage), so saving needs no account and
 * nothing about it reaches the server. If storage is unavailable it still works for the visit.
 */
const KEY = "dncr:saved";
const EVENT = "dncr:saved";
const MAX = 500;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let memory: string[] = [];
let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return memory;
  }
  if (raw === cache.raw) return cache.list;
  let list: string[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((s): s is string => typeof s === "string" && SLUG.test(s)).slice(0, MAX);
  } catch {}
  cache = { raw, list };
  return list;
}

function write(list: string[]) {
  const clean = [...new Set(list)].filter((s) => SLUG.test(s)).slice(0, MAX);
  memory = clean;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: string[] = [];

/** The saved slugs, newest first, kept in sync across components and tabs. */
export function useSaved(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function isSaved(list: string[], slug: string) {
  return list.includes(slug);
}

export function toggleSaved(slug: string) {
  const list = read();
  write(list.includes(slug) ? list.filter((s) => s !== slug) : [slug, ...list]);
}

export function addSaved(slugs: string[]) {
  const list = read();
  write([...slugs.filter((s) => !list.includes(s)), ...list]);
}

export function removeSaved(slug: string) {
  write(read().filter((s) => s !== slug));
}

export function clearSaved() {
  write([]);
}
