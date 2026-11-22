import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(match => match[1]);

test('inline scripts parse and boot sequence runs before the page body', () => {
  assert.equal(scripts.length, 3);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new Script(source), 'script ' + (index + 1)));
  assert.match(scripts[0], /document\.documentElement\.classList\.add\('booting'\)/);
  assert.ok(html.indexOf(scripts[0]) < html.indexOf('<body>'));
});

test('maximal collage keeps the five real release destinations and artwork', () => {
  const cards = [...html.matchAll(/<article class="release r[1-5]"[\s\S]*?<\/article>/g)].map(match => match[0]);
  assert.equal(cards.length, 5);
  for (const card of cards) {
    assert.match(card, /href="https:\/\/untitled\.stream\/library\/project\//);
    assert.match(card, /target="_blank"/);
    assert.match(card, /rel="noopener noreferrer"/);
    assert.match(card, /<img src="data:image\/(?:jpeg|png);base64,/);
    assert.match(card, /alt="[^"]+ album cover"/);
  }
});

test('the three visual systems have independent, accessible controls', () => {
  assert.equal((html.match(/data-fx-toggle=/g) || []).length, 3);
  for (const key of ['mosh', 'blob', 'beam']) {
    assert.match(html, new RegExp('data-fx-toggle="' + key + '" aria-pressed="true"'));
    assert.match(html, new RegExp('data-' + key + '=(?:\\'on\\'|"on")'));
  }
  assert.match(html, /id="flashlight"/);
  assert.match(html, /id="blobTracker"/);
  assert.match(html, /mosh-layer mosh-a/);
  assert.match(html, /mosh-layer mosh-b/);
  assert.match(scripts[1], /themeButton\.addEventListener/);
  assert.equal((scripts[1].match(/themeButton\.addEventListener/g) || []).length, 1);
});

test('the old marquee and album ornament demo markup is removed', () => {
  assert.doesNotMatch(html, /<div class="tape"/);
  assert.doesNotMatch(html, /<span class="art-ornament/);
  assert.doesNotMatch(html, /<span class="art-type"/);
  assert.doesNotMatch(html, /class="cursor-light"/);
});

test('reduced-motion users do not get forced into animated effects', () => {
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(scripts[1], /if\(reduced\)[\s\S]*?b\.disabled=true/);
  assert.match(scripts[1], /root\.dataset\.mosh='off'/);
});

test('loader preserves the five-second minimum and waits for all preload tasks', () => {
  assert.match(scripts[2], /minimumDisplay=5000/);
  assert.match(scripts[2], /img\.decode\(\)/);
  assert.match(scripts[2], /document\.fonts\.ready/);
  assert.match(scripts[2], /Promise\.allSettled/);
  assert.match(scripts[2], /Promise\.all\(\[allPreloads,minimumTime\]\)/);
});

test('all authored CSS blocks have balanced braces', () => {
  for (const [index, css] of styles.entries()) {
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'style block ' + (index + 1));
  }
});
