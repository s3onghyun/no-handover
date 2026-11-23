// Link-preview image (og:image / twitter:image): public/og-image.png, 1200×630, drawn by the same
// canvas renderer as the shareable result card (src/ui/resultcard.ts) in headless Chromium.
// The text is the game's description, not a play record: no stats are invented.
//
//   node scripts/og-image.mjs            (rewrites public/og-image.png; commit it)

import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/og-image.png');

/** A ResultCard (src/engine/record.ts) describing the game. */
const CARD = {
  game: 'No Handover',
  gameKo: '인수인계 없음',
  caseLabel: '브라우저 추리 게임',
  caseTitle: '퇴사한 선배의 PC로',
  headline: '서버 장애의 원인을 찾는다',
  stats: [
    { label: '사건', value: '4개' },
    { label: '가입', value: '없음' },
    { label: '언어', value: '한국어' },
  ],
  badge: null,
  mode: null,
  footer: 'no-handover.vercel.app',
};

const server = await createServer({ root, server: { port: 0 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  const dataUrl = await page.evaluate(async (card) => {
    const { drawResultCard } = await import('/src/ui/resultcard.ts');
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    drawResultCard(canvas, card);
    return canvas.toDataURL('image/png');
  }, CARD);
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(out, png);
  console.log(`wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
  await server.close();
}
