/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */

/*
|--------------------------------------------------------------------------
| Bad-word filter
|
| House rule: the owner can swear, nobody else can. chat.js runs everyone
| else's messages, edits, profiles and channel names through censor(),
| which keeps the first letter and stars the rest ("f***").
|
| Each whitespace-separated word is normalized before matching: lowercased,
| leetspeak undone (5h1t, @ss, $hit), and punctuation inside the word
| dropped (f.u.c.k, sh-it). Stretched letters still match (fuuuck), and a
| "*" can stand in for any letter but the first (f*ck, sh**). Letters
| typed one per word ("f u c k") are joined and checked too.
|
| Three kinds of entries, so ordinary words survive (class, Scunthorpe,
| cocktail, grape, therapist, raccoon):
|   CONTAINS - distinctive enough to catch anywhere in a word (bullshit)
|   PREFIX   - only at the start of a word (wanker, porno)
|   EXACT    - the whole word only (ass, but not assess)
|--------------------------------------------------------------------------
*/

const CONTAINS = [
  "fuck", "fvck", "phuck", "motherf", "shit", "bitch", "cunt", "whore", "slut", "twat",
  "nigger", "nigga", "faggot", "bastard", "asshole", "dickhead", "cocksucker", "douchebag",
];

const PREFIX = ["wank", "porn", "jizz", "dildo"];

const EXACT = [
  "ass", "asses", "arse", "arses", "jackass", "dumbass", "fatass", "smartass", "badass", "asshat",
  "dick", "dicks", "cock", "cocks", "cum", "cumming", "cumshot", "tits", "titty", "titties",
  "pussy", "pussies", "piss", "pissed", "pissing", "prick", "pricks", "douche", "bollocks",
  "hoe", "hoes", "thot", "thots", "rape", "raped", "raping", "rapist",
  "fag", "fags", "faggy", "retard", "retards", "retarded", "spic", "spics", "chink", "chinks",
  "dyke", "dykes", "kike", "kikes", "coon", "coons", "tranny", "trannies",
  "wtf", "stfu", "gtfo", "mf", "mfs", "mfer",
];

// real words that happen to contain a CONTAINS entry
const ALLOW = new Set([
  "scunthorpe", "shiitake", "shitake", "shitzu", "shihtzu", "mishit", "mishits",
  "snigger", "sniggered", "sniggering", "assess", "bastardize", "bastardized", "bastardise", "bastardised",
]);

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", "@": "a", $: "s", "!": "i", "|": "i", "€": "e", "+": "t" };

/* "fuck" -> /f+(?:u|\*)+(?:c|\*)+(?:k|\*)+/ : stretched letters, stars after the first */
function pattern(word) {
  return word
    .split("")
    .map((c, i) => (i === 0 ? `${c}+` : `(?:${c}|\\*)+`))
    .join("");
}

const RE_CONTAINS = new RegExp(`(?:${CONTAINS.map(pattern).join("|")})`);
const RE_PREFIX = new RegExp(`^(?:${PREFIX.map(pattern).join("|")})`);
const RE_EXACT = new RegExp(`^(?:${EXACT.map(pattern).join("|")})$`);

function normalize(core) {
  let out = "";
  for (const ch of core.toLowerCase()) {
    const c = LEET[ch] ?? ch;
    if (/\p{L}/u.test(c) || c === "*") out += c;
  }
  return out;
}

function isBad(core) {
  if (/^[a-z][a-z0-9+.-]*:\/\/|^www\./i.test(core)) return false; // leave links alone
  const n = normalize(core);
  if (n.length < 2 || !/[a-z]/.test(n) || ALLOW.has(n) || ALLOW.has(n.replace(/s$/, ""))) return false;
  return RE_CONTAINS.test(n) || RE_PREFIX.test(n) || RE_EXACT.test(n);
}

function star(core, keepFirst = true) {
  let first = keepFirst;
  return core.replace(/[\p{L}\p{N}@$!|€*+]/gu, (c) => {
    if (first) {
      first = false;
      return /\p{L}/u.test(c) ? c : "*";
    }
    return "*";
  });
}

/* Returns { text, hit } with bad words starred out. */
export function censor(input) {
  const text = String(input ?? "");
  // split into words and the whitespace between them, keeping both
  const parts = text.split(/(\s+)/);

  const words = []; // { i, core, lead, trail }
  for (let i = 0; i < parts.length; i += 2) {
    const w = parts[i];
    if (!w) continue;
    const lead = w.match(/^[\s.,;:?"'()[\]{}<>~`_\-–—…]+/)?.[0] || "";
    const trail = w.slice(lead.length).match(/[\s.,;:?!"'()[\]{}<>~`_\-–—…]+$/)?.[0] || "";
    const core = w.slice(lead.length, w.length - trail.length);
    words.push({ i, core, lead, trail });
  }

  const bad = new Map(); // word index -> keep its first letter?
  for (const w of words) if (w.core && isBad(w.core)) bad.set(w.i, true);

  // "f u c k": a run of single-letter words, joined
  for (let a = 0; a < words.length; ) {
    let b = a;
    while (b < words.length && normalize(words[b].core).length === 1) b++;
    if (b - a >= 3) {
      const joined = words.slice(a, b).map((w) => normalize(w.core)).join("");
      if (RE_CONTAINS.test(joined) || RE_EXACT.test(joined)) for (let k = a; k < b; k++) bad.set(words[k].i, k === a);
    }
    a = Math.max(b, a + 1);
  }

  if (!bad.size) return { text, hit: false };
  for (const w of words) if (bad.has(w.i)) parts[w.i] = w.lead + star(w.core, bad.get(w.i)) + w.trail;
  const out = parts.join("");
  // already-starred words ("f***") match too, but that changes nothing
  return { text: out, hit: out !== text };
}

export function hasBadWords(input) {
  return censor(input).hit;
}
