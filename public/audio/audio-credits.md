# No Handover — 음원 출처와 처리 기록 (audio credits)

> **프로토타입 전용.** 아래 음악·`voice.briefing-jihun`은 캡틴의 Gemini 계정으로 2026-11-17에 만든 것이다(무료 등급).
> 나머지 목소리(Case 1·2 브리핑, 동료 넛지 20개)는 2026-11-20에 캡틴의 **유료 개인 Gemini API 키**(Tier 1)로 만들었다.
> 유료 API 사용분에는 [Gemini API 추가 서비스 약관](https://ai.google.dev/gemini-api/terms)이 적용된다.
> 그래도 음악·TTS 음성의 **상업적 이용 조건은 아직 확인하지 않았다.**
> 판매·유료 배포 전에 Google의 해당 시점 이용 약관을 확인하고, 필요하면 다시 만들거나 라이선스가 분명한 음원으로 바꾼다.

원본은 저장소에 넣지 않는다(저장소 밖 `data/infra-mystery-game/audio-in/`, 2026-11-20 목소리 원본은 `data/nh-voice/audio-in/`). 아래 파일은 모두 `scripts/audio-prepare.sh <원본 폴더>`로 원본에서 그대로 다시 만들 수 있다.
큐 시트(목표 길이·라우드니스): 저장소 밖 `data/infra-mystery-game/audio-cues.md`.

## 파일

| 큐 id | 파일 | 무엇 | 만든 도구 | 원본 | 처리 결과 |
|---|---|---|---|---|---|
| `amb.office` | `music/amb.office.ogg` (Opus 80 kbps, 887 KB) · `.mp3` (96 kbps, 948 KB) | 데스크톱 내내 깔리는 사무실 환경음 루프 (패드 + 일렉트릭 피아노 + 사무실 질감) | Gemini 음악, 2026-11-17, 프롬프트 = 큐 시트 §a-1 | `amb.office.mp3` 181.8 s, 44.1 kHz 스테레오 192 kbps, −13.0 LUFS, −0.2 dBTP | **78.90 s 이음매 없는 루프**, 48 kHz 스테레오, −24.0 LUFS (mp3 −24.4), 최대 −10.7 dBTP |
| `music.briefing` | `music/music.briefing.ogg` (Opus 96 kbps, 174 KB) · `.mp3` (128 kbps, 204 KB) | 오프닝 브리핑 스팅: 잠금 화면 09:00 | Gemini 음악, 2026-11-17, 프롬프트 = 큐 시트 §a-2 | `music.briefing.mp3` 61.0 s, 44.1 kHz 스테레오 192 kbps, −11.1 LUFS, +0.1 dBTP | **12.70 s**, 48 kHz 스테레오, −18.0 LUFS (mp3 −18.5), −4.7 dBTP |
| `voice.briefing-jihun` | `voice/voice.briefing-jihun.ogg` (Opus 48 kbps, 148 KB) · `.mp3` (64 kbps, 189 KB) | 박지훈의 음성 메시지 (Case 3 브리핑, 자막과 함께) | Gemini TTS, 목소리 Puck, 2026-11-17, 텍스트 = 큐 시트 §b-1 그대로 | `voice.briefing-jihun.wav` 23.93 s, 24 kHz 모노 16-bit, −16.5 LUFS, −1.4 dBTP | **23.61 s**, 48 kHz 모노, −16.2 LUFS (mp3 −16.4), −2.1 dBTP (mp3 −1.4) |
| `voice.briefing-case1-seojin` | `voice/….ogg` (Opus 20 kbps, 86 KB) · `.mp3` (24 kbps 24 kHz, 106 KB) | 강서진의 음성 메시지 (Case 1 브리핑) | Gemini API `gemini-3.1-flash-tts-preview`, 목소리 **Aoede**, 2026-11-20, 유료 키. 텍스트 = `src/cases/case-1-cron.ts` `opening.briefing.lines` 그대로 | 35.56 s, 24 kHz 모노 16-bit | **35.06 s**, −16.3 LUFS (mp3 −16.6), −1.6 dBTP (mp3 −2.2) |
| `voice.briefing-case2-seojin` | `voice/….ogg` (Opus 20 kbps, 80 KB) · `.mp3` (24 kbps 24 kHz, 93 KB) | 강서진의 음성 메시지 (Case 2 브리핑) | 같은 모델·목소리·날짜. 텍스트 = `src/cases/case-2-deleted.ts` `opening.briefing.lines` 그대로 | 31.52 s, 24 kHz 모노 16-bit | **30.92 s**, −16.2 LUFS (mp3 −16.6), −1.9 dBTP (mp3 −2.4) |
| `voice.nudge-<사건 id>-idle-N` (16개), `…-idle-N-ask` (4개) | `voice/….ogg` (Opus 20 kbps, 8–32 KB) · `.mp3` (24 kbps 24 kHz, 10–37 KB) | 2단 넛지가 메신저로 올 때. 사건마다 문구와 화자가 달라서 사건별로 따로 만들었다. `-ask`는 플레이어가 직접 물었을 때 문구(`askText`) | 같은 모델·날짜. 서진 = **Aoede**, 지훈 = **Puck** (Case 3 브리핑과 같은 목소리). 텍스트 = 각 사건 파일 `hints.idle[].text` / `askText` 그대로 | 3.6–13.1 s, 24 kHz 모노 16-bit | **3.1–12.2 s**, −16.0…−16.5 LUFS (mp3 −16.3…−17.0), 모두 ≤ −1.0 dBTP |

합계 3.81 MB (예산 4 MB; 2026-11-20 목소리 44개 파일이 1.26 MB). `music.reveal`, `music.tension`, CC0 효과음은 아직 없다(무음 또는 ZzFX).

**2026-11-20 목소리 만들기.** 자막 문구를 바꾸지 않고 그대로 읽힌다. 음성에서는 `ㅋㅋ`를 웃음 `(웃음)`으로, 이모지는 읽지 않고, `??`·`!!`는 하나로 넣었다(§b-1과 같은 규칙). 문장 앞에 영어 스타일 지시를 붙인다. 서진은 "차분한 30대 초반 SRE, 짧고 건조하게, 느낌표 없이 문장 끝을 내림, 조금 피곤함"이고, Case 2는 "감사 기간 결제 로그 유실, 평소보다 급하지만 침착"을 더했다. 지훈은 "밝은 30대 후반 팀 리드, 빠르고 가볍게, (웃음)에서 짧게 웃음"이다. 기술 용어는 발음을 지정했다(예: `wiki-01` "위키 공일", `fd` "에프디", `LimitNOFILE` "리밋 노 파일", `journalctl -u cron` "저널씨티엘 대시 유 크론"). 서진 목소리는 Case 1 브리핑을 Kore와 Aoede로 만들어 골랐다. Aoede는 로컬 ASR이 자막과 한 글자도 다르지 않았고, Kore는 "보고서는 12시까지"를 빠뜨렸다. Case 3 지훈 브리핑(11-17, 무료 등급)은 그대로 둔다.

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
5. **2026-11-20 목소리** (Case 1·2 브리핑, 넛지 20개) — 3번과 같은 사슬(앞뒤 무음 제거, 80 Hz 하이패스, 48 kHz, 리미터, loudnorm 2패스 linear −16 LUFS). 다른 점 셋. ① 리미터 한계는 파일마다 정한다. 첫 라우드니스 측정에서 게인을 구해 게인 뒤 피크가 −3 dBFS에 오도록 시작하고, loudnorm이 linear로 남고 **두 인코딩 모두 ≤ −1 dBTP**가 될 때까지 1 dB씩 낮춘다(몇몇 TTS 원본이 +0.4 dBFS로 클리핑되어 있어 낮은 비트레이트에서 피크가 튄다). ② 4 MB 예산 때문에 Opus 20 kbps + MP3 24 kbps(24 kHz, TTS 원래 레이트; 32 kbps 아래 MP3는 MPEG-2 레이트가 필요). ③ 이번에 쓴 Homebrew ffmpeg 9.0.2에는 soxr가 없어서 스크립트가 swr(`filter_size=64:phase_shift=10:cutoff=0.97`)로 대신한다. 11-17 파일은 soxr로 만든 그대로이고 다시 만들지 않았다.

## 확인

- **ASR 대조 (2026-11-20 목소리)** — 로컬 whisper large-v3-turbo(`whisper-cli`)로 최종 `.ogg` 22개를 받아쓰기해 자막과 비교했다. 낱말이 모두 맞는다. 차이는 받아쓰기 쪽 동음이의(로그/로고, 저널/전월, 지운/지온)와 받아쓰지 않는 웃음뿐이다. 통째로 받아쓸 때 빠진 낱말은 그 구간만 다시 받아써서 들어 있음을 확인했다(Case 2 브리핑 끝 "고치는 건", Case 3 idle-3 "뭐"). `friday-1802-idle-2`는 첫 생성에서 "부터"가 빠져 다시 만들었다. `case1-cron-env-idle-3-ask`의 "(웃음) 그 명령"은 웃음이 "그"에 붙어 받아쓰기가 흔들리지만 원본·인코딩 모두 "명령"은 들린다.

- `scripts/audio-check-seam.sh [파일]` — 루프를 두 번 이어 붙여 이음매 1 s를 본문 1 s 창들과 비교(astats RMS·피크·최대 샘플 간 차이). 결과: ogg 이음매 최대 샘플 차 0.0160 vs 본문 최대 0.0281, 이음매 전후 50 ms RMS 차 1.1 dB(본문의 보통 변화 폭) → **SEAMLESS**. mp3도 같음(0.0149 vs 0.0266).
- `node scripts/e2e-audio-files.mjs` — 실제 Chromium에서 ogg와 mp3(ogg 숨김) 둘 다: 첫 클릭 잠금 해제, 잠금 화면 스팅·지훈 음성·환경음 루프가 모두 파일로 재생, 자막이 음성 길이에 맞춰 끝남, 목소리 큐 23개 모두 디코드, 디코드 오류 없음. 이어서 Case 1·2 오프닝에서 서진 음성이 파일로 재생(타이핑 소리 없음)되고, Case 1 넛지가 사건별 음성(`-ask` 포함)을 파일로 재생.
- `scripts/audio-preview.sh OUT.wav` — 게임 믹스 게인으로 20 s 미리듣기(환경음 + 스팅 + 음성 첫 15 s).
