// Shareable result card (web-escape analysis §9 item 14): a 1200×630 PNG drawn on a canvas in the
// browser — game title, case, time, commands, hint steps and the "힌트 단계 0" badge. No cause, no
// answers, no clue text (the model in src/engine/record.ts is the only input).

import type { ResultCard } from '../engine/record.ts';

export const CARD_W = 1200;
export const CARD_H = 630;
const SANS = "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', system-ui, sans-serif";

export function drawResultCard(canvas: HTMLCanvasElement, card: ResultCard): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const c = canvas.getContext('2d');
  if (!c) return;
  // paper background, a dark band on the left like the desktop's taskbar
  c.fillStyle = '#f4f2ec';
  c.fillRect(0, 0, CARD_W, CARD_H);
  c.fillStyle = '#23262b';
  c.fillRect(0, 0, 28, CARD_H);
  c.fillStyle = '#f2d94e';
  c.fillRect(28, 0, 8, CARD_H);
  // the empty chair from the wallpaper, faint, bottom right
  c.save();
  c.translate(930, 300);
  c.strokeStyle = 'rgba(160, 140, 105, 0.35)';
  c.lineWidth = 9;
  c.lineCap = 'round';
  const chair: [number, number, number, number][] = [
    [50, 20, 50, 150], [150, 20, 150, 150], [50, 40, 150, 40], [50, 75, 150, 75], [38, 150, 162, 150],
    [50, 150, 44, 250], [150, 150, 158, 250], [46, 205, 156, 205],
  ];
  for (const [x1, y1, x2, y2] of chair) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  c.restore();

  const x = 84;
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#5b6770';
  c.font = `600 30px ${SANS}`;
  c.fillText(`${card.game}  「${card.gameKo}」`, x, 96);
  c.fillStyle = '#8a8580';
  c.font = `500 26px ${SANS}`;
  c.fillText(card.caseLabel, x, 158);
  c.fillStyle = '#23262b';
  c.font = `700 52px ${SANS}`;
  c.fillText(fit(c, card.caseTitle, 760), x, 222);
  c.fillStyle = card.headline === '인수인계 완료' ? '#2f3e5c' : '#c8453a';
  c.font = `700 40px ${SANS}`;
  c.fillText(card.headline, x, 298);

  // stats row
  let sx = x;
  for (const s of card.stats) {
    const w = 190;
    roundRect(c, sx, 346, w - 18, 118, 14);
    c.fillStyle = '#ffffff';
    c.fill();
    c.strokeStyle = '#d9d5cc';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#8a8580';
    c.font = `500 22px ${SANS}`;
    c.fillText(s.label, sx + 20, 384);
    c.fillStyle = '#23262b';
    c.font = `700 34px ${SANS}`;
    c.fillText(fit(c, s.value, w - 50), sx + 20, 436);
    sx += w;
  }

  // badge
  if (card.badge) {
    c.save();
    c.translate(x + 4 * 190 + 30, 330);
    c.rotate(-0.12);
    c.font = `800 30px ${SANS}`;
    const bw = Math.max(200, Math.ceil(c.measureText(`💡 ${card.badge}`).width) + 44);
    roundRect(c, 0, 0, bw, 70, 35);
    c.fillStyle = '#f2d94e';
    c.fill();
    c.fillStyle = '#23262b';
    c.textAlign = 'center';
    c.fillText(`💡 ${card.badge}`, bw / 2, 46);
    c.restore();
  }
  if (card.mode) {
    c.fillStyle = '#6b7350';
    c.font = `600 22px ${SANS}`;
    c.fillText(card.mode, x, 512);
  }
  if (card.note) {
    c.fillStyle = '#2f3e5c';
    c.font = `400 20px ${SANS}`;
    c.fillText(fit(c, card.note, 1040), x, 542);
  }
  c.fillStyle = '#8a8580';
  c.font = `400 22px ${SANS}`;
  c.fillText(card.footer, x, 572);
}

function fit(c: CanvasRenderingContext2D, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && c.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Save the card as a PNG file (no upload anywhere). */
export function downloadResultCard(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
