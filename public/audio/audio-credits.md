# No Handover — 음원 출처와 처리 기록 (audio credits)

> **프로토타입 전용.** 아래 음악·목소리는 캡틴의 Gemini 계정으로 2026-11-17에 만든 것이다.
> Gemini 앱으로 만든 음악·TTS 음성의 **상업적 이용 조건은 아직 확인하지 않았다.**
> 판매·유료 배포 전에 Google의 해당 시점 이용 약관을 확인하고, 필요하면 다시 만들거나 라이선스가 분명한 음원으로 바꾼다.

원본은 저장소에 넣지 않는다(저장소 밖 `data/infra-mystery-game/audio-in/`). 아래 파일은 모두 `scripts/audio-prepare.sh <원본 폴더>`로 원본에서 그대로 다시 만들 수 있다.
큐 시트(목표 길이·라우드니스): 저장소 밖 `data/infra-mystery-game/audio-cues.md`.

## 파일

| 큐 id | 파일 | 무엇 | 만든 도구 | 원본 | 처리 결과 |
|---|---|---|---|---|---|
| `amb.office` | `music/amb.office.ogg` (Opus 80 kbps, 887 KB) · `.mp3` (96 kbps, 948 KB) | 데스크톱 내내 깔리는 사무실 환경음 루프 (패드 + 일렉트릭 피아노 + 사무실 질감) | Gemini 음악, 2026-11-17, 프롬프트 = 큐 시트 §a-1 | `amb.office.mp3` 181.8 s, 44.1 kHz 스테레오 192 kbps, −13.0 LUFS, −0.2 dBTP | **78.90 s 이음매 없는 루프**, 48 kHz 스테레오, −24.0 LUFS (mp3 −24.4), 최대 −10.7 dBTP |
| `music.briefing` | `music/music.briefing.ogg` (Opus 96 kbps, 174 KB) · `.mp3` (128 kbps, 204 KB) | 오프닝 브리핑 스팅: 잠금 화면 09:00 | Gemini 음악, 2026-11-17, 프롬프트 = 큐 시트 §a-2 | `music.briefing.mp3` 61.0 s, 44.1 kHz 스테레오 192 kbps, −11.1 LUFS, +0.1 dBTP | **12.70 s**, 48 kHz 스테레오, −18.0 LUFS (mp3 −18.5), −4.7 dBTP |
| `voice.briefing-jihun` | `voice/voice.briefing-jihun.ogg` (Opus 48 kbps, 148 KB) · `.mp3` (64 kbps, 189 KB) | 박지훈의 음성 메시지 (Case 3 브리핑, 자막과 함께) | Gemini TTS, 목소리 Puck, 2026-11-17, 텍스트 = 큐 시트 §b-1 그대로 | `voice.briefing-jihun.wav` 23.93 s, 24 kHz 모노 16-bit, −16.5 LUFS, −1.4 dBTP | **23.61 s**, 48 kHz 모노, −16.2 LUFS (mp3 −16.4), −2.1 dBTP (mp3 −1.4) |

합계 2.55 MB (예산 4 MB). `music.reveal`, `music.tension`, `voice.nudge-idle-*`, CC0 효과음은 아직 없다(무음 또는 ZzFX).

## 처리 (scripts/audio-prepare.sh 요약)

모든 라우드니스 정규화는 `loudnorm` 2패스 **linear 모드**(측정 → 순수 게인)이고, 스크립트가 linear로 끝났는지 확인한다. 목표 TP −1.5 dBTP(인코딩 여유), 출력 48 kHz.

1. **amb.office** — 원본은 78.90 s마다 같은 악구가 돌아온다(10 ms 엔벌로프 자기상관, 60–92 s 지연 중 78.90 s에서 r = 0.64, 다른 지연은 ≤ 0.45). 26–116 s 구간이 가장 고르다(단기 라우드니스 표준편차 1.05 LU). 그래서 루프 길이를 악구 한 주기로 잡고 30 s 지점에서 자른다.
   ```
   ffmpeg -i amb.office.mp3 -af "aresample=48000:resampler=soxr:precision=28,atrim=start=30:duration=84.9,asetpts=PTS-STARTPTS" -c:a pcm_f32le amb.x.wav
   ffmpeg -i amb.x.wav -i amb.x.wav -i amb.x.wav -filter_complex "
     [0:a]atrim=start=0:end=6,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=6:curve=hsin[head];
     [1:a]atrim=start=78.9,asetpts=PTS-STARTPTS,afade=t=out:st=0:d=6:curve=hsin[tail];
     [head][tail]amix=inputs=2:normalize=0:duration=longest[xf];
     [2:a]atrim=start=6:end=78.9,asetpts=PTS-STARTPTS[body];
     [xf][body]concat=n=2:v=0:a=1[out]" -map "[out]" -c:a pcm_f32le amb.loop.wav
   ```
   루프 = (끝 6 s 페이드아웃 + 처음 6 s 페이드인) + 나머지. 루프의 마지막 샘플 다음이 곧 페이드아웃 구간의 첫 샘플(전체 게인)이므로 이음매가 연속이다. 이어서 loudnorm −24 LUFS.
2. **music.briefing** — 원본 첫 12.7 s(조용한 펠트 피아노 + 저음 첼로 도입부). 마지막 음이 12.4–12.6 s에 스스로 약 −41 dBFS까지 잦아들고 12.8 s에 전체 합주가 들어오므로 그 직전에서 자른다.
   `atrim=start=0:end=12.7,afade=t=in:st=0:d=0.02,afade=t=out:st=11.2:d=1.5` → loudnorm −18 LUFS.
3. **voice.briefing-jihun** — `.wav`에서. 앞 0.23 s·뒤 0.18 s 무음 제거(양끝 50 ms 남김), 80 Hz 하이패스, 48 kHz, −3.1 dBFS 피크 리미터(TTS 원본이 −0.9 dBTP라 순수 게인으로는 −16 LUFS와 ≤ −1 dBTP를 동시에 맞출 수 없음; 몇몇 파열음만 닿음), 모노 유지 → loudnorm −16 LUFS.
   `silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,(같은 것),areverse,highpass=f=80:poles=2,aresample=48000:resampler=soxr:precision=28,alimiter=limit=0.7:attack=1:release=50:level=0`
4. **인코딩** — `-c:a libopus -b:a {80|96|48}k -vbr on -compression_level 10 -application audio -ar 48000` (.ogg), `-c:a libmp3lame -b:a {96|128|64}k -ar 48000 -write_xing 1` (.mp3, LAME 헤더로 갭리스: 브라우저에서도 78.900 s로 디코드됨).

## 확인

- `scripts/audio-check-seam.sh [파일]` — 루프를 두 번 이어 붙여 이음매 1 s를 본문 1 s 창들과 비교(astats RMS·피크·최대 샘플 간 차이). 결과: ogg 이음매 최대 샘플 차 0.0160 vs 본문 최대 0.0281, 이음매 전후 50 ms RMS 차 1.1 dB(본문의 보통 변화 폭) → **SEAMLESS**. mp3도 같음(0.0149 vs 0.0266).
- `node scripts/e2e-audio-files.mjs` — 실제 Chromium에서 ogg와 mp3(ogg 숨김) 둘 다: 첫 클릭 잠금 해제, 잠금 화면 스팅·지훈 음성·환경음 루프가 모두 파일로 재생, 자막이 음성 길이에 맞춰 끝남, 디코드 오류 없음.
- `scripts/audio-preview.sh OUT.wav` — 게임 믹스 게인으로 20 s 미리듣기(환경음 + 스팅 + 음성 첫 15 s).
