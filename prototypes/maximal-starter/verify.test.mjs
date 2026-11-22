import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(match => match[1]);
const slugs = ['stnkqlzr', 'summer-two-six-ep', 'from-now-on', 'u-with-me', 'ultimate-lie'];
const albumFiles = slugs.map(slug => readFileSync(new URL('./albums/' + slug + '.html', import.meta.url), 'utf8'));
const mysteryPage = readFileSync(new URL('./albums/unreleased.html', import.meta.url), 'utf8');

test('all homepage scripts parse and the loader boot sequence stays before body', () => {
  assert.equal(scripts.length, 4);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new Script(source), 'script ' + (index + 1)));
  assert.match(scripts[0], /document\.documentElement\.classList\.add\('booting'\)/);
  assert.ok(html.indexOf(scripts[0]) < html.indexOf('<body>'));
});

test('the five homepage release cards route to native album files, never Untitled', () => {
  const cards = [...html.matchAll(/<article class="release r[1-5]"[\s\S]*?<\/article>/g)].map(match => match[0]);
  assert.equal(cards.length, 5);
  assert.doesNotMatch(html, /untitled\.stream/);
  assert.match(html, /open a release file/);
  for (const [i, card] of cards.entries()) {
    assert.match(card, new RegExp('href="albums\/' + slugs[i] + '\.html"'));
    assert.match(card, /<img[^>]+src="assets\/covers\//);
    assert.match(card, /alt="[^"]+ album cover"/);
  }
});

test('the mosh, blob and atmospheric illumination systems remain independently controllable', () => {
  assert.equal((html.match(/data-fx-toggle=/g) || []).length, 3);
  for (const key of ['mosh', 'blob', 'beam']) assert.match(html, new RegExp('data-fx-toggle="' + key + '" aria-pressed="true"'));
  assert.match(html, /id="flashlight"/);
  assert.match(html, /id="blobTracker"/);
  assert.match(scripts[1], /mosh-a/);
  assert.match(scripts[1], /mosh-b/);
  assert.match(html, /world-planet/);
  assert.match(html, /world-horizon/);
});

test('cover hover chooses data mosh or photism with an even 50/50 split', () => {
  assert.match(scripts[1], /Math\.random\(\)<\.5/);
  assert.match(scripts[1], /dataset\.hoverVisual/);
  assert.match(scripts[1], /is-photism/);
  assert.match(scripts[1], /photism-layer/);
  assert.match(html, /@keyframes photism-exposure/);
  assert.match(html, /--photo-dx/);
  assert.match(html, /--photo-hue/);
});

test('floating phrases use measured free space and collision buffers', () => {
  assert.match(scripts[3], /function installDriftField/);
  assert.match(scripts[3], /getBoundingClientRect/);
  assert.match(scripts[3], /const intersects=/);
  assert.match(scripts[3], /obstacles\.some\(o=>intersects\(box,o\)\)/);
  assert.match(scripts[3], /placed\.some\(o=>intersects\(box,o\)\)/);
  assert.match(scripts[3], /left:r\.left-17/);
  assert.match(scripts[3], /right:r\.right\+17/);
  assert.match(scripts[3], /\.kicker/);
  assert.match(html, /drift-float[\s\S]{0,140}translate3d\(var\(--drift-x,0px\),-8px,0\)/);
  assert.match(scripts[3], /--drift-x/);
  for (const page of albumFiles) {
    const pageScripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(pageScripts.length, 2);
    pageScripts.forEach(source => assert.doesNotThrow(() => new Script(source)));
    assert.match(pageScripts[1], /const intersects=/);
    assert.match(pageScripts[1], /Math\.random\(\)<\.5/);
    assert.match(pageScripts[1], /profileIndex/);
    assert.match(pageScripts[1], /profile\.duration/);
    assert.match(page, /cover-photism/);
    assert.match(page, /cover-mosh-layer/);
  }
  const mysteryScripts = [...mysteryPage.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  mysteryScripts.forEach(source => assert.doesNotThrow(() => new Script(source)));
  assert.match(mysteryScripts[1], /const intersects=/);
  assert.match(mysteryScripts[0], /pointerleave/);
  assert.doesNotMatch(mysteryPage, /#beam\\{[^}]*opacity:0!important/);
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

test('the unreleased mystery album has a native placeholder page and ten interactions', () => {
  assert.match(html, /href="albums\/unreleased\.html"/);
  assert.match(mysteryPage, /<h1>\?\?\?<\/h1>/);
  assert.equal((mysteryPage.match(/data-action="/g) || []).length, 10);
  assert.match(mysteryPage, /track count unknown/);
  assert.doesNotMatch(mysteryPage, /untitled\.stream/);
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

test('interactive controls use eased transitions without blanket transition-all', () => {
  const allPages = [html, ...albumFiles, mysteryPage].join('\\n');
  assert.match(allPages, /transition-property:color,background-color,border-color,box-shadow,transform,opacity,filter/);
  assert.doesNotMatch(allPages, /transition:\s*all/i);
});

test('all prototype pages use hyphens rather than em dashes', () => {
  assert.doesNotMatch([html, ...albumFiles, mysteryPage].join('\n'), /\u2014/);
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
  const mysteryCss = [...mysteryPage.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  assert.equal(mysteryCss.length, 1);
  assert.equal((mysteryCss[0].match(/\{/g) || []).length, (mysteryCss[0].match(/\}/g) || []).length, 'mystery page');
});
