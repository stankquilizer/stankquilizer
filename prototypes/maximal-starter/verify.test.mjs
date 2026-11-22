import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(match => match[1]);
const slugs = ['stnkqlzr', 'summer-two-six-ep', 'from-now-on', 'u-with-me', 'ultimate-lie'];
const albumFiles = slugs.map(slug => readFileSync(new URL('./albums/' + slug + '.html', import.meta.url), 'utf8'));

test('all homepage scripts parse and the loader boot sequence stays before body', () => {
  assert.equal(scripts.length, 4);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new Script(source), 'script ' + (index + 1)));
  assert.match(scripts[0], /document\.documentElement\.classList\.add\('booting'\)/);
  assert.ok(html.indexOf(scripts[0]) < html.indexOf('<body>'));
});

test('the five homepage release cards route to native album files, never Untitled', () => {
  const cards = [...html.matchAll(/<article class="release r[1-5]"[\s\S]*?<\/article>/g)].map(match => match[0]);
  assert.equal(cards.length, 5);
  assert.doesNotMatch(html, /untitled\.stream\/library\/project/);
  for (const [i, card] of cards.entries()) {
    assert.match(card, new RegExp('href="albums\/' + slugs[i] + '\.html"'));
    assert.match(card, /<img[^>]+src="assets\/covers\//);
    assert.match(card, /alt="[^"]+ album cover"/);
  }
});

test('the mosh, blob and flashlight systems remain independently controllable', () => {
  assert.equal((html.match(/data-fx-toggle=/g) || []).length, 3);
  for (const key of ['mosh', 'blob', 'beam']) assert.match(html, new RegExp('data-fx-toggle="' + key + '" aria-pressed="true"'));
  assert.match(html, /id="flashlight"/);
  assert.match(html, /id="blobTracker"/);
  assert.match(scripts[1], /mosh-a/);
  assert.match(scripts[1], /mosh-b/);
});

test('the experimental control room exposes 60 distinct systems', () => {
  assert.equal((html.match(/data-system="/g) || []).length, 60);
  assert.match(html, /id="active-count"/);
  assert.match(scripts[3], /function randomize/);
  assert.match(scripts[3], /function clear/);
  assert.match(scripts[3], /function save/);
  assert.match(scripts[3], /function restore/);
  for (const key of ['palette', 'theme', 'chaos', 'calm', 'random', 'reset', 'save', 'restore', 'copy', 'surprise']) {
    assert.match(html, new RegExp('data-system="' + key + '"'));
  }
});

test('each native album page has the correct number of numbered tracks and ten mechanics', () => {
  const expected = [12, 7, 8, 8, 8];
  albumFiles.forEach((page, i) => {
    assert.equal((page.match(/class="track" data-track=/g) || []).length, expected[i]);
    assert.equal((page.match(/data-tool="/g) || []).length, 10);
    assert.match(page, /data-fallback="data:image\//);
    assert.doesNotMatch(page, /untitled\.stream\/library\/project/);
    assert.match(page, /track title not yet synced/);
  });
});

test('known radio track titles are preserved without fabricating missing titles', () => {
  for (const title of ['i get high', "i feel like you're the only one", 'in the sunken place', 'zzz...', 'the seraphim', 'fake gifted', 'stankquilizer type beat', 'unimagineable probability', 'ignantamus', 'the chops', 'life of the loop', 'the earth i scar']) {
    assert.ok(albumFiles.some(page => page.includes('>' + title + '<')), 'missing title: ' + title);
  }
});

test('reduced motion remains respected and loader retains its minimum wait', () => {
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(scripts[2], /minimumDisplay=5000/);
  assert.match(scripts[2], /img\.decode\(\)/);
  assert.match(scripts[2], /document\.fonts\.ready/);
  assert.match(scripts[2], /Promise\.allSettled/);
});

test('all authored CSS blocks have balanced braces', () => {
  for (const [index, css] of styles.entries()) {
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'homepage style block ' + (index + 1));
  }
  for (const [i, page] of albumFiles.entries()) {
    const css = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
    assert.equal(css.length, 1);
    assert.equal((css[0].match(/\{/g) || []).length, (css[0].match(/\}/g) || []).length, 'album page ' + slugs[i]);
  }
});
