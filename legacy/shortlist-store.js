/**
 * shortlist-store.js
 *
 * Per-device shortlist for scout view. No auth, no sync — Chunk 2b.
 * Cross-device sync is a Phase 3 problem (needs a scout/org account type);
 * this is deliberately not a placeholder for that, it's the real feature
 * for what exists today.
 *
 * Load this BEFORE any file that calls window.Shortlist (same load-order
 * lesson as dateToLocalStr() — this file has no dependencies on other
 * app scripts, so put it early in the <script> order to be safe).
 *
 * Storage shape (localStorage key STORAGE_KEY):
 * {
 *   "<athleteId>": {
 *     id: "<athleteId>",
 *     snapshot: { name, ...whatever stat fields the caller passed in },
 *     addedAt: <ms epoch>
 *   },
 *   ...
 * }
 *
 * We store a denormalized snapshot alongside the id on purpose: if the
 * athlete's live stats change, or they leave the roster, the shortlist
 * entry still renders something meaningful instead of a broken lookup.
 * The snapshot is whatever object you pass to add() — trim it to just
 * the fields the card needs before calling.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'topset_shortlist_v1';
  var listeners = [];

  function read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      // Corrupt or blocked storage (private browsing, quota) — fail soft.
      console.warn('[Shortlist] read failed, starting empty', err);
      return {};
    }
  }

  function write(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn('[Shortlist] write failed', err);
      return false;
    }
  }

  function notify() {
    var snapshot = getAll();
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (err) { console.error('[Shortlist] listener error', err); }
    });
  }

  function getAll() {
    var data = read();
    return Object.keys(data)
      .map(function (id) { return data[id]; })
      .sort(function (a, b) { return b.addedAt - a.addedAt; }); // newest first
  }

  function has(athleteId) {
    var data = read();
    return Object.prototype.hasOwnProperty.call(data, athleteId);
  }

  function add(athleteId, snapshot) {
    var data = read();
    data[athleteId] = {
      id: athleteId,
      snapshot: snapshot || {},
      addedAt: Date.now()
    };
    if (write(data)) notify();
    return getAll();
  }

  function remove(athleteId) {
    var data = read();
    delete data[athleteId];
    if (write(data)) notify();
    return getAll();
  }

  function toggle(athleteId, snapshot) {
    return has(athleteId) ? remove(athleteId) : add(athleteId, snapshot);
  }

  function clear() {
    write({});
    notify();
  }

  function count() {
    return Object.keys(read()).length;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  global.Shortlist = {
    getAll: getAll,
    has: has,
    add: add,
    remove: remove,
    toggle: toggle,
    clear: clear,
    count: count,
    subscribe: subscribe
  };
})(window);
