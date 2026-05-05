// ==UserScript==
// @name         X Post & Reply Deleter
// @namespace    https://github.com/1igaming/tampermonkey-x-delete
// @version      1.2.3
// @description  Tampermonkey: on x.com/USER/with_replies, load the timeline and bulk-delete your posts matching keyword filters (body, reply context, quotes, cards, alts).
// @author       1igaming
// @homepageURL  https://github.com/1igaming/tampermonkey-x-delete
// @supportURL   https://github.com/1igaming/tampermonkey-x-delete/issues
// @downloadURL  https://raw.githubusercontent.com/1igaming/tampermonkey-x-delete/main/x-post-reply-deleter.user.js
// @updateURL    https://raw.githubusercontent.com/1igaming/tampermonkey-x-delete/main/x-post-reply-deleter.user.js
// @match        https://x.com/*/with_replies*
// @match        https://twitter.com/*/with_replies*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE = `
    #x-rfd-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 20, 25, 0.65);
      z-index: 999998;
      display: none;
      align-items: center;
      justify-content: center;
    }
    #x-rfd-backdrop.x-rfd-open { display: flex; }
    #x-rfd-panel {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #000;
      color: #e7e9ea;
      border: 1px solid #2f3336;
      border-radius: 16px;
      width: min(440px, 92vw);
      max-height: 85vh;
      overflow: auto;
      box-shadow: 0 8px 28px rgba(0,0,0,.45);
      z-index: 999999;
      padding: 16px 18px 14px;
    }
    #x-rfd-panel h2 { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
    #x-rfd-panel p { margin: 0 0 10px; color: #71767b; font-size: 13px; line-height: 1.45; }
    #x-rfd-panel textarea {
      width: 100%;
      min-height: 88px;
      box-sizing: border-box;
      border-radius: 10px;
      border: 1px solid #2f3336;
      background: #16181c;
      color: #e7e9ea;
      padding: 10px 12px;
      font-size: 14px;
      resize: vertical;
    }
    #x-rfd-panel label { display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; font-size: 13px; color: #e7e9ea; }
    #x-rfd-panel .x-rfd-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    #x-rfd-panel button {
      cursor: pointer;
      border-radius: 9999px;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 14px;
      border: none;
    }
    #x-rfd-panel .x-rfd-primary { background: #1d9bf0; color: #fff; }
    #x-rfd-panel .x-rfd-primary:disabled { opacity: 0.45; cursor: not-allowed; }
    #x-rfd-panel .x-rfd-danger { background: #f4212e; color: #fff; }
    #x-rfd-panel .x-rfd-ghost { background: transparent; color: #e7e9ea; border: 1px solid #536471; }
    #x-rfd-log {
      margin-top: 12px;
      padding: 10px;
      border-radius: 10px;
      background: #16181c;
      border: 1px solid #2f3336;
      font-size: 12px;
      color: #cbd5e1;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #x-rfd-fab {
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 999997;
      background: #1d9bf0;
      color: #fff;
      border: none;
      border-radius: 9999px;
      padding: 12px 16px;
      font-weight: 800;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
    }
  `;

  GM_addStyle(STYLE);

  /** @returns {{ user: string } | null} */
  function parseProfileWithReplies() {
    const m = /^\/([^/]+)\/with_replies/.exec(location.pathname || '');
    if (!m) return null;
    return { user: decodeURIComponent(m[1]).toLowerCase() };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Normalize X href segment to screen name */
  function hrefToScreen(href) {
    if (!href || typeof href !== 'string') return '';
    try {
      const u = new URL(href, location.origin);
      const seg = u.pathname.split('/').filter(Boolean)[0] || '';
      return decodeURIComponent(seg).toLowerCase();
    } catch {
      return '';
    }
  }

  /** First timeline author link inside tweet article */
  function articleAuthorScreen(article) {
    const userNameRoot = article.querySelector('[data-testid="User-Name"]');
    if (userNameRoot) {
      const a = userNameRoot.querySelector('a[href^="/"]');
      const s = hrefToScreen(a && a.getAttribute('href'));
      if (s) return s;
    }
    const links = article.querySelectorAll('a[href^="/"]');
    for (const a of links) {
      const h = a.getAttribute('href') || '';
      if (/^\/[^/]+\/status\//.test(h)) continue;
      const s = hrefToScreen(h);
      if (s && !['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'compose'].includes(s))
        return s;
    }
    return '';
  }

  /**
   * All human-visible copy in this tweet/reply card used for filter matching:
   * reply line, every tweetText (main + quote), cards, poll-ish blocks, image alts,
   * plus a toolbar-stripped clone so odd layouts still contribute.
   */
  function tweetSearchableText(article) {
    const chunks = [];
    const add = (s) => {
      const t = (s && String(s).replace(/\s+/g, ' ').trim()) || '';
      if (t) chunks.push(t);
    };

    for (const el of article.querySelectorAll('[data-testid="socialContext"]')) add(el.innerText);

    for (const el of article.querySelectorAll('[data-testid="tweetText"]')) add(el.innerText);

    const extraTestIds = [
      'card.wrapper',
      'card.layout',
      'unifiedCard',
      'quoteTweet',
      'tweetPhoto',
      'pollText',
      'pollChoice',
      'app-text',
      'tweet-text-show-more', // “Show more” expanded area when present
    ];
    for (const id of extraTestIds) {
      for (const el of article.querySelectorAll(`[data-testid="${id}"]`)) add(el.innerText);
    }

    for (const img of article.querySelectorAll('img[alt]')) {
      const alt = img.getAttribute('alt') || '';
      if (alt.trim().length > 1 && !/^https?:\/\//i.test(alt.trim())) add(alt);
    }

    for (const el of article.querySelectorAll('[aria-label]')) {
      const al = (el.getAttribute('aria-label') || '').trim();
      if (al.length < 10 || al.length > 900) continue;
      if (/^(more|menu|close|play|mute|share|gif|video)\b/i.test(al)) continue;
      add(al);
    }

    try {
      const c = article.cloneNode(true);
      for (const n of c.querySelectorAll(
        '[role="group"], button[data-testid="caret"], [data-testid="reply"], [data-testid="retweet"], ' +
          '[data-testid="like"], [data-testid="bookmark"], [data-testid="share"], [data-testid="socialShare"]'
      )) {
        n.remove();
      }
      add(c.innerText);
    } catch (_) {}

    return chunks.join('\n');
  }

  /** Short line for logs (prefers primary tweet body). */
  function tweetPreviewText(article) {
    const primary = article.querySelector('[data-testid="tweetText"]');
    if (primary && primary.innerText && primary.innerText.trim()) {
      return primary.innerText.trim().slice(0, 120).replace(/\s+/g, ' ');
    }
    const full = tweetSearchableText(article);
    return full.slice(0, 120).replace(/\s+/g, ' ');
  }

  /** All visible / announced copy under socialContext (X splits text across nodes). */
  function socialContextFullText(ctx) {
    if (!ctx) return '';
    const parts = [];
    try {
      parts.push(ctx.innerText || '');
      parts.push(ctx.getAttribute('aria-label') || '');
      for (const el of ctx.querySelectorAll('[aria-label]')) {
        parts.push(el.getAttribute('aria-label') || '');
      }
    } catch (_) {}
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function hasQuotedTweetEmbed(article) {
    return !!article.querySelector('[data-testid="quoteTweet"]');
  }

  /**
   * True if this card is a reply (conversation reply), not a standalone post.
   * X changes copy and DOM often; we use socialContext text + aria + a small URL heuristic.
   */
  function isReplyTweet(article) {
    const ctx = article.querySelector('[data-testid="socialContext"]');
    const raw = socialContextFullText(ctx);
    const t = raw.toLowerCase();

    // Not a reply: repost / follow / topic / ads-style context (unless it also says reply)
    if (t) {
      const looksRepost = /\breposted\b|\byou reposted\b|\brepost\b/i.test(raw);
      const looksReplyLine =
        /\b(replying to|in reply to|in response to|reply to|replying)\b/i.test(raw) ||
        /\b(en réponse à|réponse à|respondiendo a|respondiendo|contestando a|antwort an|答覆|返信|답글)\b/i.test(
          raw
        );
      if (looksRepost && !looksReplyLine) return false;
      if (
        /\b(following|subscribed|subscriber|community|pinned|promoted|ad\b|topic ·|live on)/i.test(t) &&
        !looksReplyLine
      )
        return false;
      if (looksReplyLine) return true;
    }

    // Fallback: reply cards often reference another status id (parent) while quote cards
    // use [data-testid="quoteTweet"] (exclude those).
    if (hasQuotedTweetEmbed(article)) return false;

    const myId = statusIdFromArticle(article);
    if (!myId) return false;
    const idSet = new Set();
    for (const a of article.querySelectorAll('a[href*="/status/"]')) {
      const m = /\/status\/(\d+)/.exec(a.getAttribute('href') || '');
      if (m) idSet.add(m[1]);
    }
    if (idSet.size >= 2 && [...idSet].some((id) => id !== myId)) {
      if (ctx && /\bquote\b/i.test(raw)) return false;
      return true;
    }

    return false;
  }

  function parseKeywords(raw) {
    return raw
      .split(/[\n,]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function matchesAnyKeyword(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some((k) => lower.includes(k.toLowerCase()));
  }

  /** Numeric status id from a tweet article (best-effort). */
  function statusIdFromArticle(article) {
    const as = article.querySelectorAll('a[href*="/status/"]');
    for (const a of as) {
      const m = /\/status\/(\d+)/.exec(a.getAttribute('href') || '');
      if (m) return m[1];
    }
    return null;
  }

  /** Main column scroll container (X virtualizes inside this). */
  function findTimelineScrollRoot() {
    const col =
      document.querySelector('[data-testid="primaryColumn"]') ||
      document.querySelector('main[role="main"]');
    if (!col) return document.scrollingElement || document.documentElement;

    let best = null;
    let bestArea = 0;
    for (const el of col.querySelectorAll('*')) {
      const cs = window.getComputedStyle(el);
      const oy = cs.overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
      if (el.scrollHeight <= el.clientHeight + 80) continue;
      const area = el.clientWidth * el.clientHeight;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best || document.scrollingElement || document.documentElement;
  }

  /**
   * Scroll toward the bottom until no new tweet IDs appear for several rounds
   * (end of history or rate limit). Collects unique IDs for logging.
   */
  async function scrollTimelineUntilStable(log, {
    settleMs = 600,
    stableNeed = 14,
    maxRounds = 8000,
  } = {}) {
    const el = findTimelineScrollRoot();
    const seen = new Set();
    let stable = 0;

    function ingestNewCount() {
      let fresh = 0;
      for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
        const id = statusIdFromArticle(article);
        if (!id) continue;
        if (!seen.has(id)) {
          seen.add(id);
          fresh++;
        }
      }
      return fresh;
    }

    ingestNewCount();
    log(`Timeline loader: scroll root = ${el.tagName.toLowerCase()}#${el.id || '(no id)'}`);

    for (let round = 0; round < maxRounds; round++) {
      const h0 = el.scrollHeight;
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      await sleep(settleMs);

      const fresh = ingestNewCount();
      const h1 = el.scrollHeight;
      const grew = h1 > h0 + 12;

      if (fresh === 0 && !grew) stable++;
      else stable = 0;

      if (round % 8 === 0 || fresh > 0) {
        log(`… loading · ${seen.size} unique tweets seen · streak ${stable}/${stableNeed}`);
      }

      if (stable >= stableNeed) {
        log(`End of timeline (no new tweets). Unique IDs seen while scrolling: ${seen.size}`);
        return { el, seen };
      }
    }

    log(`Loader stopped after ${maxRounds} rounds (safety cap). Unique IDs seen: ${seen.size}`);
    return { el, seen };
  }

  /**
   * From top to bottom: delete visible matches, advance viewport. Repeats until
   * several rounds with no deletions and no scroll growth (handles virtualization).
   */
  async function sweepDeleteTopToBottom(el, collectNextMatch, log, {
    stepFraction = 0.72,
    settleMs = 450,
    idleNeed = 8,
    maxSteps = 12000,
  } = {}) {
    el.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(Math.max(settleMs, 700));

    let idle = 0;
    for (let step = 0; step < maxSteps; step++) {
      let deletedThisRound = 0;
      for (;;) {
        const next = collectNextMatch();
        if (!next) break;
        log(`Deleting: ${next.preview}…`);
        try {
          await deleteOneTweetArticle(next.article);
          deletedThisRound++;
          log('  → OK');
        } catch (e) {
          try {
            next.article.dataset.xRfdSkip = '1';
          } catch (_) {}
          log('  → FAIL: ' + (e && e.message ? e.message : String(e)));
        }
        await sleep(1150);
      }

      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const prevTop = el.scrollTop;
      const prevH = el.scrollHeight;

      const delta = Math.max(260, el.clientHeight * stepFraction);
      const nextTop = Math.min(maxTop, el.scrollTop + delta);
      el.scrollTo({ top: nextTop, behavior: 'instant' });
      await sleep(settleMs);

      const advanced = el.scrollTop > prevTop + 4 || el.scrollHeight > prevH + 10;

      if (deletedThisRound > 0 || advanced) {
        idle = 0;
      } else {
        idle++;
        log(`… sweep idle ${idle}/${idleNeed} (no deletes, no new scroll area)`);
        if (idle >= idleNeed) {
          log('Sweep finished (nothing left to process in this pass).');
          return;
        }
      }

      if (step > 0 && step % 160 === 0) {
        log(`… still sweeping (step ${step}). Large accounts can take a long time.`);
      }
    }
    log('Sweep stopped: maxSteps safety cap.');
  }

  async function waitFor(fn, { timeoutMs = 8000, intervalMs = 80 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(intervalMs);
    }
    return null;
  }

  /** Visible menuitems with text Delete */
  function findDeleteMenuItem() {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    return (
      items.find((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        return (el.innerText || '').trim() === 'Delete';
      }) || null
    );
  }

  /** Confirmation sheet Delete */
  function findConfirmDeleteControl() {
    const byTest = document.querySelector('[data-testid="confirmationSheetConfirm"]');
    if (byTest) return byTest;

    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
    for (const d of dialogs) {
      const r = d.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) continue;
      const btns = [...d.querySelectorAll('button, [role="button"]')];
      const hit = btns.find((b) => /^\s*delete\s*$/i.test((b.innerText || '').trim()));
      if (hit) return hit;
    }
    return null;
  }

  async function deleteOneTweetArticle(article) {
    const caret = article.querySelector('button[data-testid="caret"]');
    if (!caret) throw new Error('No “More” (caret) button on this tweet.');

    caret.click();
    const delItem = await waitFor(findDeleteMenuItem, { timeoutMs: 6000 });
    if (!delItem) throw new Error('Delete menu item did not appear.');

    delItem.click();
    await sleep(200);

    const confirm = await waitFor(findConfirmDeleteControl, { timeoutMs: 8000 });
    if (confirm) {
      confirm.click();
      await sleep(400);
    }

    // Close stray menus (Escape)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(250);
  }

  function buildUi() {
    const fab = document.createElement('button');
    fab.id = 'x-rfd-fab';
    fab.type = 'button';
    fab.textContent = 'X Post & Reply Deleter';

    const backdrop = document.createElement('div');
    backdrop.id = 'x-rfd-backdrop';

    const panel = document.createElement('div');
    panel.id = 'x-rfd-panel';
    panel.innerHTML = `
      <h2>X Post & Reply Deleter</h2>
      <p>
        On <code>with_replies</code>, the script first <strong>scrolls to the end of the timeline</strong>, then
        <strong>sweeps top → bottom</strong> and deletes when <strong>any</strong> filter word/phrase appears in the
        <strong>whole post card</strong>: your text, “Replying to…”, quoted tweet, link/card blurbs, image
        descriptions, etc. (comma or newline separated). Only <strong id="x-rfd-who"></strong> is targeted.
      </p>
      <textarea id="x-rfd-filter" placeholder="e.g. spam, giveaway, check my bio"></textarea>
      <label><input type="checkbox" id="x-rfd-replies-only" /> Only replies (conversation replies, not standalone posts)</label>
      <div class="x-rfd-row">
        <button type="button" class="x-rfd-ghost" id="x-rfd-load">Load full timeline</button>
        <button type="button" class="x-rfd-primary" id="x-rfd-run">Delete matching (full profile)</button>
        <button type="button" class="x-rfd-ghost" id="x-rfd-close">Close</button>
      </div>
      <div id="x-rfd-log" aria-live="polite"></div>
    `;

    backdrop.appendChild(panel);
    document.documentElement.appendChild(backdrop);
    document.documentElement.appendChild(fab);

    const who = panel.querySelector('#x-rfd-who');
    const filterEl = panel.querySelector('#x-rfd-filter');
    const repliesOnlyEl = panel.querySelector('#x-rfd-replies-only');
    const loadBtn = panel.querySelector('#x-rfd-load');
    const runBtn = panel.querySelector('#x-rfd-run');
    const closeBtn = panel.querySelector('#x-rfd-close');
    const logEl = panel.querySelector('#x-rfd-log');

    function log(line) {
      logEl.textContent += (logEl.textContent ? '\n' : '') + line;
      logEl.scrollTop = logEl.scrollHeight;
    }

    function openModal() {
      const ctx = parseProfileWithReplies();
      if (!ctx) {
        alert('Open a profile URL like x.com/YourName/with_replies first.');
        return;
      }
      who.textContent = '@' + ctx.user;
      logEl.textContent = '';
      backdrop.classList.add('x-rfd-open');
    }

    function closeModal() {
      backdrop.classList.remove('x-rfd-open');
    }

    fab.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    let busy = false;

    function setBusy(v) {
      busy = v;
      runBtn.disabled = v;
      loadBtn.disabled = v;
    }

    loadBtn.addEventListener('click', async () => {
      if (busy) return;
      const ctx = parseProfileWithReplies();
      if (!ctx) {
        alert('Not on a with_replies profile URL.');
        return;
      }
      logEl.textContent = '';
      setBusy(true);
      log('Loading entire timeline (scroll to end until stable)…');
      try {
        const { seen } = await scrollTimelineUntilStable(log, {});
        log(`Load-only done. Unique tweet IDs seen while scrolling: ${seen.size}`);
      } catch (e) {
        log('Load error: ' + (e && e.message ? e.message : String(e)));
      }
      setBusy(false);
    });

    runBtn.addEventListener('click', async () => {
      if (busy) return;
      const ctx = parseProfileWithReplies();
      if (!ctx) {
        alert('Not on a with_replies profile URL.');
        return;
      }

      const keywords = parseKeywords(filterEl.value || '');
      if (!keywords.length) {
        alert('Add at least one word or phrase in the filter box.');
        return;
      }

      if (!window.confirm(
        'This will permanently delete matching tweets from your account.\n\n' +
        'The script will scroll to load the full timeline (as far as X allows), then sweep and delete.\n\nContinue?'
      )) return;

      setBusy(true);
      logEl.textContent = '';
      log('Keywords: ' + JSON.stringify(keywords));

      function collectNextMatch() {
        const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
        for (const article of articles) {
          if (article.dataset.xRfdSkip === '1') continue;
          const author = articleAuthorScreen(article);
          if (author !== ctx.user) continue;
          if (repliesOnlyEl.checked && !isReplyTweet(article)) continue;
          const text = tweetSearchableText(article);
          if (!matchesAnyKeyword(text, keywords)) continue;
          return { article, preview: tweetPreviewText(article) };
        }
        return null;
      }

      try {
        log('Phase 1: scroll to end until no new tweets load…');
        const { el, seen } = await scrollTimelineUntilStable(log, {});
        log(`Phase 1 done. Unique tweets seen while loading: ${seen.size}`);

        log('Phase 2: top → bottom sweep, deleting visible matches…');
        await sweepDeleteTopToBottom(el, collectNextMatch, log, {});
        log('All phases finished.');
      } catch (e) {
        log('Run error: ' + (e && e.message ? e.message : String(e)));
      }

      setBusy(false);
    });

    return { openModal, closeModal };
  }

  function teardownUi() {
    document.getElementById('x-rfd-fab')?.remove();
    document.getElementById('x-rfd-backdrop')?.remove();
  }

  function hookHistory(fn) {
    const w = window;
    const fire = () => {
      try {
        fn();
      } catch (_) {}
    };
    w.addEventListener('popstate', fire);
    const wrap = (k) => {
      const orig = history[k];
      if (typeof orig !== 'function') return;
      history[k] = function () {
        const ret = orig.apply(this, arguments);
        fire();
        return ret;
      };
    };
    wrap('pushState');
    wrap('replaceState');
  }

  function onLocationChange() {
    if (window.top !== window.self) return;
    if (!parseProfileWithReplies()) {
      teardownUi();
      return;
    }
    if (document.getElementById('x-rfd-fab')) return;
    const ui = buildUi();
    setTimeout(() => {
      try {
        ui.openModal();
      } catch (_) {}
    }, 900);
  }

  onLocationChange();
  hookHistory(onLocationChange);
})();
