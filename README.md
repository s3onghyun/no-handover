# No Handover 「인수인계 없음」

비공개 1주 프로토타입. 퇴사한 선배(남은재)의 PC를 넘겨받은 입사 3주차 한도윤이 되어, 메신저·메일·터미널을 뒤져 토요일 새벽 결제 장애의 원인과 경위, 그리고 "무엇이 그걸 가능하게 했나"를 보고서로 쓰는 브라우저 게임이다. 사건 1개(「금요일 18:02의 작은 변경」), 백엔드 없음, 계정 없음, 공개 저장소 없음.

설계 문서는 저장소 밖 firstmate 홈의 `data/infra-mystery-game/`에 있다(보고서 §2-1·§4, `characters.md`, `design-constraints.md`). 회사명 누리클라우드는 가칭이고, 모든 인물·회사·서버·로그는 가상이다.

## 실행 (3개 명령)

```sh
npm install        # 한 번만. 이후 아래 명령은 모두 오프라인으로 동작
npm run dev        # http://localhost:5173  개발 서버
npm test           # 단위 테스트 51개 (node --test, TypeScript 타입 제거 내장 기능 사용)
```

그 밖에:

| 명령 | 하는 일 |
|---|---|
| `npm run build` | 타입 검사 + 정적 빌드 → `dist/` (약 0.3 MB, 어떤 정적 호스트나 폴더에서도 열림. `base: './'`) |
| `npm run preview` | `dist/`를 로컬에서 서빙 |
| `npm run e2e` | `dist/`를 띄우고 실제 브라우저(playwright-core + `~/.cache/ms-playwright`의 headless shell)로 은재의 history 한 줄에서 출발해 사건을 푼다. `E2E_SHOTS=<폴더>`를 주면 스크린샷 4장 저장 |

URL 옵션(플레이테스트 진행자용): `?fresh=1` 저장 지우고 처음부터, `?nudge=2` 동료 넛지 대기 시간(분, 기본 10), `?rate=16` 게임 시계 배속(기본 16 = 45분 플레이에 09:00→21:00), `?lang=en` UI 영어(사건 본문은 한국어). 작업 표시줄의 📋 에서도 바꿀 수 있다.

## 들어 있는 것

- **데스크톱 셸**: 잠금 화면 → 은재의 바탕화면(나무 의자 사진, 포스트잇 3장), 아이콘, 작업 표시줄, 알림 센터(🔔), 힌트(💡), 플레이테스트(📋), 게임 시계와 21:00 마감.
- **앱**: 터미널(탭 14개 중 5개 살아 있음), 메신저(은재 PC 세션 + 내 계정, 채널·DM·삭제된 메시지 표시·보내지 않은 메시지), 메일(내 메일 + 은재 메일, 임시보관함 초안 11개 중 2개 열림), 도윤 메모장, 증거 보드, 원인 보고서/해설, 대시보드 스냅샷(ASCII).
- **시뮬레이션 셸** (`src/engine/shell.ts`): 호스트 4대(pay-api-01, bastion, pay-cfg, review-web)의 가상 파일시스템. 실제 문법과 출력 형식으로 약 40개 명령: `ls cd pwd cat less head tail grep wc sort uniq find history journalctl crontab -l git log/show/branch/status df free ulimit ss last sudo man help systemctl show/status/cat ps pgrep curl ping ssh exit getent id whoami hostname date uptime echo clear`. 파이프, `; && ||`, 따옴표, `$(...)`, `$VAR`, `~`, 글롭, `2>/dev/null`, `.bashrc` 별칭(`밤`, `fds`, `왜`…), `!!`, Tab 자동완성, ↑/↓. 오타는 "혹시 'crontab' 인가요?"로, 쓰기·편집·재시작은 "조사 모드(읽기 전용)"라는 세계관 안의 설명으로 막는다. `sudo`는 읽기 명령만 허용하고 허용 여부와 상관없이 `/var/log/auth.log`에 남는다.
- **사건 데이터 1파일** (`src/cases/friday-1802.ts`): 타임라인이 로그·history·메시지를 "방출"하고, 시드 고정 생성기가 잡음(시간당 stats, 리뷰 웹 접근 로그 20건, history 채움)을 만든다. 형식은 [`docs/case-format.md`](docs/case-format.md).
- **증거 보드**: 터미널 줄·메시지·메일·메모·알림 옆의 📌. 시각을 자동 인식해 타임라인에 놓고, 끌어서 보관함 ↔ 타임라인, 시각과 메모 수정.
- **고발(보고서)**: 원인 / 경위 / 책임·은폐 세 칸, 제출 3회, 채점(칸당 100, 제출 배수 1·0.85·0.7, 핵심 증거 핀 보너스 최대 +30, 명시 힌트 −10씩) → 해설(실제 타임라인, 시스템 요인, 원칙 하나, "현업에서는 이렇게 확인한다" 명령 카드 7장, 인물 카드).
- **힌트 사다리**: 1단 = 기계 안의 흔적(은재 `~/.bash_history` 4984–4990, 별칭, crontab 주석, vim 스왑 파일, TODO, 포스트잇, 도윤 메모, 22:15 DM), 2단 = 원인 칸에서 10분 진전이 없거나 잘못 고발하면 동료 넛지(지훈/서진의 목소리), 3단 = 칸별 명시 힌트(−10점). 모든 사용이 플레이 로그에 남는다.
- **플레이테스트 로그**: 명령, 막힘(오타·미지원·차단), 앱별 시간, 핀, 고발, 단서 발견 시각, 힌트 단계별 도달 시각. 서버로 보내지 않고 📋 → "플레이 로그 JSON 저장"으로만 기기에 내려받는다. 진행 계획은 [`docs/playtest.md`](docs/playtest.md).

## 구조

```
src/engine/   types.ts(사건 스키마) build.ts(월드 생성) vfs.ts parser.ts shell.ts manpages.ts
              hints.ts(사다리) scoring.ts game.ts(DOM 없는 오케스트레이터: 단서, 트리거, 저장, 로그)
src/cases/    friday-1802.ts  ← 사건 하나 = 데이터 파일 하나
src/ui/       wm.ts(창 관리자) dom.ts style.css apps/*.ts
src/i18n.ts   UI 문자열 표 (ko 먼저, en 같은 키)
tests/        node:test 단위 테스트 + 데이터로 푸는 시나리오
scripts/e2e.mjs  실제 브라우저 e2e
public/characters/  캐릭터 아트 (아래 참고)
```

## 캐릭터 아트

`public/characters/`의 12개 파일은 캡틴이 승인한 아트(평면 2D, 스타일 S1, 원본은 저장소 밖 `data/infra-mystery-game/art/`)에서 만든 복사본이다. 원본은 커밋하지 않는다.

- `<이름>-avatar.webp` 256×256, `<이름>-avatar-64.webp` 64×64(메시지 말풍선), `<이름>-full.webp` 가로 600px(해설의 인물 카드). 이름은 doyun, seojin, jihun, eunjae.
- **워터마크 처리**: 원본 오른쪽 아래의 작은 Gemini 반짝이 표시를 없애려고, 아바타는 오른쪽과 아래쪽 180px 띠를 잘라 냈고(2048 → 1868 정사각), 전신은 오른쪽 180px 띠만 잘라 냈다(1792×2400 → 1612×2400, 발끝 보존). 표시는 가장자리에서 65~165px 안쪽에 있어 이 띠 안에 완전히 들어간다. 그 뒤 축소해 WebP로 다시 인코딩했다(12개 합계 약 100 KB).
- 알려진 차이(당분간 그대로): 서진의 이어폰이 양쪽 다 끼워져 있고 휴대폰 화면이 위를 향한다.
- 이미지 경로는 사건 데이터의 `people.<id>.avatar / avatarSmall / portrait`에 있다. 파일이 없으면 이니셜 원으로 대체된다.

## 의존성과 라이선스

런타임 의존성은 없다(빌드 결과물은 순수 HTML/CSS/JS). 개발 의존성:

| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| vite | ^6.4.6 | MIT | 개발 서버, 정적 빌드 |
| typescript | ~5.8.3 | Apache-2.0 | 타입 검사 |
| @types/node | ^22 | MIT | 테스트·스크립트 타입 |
| playwright-core | 1.64.1 (고정) | Apache-2.0 | e2e 전용, 브라우저는 내려받지 않고 로컬 캐시 사용 |

전이 의존성: esbuild, rollup, postcss, nanoid, fdir, picomatch, tinyglobby, undici-types(MIT), picocolors(ISC), source-map-js(BSD-3-Clause). vitest는 설치 시점의 버전에 미해결 보안 권고가 있어 빼고, Node 22 내장 `node --test`와 타입 제거 기능으로 대신했다.

## 알려진 단순화

- `/proc/<pid>/fd`는 실제로는 같은 사용자나 root만 읽을 수 있지만, 은재의 `fds` 별칭이 금요일에 동작했다는 설정을 살리려고 조사 세션에서도 읽힌다.
- 백업 cron은 캐릭터 시트의 `15 3 * * *`(매일)가 아니라 `15 3 * * 6`(토요일)이다. 매일이면 일요일 03:15에도 같은 장애가 났어야 해서 타임라인과 모순된다.
- `sed`, `awk`, `vim`, `lsof` 등은 세계관 안의 이유로 막혀 있다(대체 명령을 안내).
- 메신저·메일은 읽기 전용이다. 대화는 찾은 단서에 따라 스크립트대로 이어진다.
