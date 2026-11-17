# No Handover 「인수인계 없음」

비공개 프로토타입. 퇴사하는 선배(남은재)의 PC를 넘겨받은 신입 한도윤이 되어, 메신저·메일·터미널을 뒤져 장애의 원인과 경위, 그리고 "무엇이 그걸 가능하게 했나"를 보고서로 쓰는 브라우저 게임이다. 사건은 주니어 → 시니어 사다리 5칸(Case 0~4, [`docs/campaign-ladder.md`](docs/campaign-ladder.md)) 중 2개가 플레이 가능하다: **Case 0 튜토리얼 「위키가 안 열려요」**(5–10분, 처음 실행하면 여기서 시작)와 **Case 3 「금요일 18:02의 작은 변경」**(30–45분). 백엔드 없음, 계정 없음, 공개 저장소 없음.

설계 문서는 저장소 밖 firstmate 홈의 `data/infra-mystery-game/`에 있다(보고서 §2-1·§4, `characters.md`, `design-constraints.md`). 회사명 누리클라우드는 가칭이고, 모든 인물·회사·서버·로그는 가상이다.

## 실행 (3개 명령)

```sh
npm install        # 한 번만. 이후 아래 명령은 모두 오프라인으로 동작
npm run dev        # http://localhost:5173  개발 서버
npm test           # 단위 테스트 86개 (node --test, TypeScript 타입 제거 내장 기능 사용)
```

그 밖에:

| 명령 | 하는 일 |
|---|---|
| `npm run build` | 타입 검사 + 정적 빌드 → `dist/` (약 0.3 MB, 어떤 정적 호스트나 폴더에서도 열림. `base: './'`) |
| `npm run preview` | `dist/`를 로컬에서 서빙 |
| `npm run e2e` | `dist/`를 띄우고 실제 브라우저(playwright-core + `~/.cache/ms-playwright`의 headless shell)로 **Case 0**을 푼다(18초 브리핑, 미리 쳐진 `history`, 지훈의 레일과 되돌림, 체크 5칸과 아이콘 해금, 오답 한 번 뒤 정답). 해설의 "다음 사건"으로 **Case 3**을 열어 오프닝 브리핑을 끝까지 보고(약 31초), 오늘 할 일 세 칸을 체크하고, 은재의 history 한 줄에서 출발해 사건을 푼다. 두 번째 창에서 Esc 건너뛰기, ❓ 다시 보기, 음소거 유지를 확인한다. `E2E_SHOTS=<폴더>`를 주면 스크린샷 9장 저장(Case 0 3장 + Case 3 6장). 이어서 `scripts/e2e-audio.mjs`가 소리를 확인한다(아래 「소리」) |
| `npm run audio:render -- <폴더>` | ZzFX 효과음을 WAV로 렌더해 저장: `ui-set.wav`(UI 소리 전부, 5초), `fallbacks.wav`(진동·타이핑 대체음). 게임을 열지 않고 들어 볼 때 |

URL 옵션(플레이테스트 진행자용): `?fresh=1` 모든 사건의 저장과 진행 상황을 지우고 Case 0부터, `?case=friday-1802` 그 사건을 잠금과 상관없이 열기(`case0-wiki`도 같음), `?nudge=2` 동료 넛지 대기 시간(분, 기본은 사건 값: Case 0 2분, Case 3 6분), `?rate=16` 게임 시계 배속(기본 16 = 45분 플레이에 09:00→21:00), `?lang=en` UI 영어(사건 본문은 한국어), `?briefing=0` 오프닝 브리핑 없이 시작, `?bspeed=2` 브리핑 배속. 작업 표시줄의 📋 에서도 일부를 바꿀 수 있다.

## 들어 있는 것

- **사건 사다리** (`src/cases/index.ts`, `src/engine/campaign.ts`): 처음 실행하면 Case 0 잠금 화면("Case 0 · 튜토리얼" 라벨, 경험자용 "튜토리얼 건너뛰기 → Case 3" 링크, ☰ 사건 목록). 사건은 앞의 플레이 가능한 사건을 풀면(해설까지 가면) 열리고, 아직 없는 Case 1·2·4는 제목만 보이는 "준비 중" 칸이다. 저장은 사건마다 따로(`no-handover:save:<id>`), 진행 상황은 `no-handover:campaign`.
- **Case 0 튜토리얼** (`src/cases/case-0-wiki.ts`): 은재 퇴사 주 화요일 09:30, 위키 서버 한 대의 `/var`가 밤새 불어난 로그(11G)로 100%. 터미널에 `history`가 미리 쳐져 있어 Enter만 누르면 은재의 2025년 디스크 장애 순서가 나오고(노란 줄 = 단서), 지훈이 메신저로 단계마다 다음 명령을 알려 준다(엉뚱한 명령엔 한 번 "그건 나중에요 ㅋㅋ df -h 부터!!"). 쓸 수 있는 명령은 12개(`ls cd pwd cat head tail grep df du history systemctl journalctl` + `man help hint clear`)이고 그 밖의 진짜 명령은 "오늘 연습 범위 밖"이라고 답한다. 아이콘 3개로 시작해 체크 5칸이 진행될 때마다 메모장·보드·대시보드·보고서가 나타난다. 보고서 2칸(원인/경위), 제출 무제한, 넛지 2분, 명시 힌트 −5. 고치는 법은 해설에서 설명만 한다. 작업 표시줄 ⏭ 로 언제든 건너뛸 수 있다.
- **첫 3분 (Case 3)**: 잠금 해제 → 약 31초짜리 오프닝 브리핑(월요일 09:00 잠금 화면, 박지훈의 음성 메시지 카드와 타이핑되는 자막, 오미래의 메일 알림, Esc·건너뛰기로 생략, ❓에서 다시 보기) → 터미널이 열린 채 `crontab -`가 깜빡이고 창이 숨 쉬듯 빛나는 바탕화면 + 오른쪽 위 "오늘 할 일" 포스트잇(체크 3개: 열린 터미널 확인, 선배가 마지막에 친 명령 찾기, 증거 3개 보드에 올리기). 셋 다 체크되면 포스트잇이 메모장으로 접혀 들어가고 펄스·힌트 줄이 멈춘다.
- **소리**: UI 효과음 12개는 파일 없이 브라우저에서 ZzFX로 합성해 지금 바로 들린다. 음악·환경음·목소리는 메인이 파일을 보내 주면 폴더에 넣는 것만으로 나온다(코드 수정 없음). 첫 클릭(어디든)에서 소리가 켜진다. 자세한 것은 아래 「소리」.
- **데스크톱 셸**: 잠금 화면 → 은재의 바탕화면(나무 의자 사진, 포스트잇 3장), 아이콘, 작업 표시줄, 알림 센터(🔔), 힌트(💡), 도움말(❓), 소리(🔊), 플레이테스트(📋), 게임 시계와 21:00 마감.
- **앱**: 터미널(탭 14개 중 5개 살아 있음), 메신저(은재 PC 세션 + 내 계정, 채널·DM·삭제된 메시지 표시·보내지 않은 메시지), 메일(내 메일 + 은재 메일, 임시보관함 초안 11개 중 2개 열림), 도윤 메모장, 증거 보드, 원인 보고서/해설, 대시보드 스냅샷(ASCII).
- **시뮬레이션 셸** (`src/engine/shell.ts`): 호스트(Case 3은 pay-api-01, bastion, pay-cfg, review-web, Case 0은 wiki-01)의 가상 파일시스템. 실제 문법과 출력 형식으로 약 40개 명령: `ls cd pwd cat less head tail grep wc sort uniq find history journalctl crontab -l git log/show/branch/status df du free ulimit ss last sudo man help hint systemctl show/status/cat ps pgrep curl ping ssh exit getent id whoami hostname date uptime echo clear`. `du`는 파일의 겉보기 크기(`size`)로 계산하고, 50 MB가 넘는 파일의 `cat`은 "tail로 끝만"이라고 거절한다. `hint`는 💡 패널을 연다. 파이프, `; && ||`, 따옴표, `$(...)`, `$VAR`, `~`, 글롭, `2>/dev/null`, `.bashrc` 별칭(`밤`, `fds`, `왜`…), `!!`, Tab 자동완성, ↑/↓. 오타는 "혹시 'crontab' 인가요?"로, 쓰기·편집·재시작은 "조사 모드(읽기 전용)"라는 세계관 안의 설명으로 막는다. `sudo`는 읽기 명령만 허용하고 허용 여부와 상관없이 `/var/log/auth.log`에 남는다.
- **사건 데이터 = 사건마다 1파일** (`src/cases/friday-1802.ts`, `src/cases/case-0-wiki.ts`): 타임라인이 로그·history·메시지를 "방출"하고, 시드 고정 생성기가 잡음(시간당 stats, 리뷰 웹 접근 로그 20건, history 채움)을 만든다. 형식은 [`docs/case-format.md`](docs/case-format.md).
- **증거 보드**: 터미널 줄·메시지·메일·메모·알림 옆의 📌. 시각을 자동 인식해 타임라인에 놓고, 끌어서 보관함 ↔ 타임라인, 시각과 메모 수정.
- **고발(보고서)**: Case 3은 원인 / 경위 / 책임·은폐 세 칸, 제출 3회(Case 0은 두 칸, 무제한), 채점(칸당 100, 제출 배수 1·0.85·0.7, 핵심 증거 핀 보너스 최대 +30, 명시 힌트 −10씩) → 해설(실제 타임라인, 시스템 요인, 원칙 하나, "현업에서는 이렇게 확인한다" 명령 카드 7장, 인물 카드).
- **힌트 사다리**: 1단 = 기계 안의 흔적(은재 `~/.bash_history` 4984–4990, 별칭, crontab 주석, vim 스왑 파일, TODO, 포스트잇, 도윤 메모, 22:15 DM), 2단 = 원인 칸에서 진전이 없거나(Case 3 6분, Case 0 2분, 직전 1분 안에 단서를 찾았으면 보류) 잘못 고발하면 동료 넛지(지훈/서진의 목소리), 3단 = 칸별 명시 힌트(−10점, Case 0은 −5. 터미널에 `hint`를 쳐도 열림). 모든 사용이 플레이 로그에 남는다.
- **플레이테스트 로그**: 명령, 막힘(오타·미지원·차단), 앱별 시간, 핀, 고발, 단서 발견 시각, 힌트 단계별 도달 시각. 서버로 보내지 않고 📋 → "플레이 로그 JSON 저장"으로만 기기에 내려받는다. 진행 계획은 [`docs/playtest.md`](docs/playtest.md).

## 구조

```
src/engine/   types.ts(사건 스키마) build.ts(월드 생성) vfs.ts parser.ts shell.ts manpages.ts
              hints.ts(사다리) objectives.ts(오늘 할 일) scoring.ts campaign.ts(사건 잠금·건너뛰기)
              game.ts(DOM 없는 오케스트레이터: 단서, 트리거, 레일, 저장, 로그)
src/audio/    manifest.ts(큐 id → 파일·ZzFX 파라미터) audio.ts(AudioManager) unlock.ts(첫 제스처 잠금 해제) vendor/zzfx.ts(MIT)
src/cases/    index.ts(사다리 5칸) case-0-wiki.ts friday-1802.ts  ← 사건 하나 = 데이터 파일 하나
src/ui/       wm.ts(창 관리자) dom.ts style.css briefing.ts(오프닝) objectives.ts(오늘 할 일 포스트잇) apps/*.ts
src/i18n.ts   UI 문자열 표 (ko 먼저, en 같은 키)
tests/        node:test 단위 테스트 + 데이터로 푸는 시나리오
scripts/e2e.mjs  실제 브라우저 e2e   scripts/e2e-audio.mjs  소리 e2e   scripts/audio-render.ts  WAV 렌더
public/characters/  캐릭터 아트 (아래 참고)
```

## 캐릭터 아트

`public/characters/`의 12개 파일은 캡틴이 승인한 아트(평면 2D, 스타일 S1, 원본은 저장소 밖 `data/infra-mystery-game/art/`)에서 만든 복사본이다. 원본은 커밋하지 않는다.

- `<이름>-avatar.webp` 256×256, `<이름>-avatar-64.webp` 64×64(메시지 말풍선), `<이름>-full.webp` 가로 600px(해설의 인물 카드). 이름은 doyun, seojin, jihun, eunjae.
- **워터마크 처리**: 원본 오른쪽 아래의 작은 Gemini 반짝이 표시를 없애려고, 아바타는 오른쪽과 아래쪽 180px 띠를 잘라 냈고(2048 → 1868 정사각), 전신은 오른쪽 180px 띠만 잘라 냈다(1792×2400 → 1612×2400, 발끝 보존). 표시는 가장자리에서 65~165px 안쪽에 있어 이 띠 안에 완전히 들어간다. 그 뒤 축소해 WebP로 다시 인코딩했다(12개 합계 약 100 KB).
- 알려진 차이(당분간 그대로): 서진의 이어폰이 양쪽 다 끼워져 있고 휴대폰 화면이 위를 향한다.
- 이미지 경로는 사건 데이터의 `people.<id>.avatar / avatarSmall / portrait`에 있다. 파일이 없으면 이니셜 원으로 대체된다.

## 소리

`src/audio/`. 큐 id(21개)는 저장소 밖 `data/infra-mystery-game/audio-cues.md`의 큐 시트와 같다.

**큐마다 재생 순서**: ① 파일(`.ogg` 먼저, 없거나 못 읽으면 `.mp3`) → ② ZzFX 합성(`manifest.ts`의 `zzfx` 배열이 있을 때) → ③ 무음. 파일이 없는 것은 정상이다(404나 개발 서버의 HTML 응답은 "없음"으로 처리).

**파일을 넣는 곳** (이름 = 큐 id, 코드 수정 없이 다음 빌드부터 재생):

| 폴더 | 파일 |
|---|---|
| `public/audio/music/` | `amb.office`, `music.briefing`, `music.reveal`, `music.tension` |
| `public/audio/voice/` | `voice.briefing-jihun`, `voice.nudge-idle-1` … `voice.nudge-idle-4` |
| `public/audio/sfx/` | `sfx.ring`, `sfx.typing` (CC0 파일이 오면 ZzFX 대체음을 덮어씀), 그 밖의 `sfx.*`도 같은 이름이면 ZzFX보다 먼저 쓰인다 |

예: `public/audio/music/amb.office.ogg`와 `public/audio/music/amb.office.mp3`. 하나만 있어도 된다. 다른 경로를 쓰려면 그 큐에 `src: [...]`를 적는다.

**들어 있는 음원 파일** (2026-11-17, 합계 2.55 MB / 예산 4 MB, 각각 Opus `.ogg` + `.mp3`, 48 kHz):

| 큐 | 길이 | 라우드니스 | 내용 |
|---|---|---|---|
| `amb.office` | 78.9 s 이음매 없는 루프 | −24 LUFS | 데스크톱 환경음 (Gemini 음악) |
| `music.briefing` | 12.7 s | −18 LUFS | 브리핑 잠금 화면 스팅 (Gemini 음악) |
| `voice.briefing-jihun` | 23.6 s, 모노 | −16 LUFS | Case 3 브리핑의 지훈 음성 메시지 (Gemini TTS, Puck) |

`music.reveal`은 아직 비어 있다(무음). **출처·처리 명령·측정값은 [`public/audio/audio-credits.md`](public/audio/audio-credits.md).** 음악·음성은 캡틴의 Gemini 계정으로 만든 **프로토타입용**이며, Gemini 앱 음악·TTS의 상업적 이용 조건은 판매 전에 확인해야 한다. 원본(저장소 밖 `data/infra-mystery-game/audio-in/`)에서 다시 만들기: `scripts/audio-prepare.sh <원본 폴더>`. 루프 이음매 검사: `scripts/audio-check-seam.sh`. 20초 미리듣기: `scripts/audio-preview.sh /tmp/nh-preview.wav`.

**ZzFX 효과음** (파일 0, [ZzFX](https://github.com/KilledByAPixel/ZzFX) 1.4.0 MIT를 `src/audio/vendor/zzfx.ts`에 옮겨 넣음): `sfx.ding` `sfx.mail` `sfx.error` `sfx.tick` `sfx.done` `sfx.pin` `sfx.pulse` `sfx.key` `sfx.window-open` `sfx.window-close`, 그리고 파일이 올 때까지 `sfx.ring`(진동 두 번) `sfx.typing`(1.6초 루프). 한 가족으로 맞췄다: 사인 기반, 2–6 ms 어택, 짧은 감쇠, 저역 통과 필터. 최대 음량 100 %에서 피크 −18…−12 dBFS(`sfx.key`는 −24, `sfx.typing`은 −22로 더 작게). 소리를 바꾸려면 `manifest.ts`의 숫자 배열만 고친다. 배열은 [ZzFX 디자이너](https://killedbyapixel.github.io/ZzFX/)에 그대로 붙여 넣고 다시 꺼낼 수 있다. `hits`는 같은 소리를 여러 번(시각, 음량, 반음) 울린다. 범위는 `tests/zzfx.test.ts`가 지킨다.

**자동 재생 규칙**: 브라우저는 사용자 제스처 전에는 소리를 막는다. 페이지 어디든 첫 `pointerdown`/`keydown`/`touchend`에서 AudioContext를 만들고 켠다(잠금 해제 버튼만이 아니다). 그 전에 요청된 루프(환경음)와 10초 안의 음악·목소리는 켜지는 즉시 재생되고, UI 효과음은 버린다. Safari가 다시 멈추면(백그라운드, 전화) 탭이 다시 보일 때와 다음 클릭에서 되살린다. 음소거 상태여도 잠금은 풀린다. 아직 켜지지 않았으면 화면 아래에 "아무 곳이나 클릭하면 소리가 켜집니다"가 보인다. 켜진 시각은 플레이 로그에 `audio-unlock`(`ms` 페이지 로드 후, `via` 이벤트, `muted`)으로 남는다. 작업 표시줄 🔊 음소거와 음량 막대는 localStorage에 남는다.

**들어 보기**: `npm run audio:render -- /tmp/nh` 후 `/tmp/nh/ui-set.wav`. 또는 게임에서 브라우저 콘솔에 `__audio.play('sfx.done')`.

**확인**: `npm run e2e`의 두 번째 단계(`scripts/e2e-audio.mjs`)가 `dist/`의 임시 복사본에 시험용 톤 두 개(`amb.office.ogg`, `voice.briefing-jihun.mp3`)를 넣고 띄운 뒤, 데스크톱 Chrome의 자동 재생 규칙을 걸고 잠금 화면 빈 곳을 클릭해 AudioContext가 `running`인지, `sfx.ding`이 실제 출력(AnalyserNode)에 나오는지, 넣은 파일이 코드 수정 없이 재생되는지, 음소거 상태에서도 잠금이 풀리는지 본다. 임시 복사본은 끝나면 지운다(이 단계는 들어 있는 음원 파일을 먼저 지우고 시작한다). 들어 있는 음원 자체는 `node scripts/e2e-audio-files.mjs`(빌드 후)가 확인한다: Case 3(`?case=friday-1802`)를 ogg 그대로 한 번, ogg를 숨겨 mp3로 한 번 띄워, 잠금 화면 스팅·지훈 음성·환경음 루프가 파일로 재생되는지, 자막이 음성 길이에 맞춰 끝나는지, 마스터 출력 레벨(AnalyserNode)과 콘솔 디코드 오류를 본다.

## 의존성과 라이선스

런타임 의존성은 없다(빌드 결과물은 순수 HTML/CSS/JS). 개발 의존성:

| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| vite | ^6.4.6 | MIT | 개발 서버, 정적 빌드 |
| typescript | ~5.8.3 | Apache-2.0 | 타입 검사 |
| @types/node | ^22 | MIT | 테스트·스크립트 타입 |
| playwright-core | 1.64.1 (고정) | Apache-2.0 | e2e 전용, 브라우저는 내려받지 않고 로컬 캐시 사용 |

벤더링한 코드(소스를 저장소에 복사, npm 의존성 아님):

| 코드 | 버전 | 라이선스 | 위치 | 용도 |
|---|---|---|---|---|
| ZzFX (Frank Force) | 1.4.0 | MIT, Copyright (c) 2019 Frank Force. 고지는 파일 머리에 그대로 둠 | `src/audio/vendor/zzfx.ts` | UI 효과음 합성 |

음원: `public/audio/music/`, `public/audio/voice/`의 파일은 Gemini 음악·Gemini TTS로 만든 프로토타입용(상업 조건 미확인). 자세한 것은 [`public/audio/audio-credits.md`](public/audio/audio-credits.md).

전이 의존성: esbuild, rollup, postcss, nanoid, fdir, picomatch, tinyglobby, undici-types(MIT), picocolors(ISC), source-map-js(BSD-3-Clause). vitest는 설치 시점의 버전에 미해결 보안 권고가 있어 빼고, Node 22 내장 `node --test`와 타입 제거 기능으로 대신했다.

## 알려진 단순화

- `/proc/<pid>/fd`는 실제로는 같은 사용자나 root만 읽을 수 있지만, 은재의 `fds` 별칭이 금요일에 동작했다는 설정을 살리려고 조사 세션에서도 읽힌다.
- 백업 cron은 캐릭터 시트의 `15 3 * * *`(매일)가 아니라 `15 3 * * 6`(토요일)이다. 매일이면 일요일 03:15에도 같은 장애가 났어야 해서 타임라인과 모순된다.
- `sed`, `awk`, `vim`, `lsof` 등은 세계관 안의 이유로 막혀 있다(대체 명령을 안내).
- 메신저·메일은 읽기 전용이다. 대화는 찾은 단서에 따라 스크립트대로 이어진다.
