// Link previews: index.html carries Open Graph and Twitter card tags, and the image they point at
// ships in public/ at 1200×630 (scripts/og-image.mjs renders it with the result-card renderer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const meta = (attr: 'property' | 'name', key: string) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];
const SITE = 'https://no-handover.vercel.app/';

test('og meta: title, description, url, type, image and twitter card are set', () => {
  const description = meta('name', 'description');
  assert.ok(description && !description.includes('프로토타입'), description);
  assert.equal(meta('property', 'og:description'), description);
  assert.equal(meta('name', 'twitter:description'), description);
  assert.equal(meta('property', 'og:type'), 'website');
  assert.equal(meta('property', 'og:url'), SITE);
  assert.ok(meta('property', 'og:title'));
  assert.equal(meta('name', 'twitter:title'), meta('property', 'og:title'));
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta('property', 'og:image'), `${SITE}og-image.png`);
  assert.equal(meta('name', 'twitter:image'), `${SITE}og-image.png`);
});

test('og meta: the image ships in public/ as a 1200×630 PNG under 300 KB', () => {
  const png = readFileSync(new URL('../public/og-image.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.ok(png.length < 300 * 1024, `${png.length} bytes`);
});
