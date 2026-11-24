# Assets / 에셋

코드와 문서는 [MIT](LICENSE)입니다. **아래 폴더의 목소리·음악·캐릭터 그림은 MIT에 포함되지 않습니다.**
The code and docs are [MIT](LICENSE). **The voices, music and character art in the folders below are not covered by the MIT license.**

## What they are / 무엇인가

All of them are AI-generated with Google Gemini, under the maintainer's Gemini account, and are included only to ship this game.
모두 메인테이너의 Gemini 계정으로 Google Gemini가 만든 AI 생성물이며, 이 게임에 쓰려고 넣었습니다.

| Folder | What | Generated with | Details |
|---|---|---|---|
| `public/audio/voice/` | 186 colleague voice lines (`.ogg` + `.mp3` each) | Gemini text-to-speech: `voice.briefing-jihun` in the Gemini app (2026-11-17); every other line with the Gemini API TTS models (2026-11-20 to 11-24), voices Aoede, Puck and Kore | [`public/audio/audio-credits.md`](public/audio/audio-credits.md) |
| `public/audio/music/` | `amb.office`, `music.briefing`, `music.reveal`, `music.finale` | `amb.office`, `music.briefing`: Gemini music in the Gemini app (2026-11-17). `music.reveal`: Gemini API Lyria 3 Clip, `music.finale`: Gemini API Lyria 3.5 (2026-11-24) | [`public/audio/audio-credits.md`](public/audio/audio-credits.md) |
| `public/characters/` | 13 character images (avatars, full figures, `eunjae-workshop.webp`) | Gemini image generation; `eunjae-workshop.webp` with the Gemini API `gemini-3-pro-image` (2026-11-24) | README, section 캐릭터 아트 |

Every file records its generator, date, prompt source and post-processing (trim, loudness, crop, re-encode) in the linked notes. The images keep Google's SynthID watermark; the visible Gemini mark was cropped or covered.
파일마다 만든 도구, 날짜, 프롬프트 출처, 후처리(자르기, 라우드니스, 크롭, 재인코딩)가 위 문서에 적혀 있습니다. 그림에는 Google의 SynthID 워터마크가 그대로 남아 있고, 눈에 보이는 Gemini 표시는 잘라 내거나 덮었습니다.

## Terms / 이용 조건

- Their use follows Google's terms for the service that produced them: the [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) for API output, and Google's Terms of Service and Generative AI Prohibited Use Policy for the Gemini app. The MIT license of this repository does not grant anything for these files.
  이 파일들의 이용은 만든 서비스의 Google 약관을 따릅니다(API 출력은 [Gemini API 추가 서비스 약관](https://ai.google.dev/gemini-api/terms), Gemini 앱 출력은 Google 서비스 약관과 생성형 AI 금지 사용 정책). 이 저장소의 MIT 라이선스는 이 파일들에 아무 권리도 주지 않습니다.
- The maintainer has not checked the commercial-use conditions for them. Before reusing them elsewhere, read Google's current terms yourself.
  메인테이너는 이 파일들의 상업적 이용 조건을 확인하지 않았습니다. 다른 곳에 다시 쓰려면 Google의 현재 약관을 직접 확인하세요.
- Contributors do not add generated voice, music or art files directly; see [CONTRIBUTING.md](CONTRIBUTING.md).
  기여자는 생성한 목소리·음악·그림 파일을 직접 넣지 않습니다. [CONTRIBUTING.md](CONTRIBUTING.md)를 보세요.

## Not AI-generated / AI 생성이 아닌 것

- UI sound effects are synthesized in the browser by [ZzFX](https://github.com/KilledByAPixel/ZzFX) 1.4.0 (MIT, Copyright (c) 2019 Frank Force), vendored in `src/audio/vendor/zzfx.ts`; the office room tone fallback is synthesized by `src/audio/roomtone.ts`. No audio files.
- `public/og-image.png` is drawn by `scripts/og-image.mjs` with the game's own result-card renderer (text only) and is MIT like the code.
