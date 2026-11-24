# 사건 데이터 형식 (case format)

사건 하나는 TypeScript 파일 하나다: `src/cases/<id>.ts`가 `CaseFile` 객체 하나를 내보낸다. 타입 정의는 `src/engine/types.ts`에 있고, 편집기가 빠진 칸과 오타를 바로 알려 준다. YAML 대신 TS를 고른 이유는 의존성을 늘리지 않고, 긴 로그 줄이나 반복되는 37건 알림 같은 것을 짧은 함수로 만들 수 있어서다. 엔진 코드는 사건 이름을 하나도 모른다. 새 사건은 파일 하나를 추가하고 `src/cases/index.ts`의 사다리(`CAMPAIGN`, 5절 사다리는 [`campaign-ladder.md`](campaign-ladder.md))에 그 사건을 한 줄로 붙이면 된다. 잠금·건너뛰기·다음 사건 규칙은 `src/engine/campaign.ts`.

> 읽는 순서 추천: ① `timeline` ② `clues` ③ `accusation` ④ `hints` ⑤ `triggers` ⑥ `debrief`. Case 3(예전 1화)의 실제 예시는 `src/cases/friday-1802.ts`, 튜토리얼은 `src/cases/case-0-wiki.ts`, 본편의 작은 사건은 `src/cases/case-1-cron.ts`(호스트 1대, 보고서 2칸, 🎯 목표 마크)와 `src/cases/case-2-deleted.ts`(호스트 2대, 3칸).

## 1. 큰 그림

```
timeline (시각순 사건) ─┬─ emits → 저널(journalctl), 로그 파일, bash history, 메신저 메시지
generators (잡음)      ─┘
hosts (서버별 정적 파일, crontab, 그룹, 프로세스, systemd 유닛, git 저장소, last, df …)
      ↓ src/engine/build.ts (결정적: 같은 데이터 → 같은 월드)
월드 = 호스트마다 가상 파일시스템 + 저널 + history + 메시지 목록
      ↓
clues: 플레이어가 본 출력/연 항목을 정규식으로 감지 → 진전, 트리거, 증거 점수
```

시각은 모두 사건 시간대의 현지 시각 문자열 `'2026-11-14T03:15:40'`이다. 시간대는 `clock.tz`(`+09:00`) 하나로 정한다.

## 2. 최상위 필드

| 필드 | 뜻 |
|---|---|
| `id`, `title`, `subtitle` | 저장 키와 화면 표시용 |
| `company`, `domain` | 회사 가칭과 메일 도메인(`.example`만 쓸 것) |
| `clock` | `start`(게임 시작 = 월 09:00), `deadline`(21:00), `tz`, `rate`(게임 시계 배속, 기본 16. Case 0은 6 = 10분 플레이에 1시간) |
| `player`, `owner` | 플레이어 인물 id(도윤), PC 주인 id(은재) |
| `people` | 인물표. `name`, `role`, `initial`, `color`, `login`(서버 계정), `avatar`/`avatarSmall`/`portrait`(이미지 경로, 없으면 이니셜) |
| `hosts` | 서버들 (3절) |
| `timeline` | 사건의 확정 타임라인 (4절) |
| `generators` | 잡음 생성기 (5절) |
| `channels`, `mails`, `notes`, `stickies`, `notifications` | 메신저 채널, 메일, 도윤 메모장, 바탕화면 포스트잇, 알림 센터 (6절) |
| `terminalTabs` | 처음 열려 있는 터미널 탭: `host`, `cwd`, `prefill`(입력창에 남은 글. Case 3은 `crontab -`, Case 0은 **반드시 성공하는** `history`), `scrollback`(잠긴 화면에 남은 줄) |
| `dashboard` | 대시보드 스냅샷(ASCII 줄 배열). `panels`가 없으면 대시보드 앱이 이 줄들을 텍스트 패널로 보여 준다 |
| `panels` | 선택. 같은 스냅샷을 구조화한 패널(시계열·스탯·주석). 대시보드 앱과 증거 보드가 그린다 (6절 끝) |
| `clues`, `accusation`, `hints`, `triggers`, `debrief` | 7~11절 |
| `ending` | 마지막 장면: 마지막 보고서와 해설 사이 15~30초 (15절, 선택) |
| `opening` | 첫 3분: 브리핑 장면과 "오늘 할 일" 체크리스트 (12절, 선택) |
| `shell`, `rail`, `desktop` | 튜토리얼 장치: 허용 명령 목록, 레일(동료가 다음 명령을 알려 줌), 아이콘 해금 (13절, 선택) |
| `boot` | 잠금 화면 문구 `status`, `unlock`(버튼), `note`. 없으면 Case 3의 보안팀 문구 |
| `deadTabs` | 끊긴 원격 세션으로 보이는 터미널 탭 이름들(분위기용) |
| `goal` | 선택. "이번 사건에서 밝혀낼 것" 카드의 첫 줄 `intro`. 카드 본문은 보고서 칸(`title` + `prompt`)에서 만들어진다 (8절) |
| `tour` | 선택. 도구 안내(코치 마크) 단계들 (13절) |

## 3. hosts

```ts
{
  name: 'pay-api-01', user: 'eunjae', ip: '10.20.1.11',
  motd: ['ssh 접속 시 보이는 줄'],
  files: [{ path: '/home/eunjae/bin/ledger-backup.sh', content: '…', mode: '755', mtime: '2022-03-04T17:20' }],
  crontabs: { eunjae: '15 3 * * 6 …' },              // crontab -l [-u 사용자]
  groups: { 'git-admins': { gid: 1050, members: ['eunjae', 'jhpark'] } },   // getent group, id
  procs: [{ pid: 2817, user: 'payapi', cmd: '…', fdCount: 1947, limitNofile: 4096 }],  // /proc/<pid>/fd, fdinfo, limits, pgrep, ps
  // fdSample: 앞쪽 fd 의 대상 경로. "… (deleted)" 로 끝나는 것은 deleted: [{ path, size, owner, group, mode, mtime, ino }] 로
  // 크기를 준다 — ls -lL /proc/<pid>/fd/<n> (링크 수 0), du -L, /proc/<pid>/fdinfo/<n> 의 pos(.log 는 append 라 pos = 크기)
  units: [{ name: 'payment-api.service', unitFile: '…', props: { LimitNOFILE: '4096' }, statusLines: [] }],  // systemctl
  repos: [{ path: '/srv/git/pay-config.git', branch: 'main', refs: { main: '<sha>' }, commits: [...] }],     // git
  last: ['sjkang   pts/1        vpn-10.8.3.41    Sat Nov 14 02:05 - 02:14  (00:09)'],
  df: [...], free: [...], ulimitN: 1024, ssSummary: [...], ssConns: {...}, http: { 'localhost:8080/metrics': '…' },
  sudoRead: true,   // 남의 홈은 700 → sudo로만 읽힘
  env: { PATH: '…:/opt/wiki/bin' },   // 로그인 셸의 환경 (Case 1: ~/.bashrc가 늘린 PATH)
}
```

- 파일의 소유자를 안 쓰면 `/home/<이름>/…`은 그 사람, 나머지는 root. 권한은 8진 문자열(`'600'`).
- `private: true`인 파일은 처음 `cat`할 때 도윤이 한 번 망설인다(같은 명령을 다시 치면 열림, 로그에 남음).
- `binary: '설명'`이면 `cat` 대신 설명이 나온다(PDF, 엑셀).
- `size: 바이트`는 내용보다 훨씬 큰 파일의 겉보기 크기다(Case 0의 11G 로그: 내용은 앞뒤 수십 줄). `ls -l`, `du`가 이 값을 쓰고, 50 MB가 넘는 파일은 `cat`이 "너무 커요, tail로 끝만"이라고 세계관 안에서 거절한다.
- `/etc/group`, `/etc/passwd`, `/etc/hostname`, `/proc/<pid>/…`, `/var/spool/cron/crontabs/<사용자>`, systemd 유닛 파일은 자동 생성된다.
- `env`: 그 호스트에서 세션 사용자의 로그인 셸 환경(기본 `PATH=/usr/local/bin:/usr/bin:/bin` 위에 덮어씀). `echo $PATH`, `env`, `printenv`, `which`, `type`, 그리고 명령 찾기가 이 PATH를 쓴다. 엔진의 도구들은 `/usr/bin`(과 merged `/bin`)에 있는 것으로 치고, 그 밖의 실행 파일(`mode`에 x가 있는 파일, 예: `/opt/wiki/bin/wikictl`)은 PATH로 찾되 실행하지는 않는다("조사 모드: … 실행하지 않아요"). `env -i PATH=/usr/bin:/bin which wikictl`, `PATH=… 명령`처럼 바꾼 환경에서는 같은 이름도 못 찾는다 — cron의 환경을 흉내 내는 방법이다. `/usr/bin/df`처럼 경로로 부르면 그 도구가 돈다. `bash`/`sh`(스크립트 실행)는 막혀 있다.
- git 커밋: `sha`(40자), `parent`, `author`(인물 id), `authorDate`, `commitDate`, `subject`, `body`(트레일러 포함), `diff`. 리뷰 트레일러가 없다는 사실 자체가 단서가 되게 `body`를 비워 둔다.

## 4. timeline — 사건의 뼈대

```ts
{ at: '2026-11-14T03:15:01', note: '작가용 메모(화면에 안 나옴)', emits: [
  { kind: 'journal', host: 'pay-api-01', unit: 'cron.service', ident: 'CRON', pid: 44012, msg: '(eunjae) CMD (…)' },
  { kind: 'log', host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso', line: '{ts} start ledger export …' },
  { kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4984, cmd: 'crontab -l' },
  { kind: 'message', id: 'E05', channel: 'pc-dm-doyun', from: 'eunjae', text: '…', deletedAt: '2026-11-14T02:12' },
]}
```

| kind | 결과 |
|---|---|
| `journal` | `journalctl` 항목. `priority` 3이면 `-p err`에 걸린다. `repeat: { count, everySec }`로 같은 줄 반복 |
| `log` | 파일에 한 줄 추가(시각순 정렬). `format`: `syslog`(Nov 14 03:15:40), `nginx`(14/Nov/2026:02:10:07 +0900), `iso`(2026-11-14 03:15:01), `raw`. `{ts}` 자리에 시각 |
| `history` | 그 사용자의 `~/.bash_history`. `.bashrc`에 `HISTTIMEFORMAT`이 있으면 `#유닉스시각` 줄과 함께 저장되고 `history`가 시각을 보여 준다. `n`을 주면 그 번호에 고정되고, 번호 사이 빈칸은 `historyFill` 생성기가 채운다 |
| `message` | 메신저 메시지. `id`를 캐릭터 시트의 발췌 번호(E01~E10)와 맞추면 대사를 고쳐도 단서 연결이 유지된다. `deletedAt`이면 "삭제된 메시지입니다 · 시각 삭제"로 보인다 |

**타임라인을 고칠 때 지킬 것** (`characters.md` §8-6): 모든 로그·history·메시지 시각은 확정 타임라인과 맞아야 한다. 은재의 새벽 접속은 2026-05 이후 0건이고(`tests/shell.test.ts`가 검사), 서진의 history는 02:05~02:14 밖에 없다.

## 5. generators — 잡음

- `periodic`: 일정 간격의 저널 줄. `steps`로 값이 시각에 따라 바뀐다(풀 상향 전 `open_fds=1398`, 후 `1947`). `skip` 구간은 타임라인이 직접 쓴다.
- `sequence`: 단계 묶음을 `count`번 반복(예: 서진의 리뷰 20건 = GET → comment → comment → approve). `{id}`, `{n}`, `{r2}`, `{r3}` 변수, `daytimeOnly`, `seed`.
- `historyFill`: 고정 번호 사이를 명령 풀에서 뽑아 평일 낮 시각으로 채운다.

모두 시드 고정이라 매번 같은 결과가 나온다.

## 6. 메신저·메일·메모

- `channels`: `account: 'pc'`(은재 PC 세션) 또는 `'me'`(도윤 자신, 넛지가 오는 곳), `kind: 'channel' | 'dm'`, `with`(DM 상대), `draft`(입력창에 남은 보내지 않은 글), `collapseFrom`(알림 37건 접기).
- `mails`: `account`, `folder: 'inbox' | 'drafts'`, `later: true`면 트리거로 나중에 도착, `locked`면 잠긴 초안(비밀번호 힌트 문구).
- `notes`: 도윤 메모장 쪽. `highlight`(트리거로 강조될 줄 번호)와 `reveal`(그 아래 덧붙는 도윤의 한 줄).
- `notifications`: OS 알림 센터 미리보기. Case 3은 02:12에 지워진 서진 메시지 원문이 여기 남는다.

### 대시보드 패널 `panels` (선택)

대시보드 앱(📈)과 증거 보드(📌)는 어두운 패널 격자로 그려진다. `panels`가 있으면 그 데이터로, 없으면 `dashboard` ASCII 줄을 텍스트 패널 하나로 보여 준다(옛 사건은 고칠 필요 없음). 사건마다 다른 UI 코드는 없다 — 화면은 전부 이 데이터와 플레이어의 핀에서 나온다.

| 필드 | 뜻 |
|---|---|
| `title`, `from`, `to`, `stepMin` | 패널 제목(경로 표시), 스냅샷 구간, 샘플 간격(분) |
| `live` | `true`면 `to` 뒤로도 마지막 값이 게임 시계까지 이어지고, 그래프가 시계를 따라 자란다(실시간 버튼으로 멈춤). 없으면 `to`에서 끊기는 보관본 |
| `timeseries[]` | `id`, `title`, `unit`, `min`/`max`, `width: 'full' \| 'half'`, `description`(패널 메뉴 "설명"), `thresholds[]`(`value`, `label` — 점선과 글자로 그려지고 넘는 구간이 글로도 나온다), `series[]` |
| `series[]` | `name`, `color`(green·yellow·red·blue·purple·grey), `points: [시각, 값 \| null][]`(값이 바뀌는 시점만; `null` = 그때부터 데이터 없음), `interp: 'step' \| 'linear'`(기본 step), `jitter`(시드 고정 잡음 비율, 최고점은 넘지 않음) |
| `stats[]` | `title`, `value`(문자열, `null` = "데이터 없음"), `state: 'ok' \| 'warn' \| 'crit' \| 'none'`(색 + 정상/주의/위험 글자), `note` |
| `annotations[]` | 스냅샷 자체에 있던 표시: `at`, `label`, `kind: 'deploy' \| 'cron' \| 'alert' \| 'error' \| 'event'` |
| `marks[]` | 시간 축에 굵게 따로 적을 시각(ASCII 스냅샷의 03:15 · 05:40 같은 눈금) |

ASCII 스냅샷과 같은 내용만 담을 것: 패널은 단서를 새로 알려 주지 않는다. 플레이어가 핀한 증거는 자동으로 주석이 된다 — 시각이 있는 핀은 그 시각에, 크론탭 줄(`15 3 * * 6 …`)은 구간 안의 실행 시각마다 ▲로. 종류(◆ 변경 · ▲ 크론 · ■ 알림 · ✖ 오류·경고 · ● 이벤트)와 로그 레벨(ERR · WARN · INFO)은 핀 글에서 정해진다(`src/ui/dashboard/derive.ts`).

움직임은 조사 중에는 작게만: 새 핀이 보드에 붙는 스냅, 기준선을 넘은 그래프와 위험 스탯의 짧은 깜빡임, 실시간 그래프에 새 점이 들어오는 표시, 동료의 "입력 중…", 알림이 미끄러져 들어오는 것. 모두 1초 미만이고 입력을 막지 않으며, `prefers-reduced-motion`(또는 `?motion=0`)이면 움직임 없이 끝 상태만 보인다(길이는 `src/ui/motion.ts`의 `DUR`). 큰 순간은 셋뿐이다: 사건 시작의 브리핑, 결정적 단서(`aha`, 7절), 보고서 결과(제출해서 해설이 열릴 때의 카드). 셋 다 Esc·클릭으로 넘길 수 있다.

## 7. clues — 단서 감지

```ts
{ id: 'c_cron', label: '보드/로그에 쓰는 이름', slot: 'cause', key: true, trace: true,
  match: [{ output: '15 3 \\* \\* 6 /home/eunjae/bin/ledger-backup\\.sh', host: 'pay-api-01' }] }
```

- `match`: `{ output: 정규식 }`(터미널 출력이나 입력한 줄, 대소문자 무시), `{ open: 'mail:summary' | 'msg:E05' | 'note:farewell' | 'notif:E06' | 'channel:alerts' }`.
- `key: true` = 핵심 증거. 찾으면 "막힘" 타이머가 리셋되고, 보드에 핀하면 ★와 증거 보너스.
- `trace: true` = 1단 힌트(기계 안의 흔적). 처음 닿은 시각이 플레이 로그의 `rung1`.
- `slot`의 핵심 단서를 모두 찾으면 그 칸은 "풀렸다"로 본다(원인 칸이 풀리면 대기 넛지가 멈춤).
- `aha: '한 줄'` = 결정적 단서(사건마다 하나, 핵심 단서 중에서). 처음 찾는 순간 그 문장이 화면 가운데 "큰 순간"으로 한 번 뜬다(💡 카드, 약 1.8초). 입력을 막지 않고(포인터가 통과, 포커스 그대로), Esc나 클릭으로 바로 사라지며, `prefers-reduced-motion`이면 움직임 없이 짧게. 로그에 `aha`. Case 0 `c0_du`, Case 1 `c1_notfound`, Case 2 `c2_deleted`, Case 3 `c_cron`.

`tests/game.test.ts`가 모든 핵심 단서가 실제 명령으로 닿는지 검사한다. 단서를 추가하면 그 테스트의 탐색 목록에 명령을 하나 더한다.

## 8. accusation — 보고서 세 칸

- `slots[].type: 'single'`: 보기 중 `correct: true` 하나.
- `type: 'multi'`: 보기마다 `weight`(+ 시스템 요인과 은폐, − 사람을 범인으로 지목). 음수를 하나도 고르지 않아야 정답이고, 점수는 고른 무게의 합 ÷ 만점 무게 × 100(최대 100).
  - **`picks: N` — 정확히 N개** (2026-11-20 3차 플레이테스트: "8개 중 5개를 다 골라도 100점"). 참인 보기가 N보다 많게 두고, 질문에 "N개를 고르세요"를 쓴다. 정확히 N개, 음수 없음(그리고 `pass`가 있으면 그 이상)이면 정답이다. 만점 무게는 양수 무게가 큰 N개의 합이라 가장 크게 작용한 N개를 고르면 100점, 다른 참인 보기를 섞으면 그보다 조금 낮다. N개를 넘긴 보기 하나마다 `EXTRA_PICK_COST`(25점)를 빼고 칸은 틀린 칸이 된다 — 참인 줄을 다 골라도 100점이 되지 않는다. 보고서는 N개를 고르면 나머지 칸을 잠그고 "k / N개 골랐어요"를 보여 준다. 지금: Case 2 재발 방지 3개(5개 중), Case 3 책임·은폐 4개(7개 중). `tests/senior-tighten.test.ts`가 모든 multi 칸에 `picks`가 있고 넘겨 고르면 100점이 안 되는지 검사한다.
  - `picks`가 없으면 예전 규칙: 양수 합이 `pass` 이상이면 정답, 만점은 양수 무게 전부.
- `blames: '<인물 id>'`: 이 보기를 고르면 그 사람의 목소리로 2단 넛지가 온다.
- **보기는 가설이다.** 한 칸의 보기는 길이와 구체성이 비슷해야 하고(정답이 가장 긴 보기가 되면 안 된다), 하나하나가 엔지니어가 일부 증거만 보고 실제로 내릴 법한 오진이어야 한다. 조사로만 알 수 있는 사실(시각, 크기, 경로, PID, 그룹 이름 …)은 보기에 쓰지 않는다 — 그런 구체는 💡 정답(`hints.answers`)과 해설에 둔다. 브리핑·브리핑 메일·보고서 질문·체크리스트에 이미 나온 사실은 써도 된다. `tests/report-options.test.ts`가 정답이 혼자 가장 긴 칸, 길이가 1.5배 넘게 벌어진 칸, 단서 `label`의 사실(시각·숫자·경로·영문 식별자)을 그 단서 전에 말하는 보기를 잡는다.
- `needs: ['<단서 id 또는 트리거 id>']`: 발견한 사실을 이름으로 부르는 오답(지훈의 nginx 변경, 서진의 승인)은 그 단서를 찾거나 트리거가 터진 뒤에만 보기에 나온다. 정답 보기에는 절대 달지 않는다(새로 나타난 보기가 정답이 되면 안 되니까). 숨은 보기가 있으면 칸 아래에 "조사하다 보면 보기가 늘어날 수 있어요."가 보인다.
- **`evidence`: 칸마다 근거로 인정하는 증거 종류** (`src/engine/evidence.ts`). `[{ id, label, clues }]` — `label`은 증거의 종류("디스크 사용량 (df · du 의 수치)", "실행 기록")이지 답이 아니다. 그 `clues` 중 하나를 증명하는 핀이 그 종류를 채운다(곁가지 단서는 넣지 않는다). 보고서는 칸마다 근거 핀을 하나 이상 고르게 한다. 칸마다 "필요: 보기 하나 · 근거 핀 하나 — 종류 / 종류 중"이 처음부터 보이고, 보기가 없거나 근거 핀이 없거나 고른 핀이 그 칸의 종류가 아닌(△) 칸이 있으면 제출 버튼 옆 "제출 전에" 목록에 나오고 버튼은 막힌다(누르면 그 목록을 보여 주는 안내만 뜨고 제출 횟수는 쓰지 않는다). 엔진은 여전히 종류를 못 채운 칸을 보기가 맞아도 틀린 칸(0점)으로 센다. 증거 보드 맨 위 "보고서 근거" 패널이 칸마다 종류를 ✓ 있음 / ○ 아직 없음으로 보여 주고, 핀 줄마다 채우는 종류가 붙는다. 해설은 칸마다 고른 근거와 그 판정을 보여 준다.
- `maxSubmissions`: 3. `0`이면 무제한(Case 0).
- `slots`는 세 칸 중 필요한 것만 둔다(Case 0은 `cause`, `sequence` 두 칸). 점수 만점은 칸 수 × 100 + 증거 보너스 30.
- **목표 카드 "이번 사건에서 밝혀낼 것"** (`src/engine/goal.ts`): 보고서 칸의 `title`과 `prompt`만으로 만든다 — 보기 문장은 절대 안 나온다. 위 줄은 `goal.intro`(없으면 "보고서 N칸… 제출은 N번까지"). 작업 표시줄 🎯, ❓ 도움말 맨 위, 그리고 `goal`이 있는 사건은 "오늘 할 일" 포스트잇의 🎯 줄에서 늘 열린다(Case 1~3).
- `intro`(보고서 맨 위 한 줄)와 `reply`(`from`, `sign`, `lines`)로 "오미래 CTO의 회신" 틀을 사건에 맞게 바꾼다(Case 0–2는 서진).
- `feedback`: 틀린 보고서에 어떻게 답하나. 어느 방식이든 회신과 각 칸 제목에 칸마다 ✓/✗ 가 붙는다(점수는 제출 횟수만큼 그대로 깎인다). 기본 `'marks'`: ✓/✗ 와 짧은 한 줄(`reply.lines`를 제출마다 돌아가며, 없으면 CTO 문장). `'hints'`(Case 0–2 기본 경로): 서진이 칸마다 무엇이 안 맞는지 말한다 — 맞은 칸은 "맞아요", 틀린 칸은 칸의 성격(원인 / 순서·시각 / 빠진 요인·섞인 항목)과, 그 칸에 아직 핀이 없는 증거 종류 하나. 보기는 말하지 않고, 같은 줄이 연달아 나오지 않게 제출마다 문장이 바뀐다. 숙련자 모드는 `'marks'`. 오답 뒤 2단 넛지(`hints.wrong`)는 두 방식 모두 그대로 온다.
- 점수에서 힌트는 빠지지 않는다. 해설과 결과 카드는 기록("힌트 단계 N개 · 소요 · 명령 수", "힌트 단계 0" 배지; 💡 패널을 연 횟수는 따로 "세지 않음"으로만 보이고 기록·배지에 들어가지 않음)을 보여 준다. 숙련자 모드(`?senior=1` 또는 첫 실행의 선택)일 때만 방향의 `cost`와 정답의 `answerCost`(기본 30)를 뺀다. 사건 파일의 `expert` 칸(`ExpertDef`: 제출 횟수, 기준 시간, 바꿀 문장, 더할 파일·`df`·타임라인·단서·보기, 그리고 바꿀 기록 — `history`(그 호스트·사용자의 history를 통째로 바꿈), `crontabs`, `mails`(같은 id면 바꿈), `terminalTabs`, `stickies`)은 그 모드에서만 씌워진다. 숙련자 모드의 기록은 기본 길의 절반 이하이고, 사건을 푸는 명령을 그대로 적은 파일이 하나도 없어야 한다(`tests/senior-tighten.test.ts`) — 설계는 [`campaign-ladder.md`](campaign-ladder.md) 3-1절.

## 9. hints — 사다리

- `idleMinutes`: 원인 칸이 안 풀린 채 핵심 단서 진전이 없으면 이 시간 뒤 `idle[]`를 차례로 보낸다(`unlessClues`를 이미 다 찾았으면 건너뜀). 하나 보낸 뒤 다시 같은 시간을 기다린다. Case 0은 2분, 본편은 6분. **직전 1분 안에 아무 단서라도 찾았으면 보류**한다(곧 풀 사람을 끊지 않기, `HOLD_MS`).
- 터미널에서 `hint`를 치면 💡 패널이 열린다(모든 사건).
- `wrong`: 잘못 고발했을 때. 키는 지목당한 인물 id, 없으면 `default`. 각각 한 번만.
- **💡 패널(3단)**: 칸마다 ① 요약 → ② 방향 → ③ 정답, 순서대로만 열린다.
  - ① 요약은 자동: 그 칸(`slot`)에서 찾은 단서의 `label`(핵심 단서 먼저). 무료, `hint-summary`로 기록.
  - ② 방향 = `explicit[]`(`slot`, `text`, `cost`, 선택 `unlessClues`, 선택 `compare`). 방향 하나는 두 부분이다: **볼 곳**(`text`: 호스트·탭, 명령, 파일, 패널, 그리고 📌할 줄과 그 칸의 근거 종류)과 **비교할 것**(`compare`: 거기서 무엇과 무엇을 나란히 놓을지, 또는 그 사실을 보기에 어떻게 대 볼지. 결론은 적지 않는다). 순서: 볼 곳을 연 방향의 비교할 것 → 아직 다 못 찾은 `unlessClues`를 가진 방향의 볼 곳(사건 파일 순서) → `unlessClues`를 이미 다 찾은 방향의 비교할 것(볼 곳은 건너뜀) → 남은 볼 곳. 부분 하나에 힌트 단계 1개, 숙련자 모드에서는 부분마다 `cost`. `unlessClues`가 있는 방향은 `compare`도 있어야 하고, 볼 곳을 글자 그대로 따라 하면 그 단서가 모두 나와야 하며, 어느 부분도 정답 보기나 `answers`를 그대로 옮기지 않는다(`tests/hint-directions.test.ts`).
  - ③ 정답 = 그 칸의 정답 보기 문장(다중 칸은 가중치가 양수인 보기 목록), 이어서 `answers[slot]`(보기가 말하지 않는 구체: 시각, 파일, 숫자)과 "📌 근거로 인정: …"(그 칸의 `evidence` 종류). UI가 한 번 더 묻는다. 힌트 1회.
  - `objectivePanel: true`(Case 0): 체크리스트가 열려 있는 동안 지금 차례인 항목이 맨 위에 온다(요약 = 체크한 항목, 방향 = 항목의 `direction`, 없으면 `hint`, 정답 = 항목의 `answer`, 없으면 "터미널에 그대로 치세요: {next}"). 감점은 언제나 0. 체크리스트의 `text`·`hint`와 레일의 `say`·`next`는 단계마다 넛지 한 줄이고 명령을 그대로 적지 않는다. 정확한 명령은 은재의 기록(history, README)과 💡의 방향(도구 이름)·정답(명령)에만 둔다(`tests/case0.test.ts`가 검사).
  - 방향·정답은 `rung3` 이벤트(`key`, `rung`, 방향이면 비교할 것일 때 `part: 'compare'`, `cost`)로 로그에 남고 기록의 "힌트 단계 N개"가 된다. 패널 열기(`hint-panel` 이벤트)와 요약은 세지 않는다(`PlayRecord.panelOpens`로 따로 보임).
- `ask`: 메신저 입력창의 빠른 답장(2단을 요청형으로). `prompts`(예: `['뭐부터 봐요?', '막혔어요']`)를 누르면 다음 `idle` 넛지가 **기다림 없이** 그 넛지의 `from`/`channel`로 온다(`askText`가 있으면 그 문장: 묻지도 않았는데 하는 말투를 피할 때). 남은 넛지가 없으면 `none`. `rail` 템플릿이 있으면 체크리스트가 열려 있는 동안 레일 동료가 `{next}`로 지금 볼 단계를 답하고 history·💡를 가리킨다(Case 0). 무료, `ask`/`rung2`(`why: 'ask'`)로 기록하고, 대기 넛지 타이머는 그때부터 다시 잰다. 메신저는 답할 사람을 "→ 박지훈님이 답해요"로 미리 보여 준다.
- **입력 중…**: 플레이어가 아닌 사람의 실시간 메시지(넛지, 레일, 트리거)는 도착 전 1–2초(1초 + 글자당 20ms, 최대 2초) 동안 "OO님이 입력 중"을 보인다. 지연(`delaySec`)이 없는 트리거 메시지도 그만큼 늦게 도착한다.
- 넛지 대사는 `characters.md` §8-1 보이스 치트시트를 따른다. 은재는 넛지를 주지 않는다(은재의 넛지는 이미 기계 안에 있다).

## 10. triggers — 살아 있는 장면

- `message.deleteAfterSec`: 보낸 사람이 그만큼 뒤에 지운다(썼다 지움). 채널에는 "삭제된 메시지입니다 · 삭제 시각"이 남고 로그에 `unsend`. 알림 토스트에는 원문이 이미 떠 있었을 수 있다(그것도 단서다). Case 3: 플레이어가 지훈의 18:02 커밋(`s_commit`)을 보면 "ㅋㅋ 설마 제 커밋 보시는 거예요??"가 왔다가 3초 뒤 지워지고 "아 아니에요 ㅋㅋ 도윤님 화이팅!! 👍"가 온다(`characters.md` §8-1 "ㅋㅋ 설마").

```ts
{ id: 'jihoon-confess', when: { allClues: ['r_group', 'r_hook'] }, actions: [
  { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 14, text: '확인했습니다.' } } ] }
```

`when`: `{ clue }`, `{ allClues: [] }`, `{ afterMin }`(플레이 시간 기준). `actions`: `message`(지연 가능), `mail`(later 메일 배달), `note`(메모 강조 + 메모장 열림), `toast`.

## 11. debrief — 해설

`headline`, `story[]`(실제 타임라인), `systemFactors[]`, `principle`(이 사건이 가르치는 원칙 하나), `cards[]`(현업 명령 카드: 제목, 명령, 설명), `closingMail`(엔딩 메일 id), `doyunLine`, `cast[]`(인물 카드).

해설은 감정이 먼저다: 제목 → 도윤의 메모장 장면 → 사람들 카드 → (접힌) 점수와 기록 → 실제로 일어난 일 → 무엇이 가능하게 했나 → 원칙 → 명령 카드 → 도윤 한마디.

## 12. opening — 첫 3분 (브리핑 + 오늘 할 일)

메인테이너의 첫 플레이 피드백("뭘 해야 할지 모르겠네")에서 나온 칸이다. 없으면 예전처럼 잠금 해제 직후 바탕화면이 뜬다.

```ts
opening: {
  briefing: {
    lockTime: '09:00', lockDate: '11월 16일 월요일',
    caller: 'jihoon', kind: 'voice',            // 'voice' = 음성 메시지, 'call' = 보이스톡
    voiceCue: 'voice.briefing-jihun',           // public/audio/voice/ 의 파일 이름 (src/engine/voices.ts 가 큐로 등록). 파일이 있으면 재생하고 자막 속도를 그 길이에 맞춘다
    lines: [{ text: '도윤님~ 굿모닝요!! 지훈이에요 ㅋㅋ', pauseMs: 1000 }, …],  // 자막 = 메신저 말풍선처럼 한 글자씩
    mail: 'brief', mailPreview: '…오늘 21:00까지 부탁드립니다.',               // 끝에 미끄러져 들어오는 메일 알림
  },
  objectives: {
    title: '오늘 할 일',
    items: [
      { id: 'terminal', text: '열린 터미널 확인', hint: '…터미널 창을 눌러 보세요.', any: [{ interact: 'terminal' }], pulse: 'terminal' },
      { id: 'last-command', text: '선배가 마지막에 친 명령 찾기', any: [{ clue: 'c_history' }, { output: '갔다 와서 마저', host: 'pay-api-01' }] },
      { id: 'pins', text: '증거 3개 핀 → 보고서 쓰기', any: [{ pins: 3 }] },
    ],
    after: ['다음: …'],   // 접힌 뒤 메모장 "오늘 할 일 ✓" 쪽 아래에 붙는 다음 할 일
  },
}
```

**브리핑** (`src/ui/briefing.ts`): 잠금 화면 3초 → 음성 메시지 카드(진동) 2.2초 → 자막 타이핑(글자당 72ms + 줄마다 `pauseMs`) → 메일 알림 4.2초 → 바탕화면이 드러난다. Case 3은 약 31초. 본편은 30~60초, Case 0 튜토리얼은 20초 이하로 줄 길이를 맞춘다(`tests/objectives.test.ts`가 같은 계산으로 검사). Esc나 "건너뛰기"로 언제든 끝나고, ❓ 도움말에서 다시 볼 수 있다. 브리핑 동안은 플레이 시간이 멈추고, 힌트 사다리 2단(대기 넛지) 타이머는 브리핑이 끝난 시각부터 잰다. 대사는 사건 본문이라 사건 파일에, 버튼·라벨은 `src/i18n.ts`에 둔다. 인물 목소리는 `characters.md` §8-1을 따른다(오미래는 메일로만).

**오늘 할 일** (`src/engine/objectives.ts`, 순수 상태 기계): 항목마다 `any` 조건 중 하나가 맞으면 체크된다. 순서와 상관없이 체크될 수 있다.

| 조건 | 언제 맞나 |
|---|---|
| `{ interact: '<앱 id>' }` | 그 앱 창 안을 플레이어가 클릭하거나 키를 눌렀을 때 (창이 열리면서 자동으로 포커스되는 것은 세지 않는다) |
| `{ cmd: '정규식', host? }` | 입력한 명령 줄이 맞을 때. `''`이면 아무 명령 |
| `{ output: '정규식', host? }` | 명령 출력 줄 하나가 맞을 때 (입력한 줄은 제외) |
| `{ clue: '<단서 id>' }` | 그 단서를 찾았을 때 |
| `{ open: '<키>' }` | `mail:brief`, `note:farewell` 등 7절의 open 키를 열었을 때 |
| `{ pins: n }` | 보고서 근거로 세지는 핀(어느 칸이든 `evidence` 종류를 채우는 핀, 종류가 없는 사건은 모든 핀)이 n개 이상이고, 종류가 있는 칸마다 그 칸을 뒷받침하는 핀이 하나 이상 있을 때 (원인 핀만 n개로는 안 된다 — 보고서가 칸마다 근거를 묻기 때문). 포스트잇은 그 항목에 (n/N)과, 차례일 때 칸마다 세지는 종류를 ✓/○로 보여 준다 |

- `hint`: 지금 차례인(처음으로 안 체크된) 항목 아래에만 작게 보이는 비계(scaffolding). 체크되면 사라진다.
- `pulse`: 지금 차례인 항목이 이 값을 가지면 그 앱 창(닫혀 있으면 바탕화면 아이콘)이 숨 쉬듯 빛난다. Case 3은 첫 항목만 터미널을 가리키고, 터미널의 남은 입력 `crontab -`도 함께 깜빡인다.
- 체크 하나마다 `sfx.tick`, 셋 다 끝나면 `sfx.done`과 함께 포스트잇이 메모장 아이콘 쪽으로 접혀 들어가고, 메모장 맨 위에 `"<title> ✓"` 쪽이 생긴다. 그 뒤로는 펄스·힌트 줄이 모두 멈춘다.
- 플레이 로그에는 `objective`, `interact`, `briefing`, `objectives-folded`, `meaningful`(증거를 처음 보여 준 명령) 이벤트가 남고, `summary.firstMinutes`에 모인다(`docs/playtest.md` Q8~Q12).

사건 2를 만들 때는 그 사건의 첫 동선에 맞춰 항목 3개 안팎을 고른다. 첫 항목은 "눈에 보이는 첫 클릭"(`interact` + `pulse`), 둘째는 은재의 흔적 한 줄을 처음 보는 순간(`clue`/`output`), 셋째는 증거 보드 사용(`pins`)이 무난하다.

## 13. 튜토리얼 장치 (Case 0) · 도구 안내 (Case 1)

웹 방탈출 분석(설계 노트, 저장소에 없음, §9)의 "미리 준비된 첫 행동, 화면 위 선택지 줄이기, 막히기 전에 말 거는 동료"를 데이터로 켠다. 모두 선택 칸이다.

```ts
shell: {
  allow: ['ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'grep', 'df', 'du', 'history', 'systemctl', 'journalctl', 'man', 'help', 'hint', 'clear'],
  refuse: "튜토리얼 세션: '{cmd}' 은(는) 오늘 연습 범위 밖이에요 …",   // 목록 밖의 진짜 명령(ps, sudo, vim…)
  help: ['…'],                                                        // help 출력 대체
},
rail: { from: 'jihoon', channel: 'me-dm-jihoon', offRail: '그건 나중에요 ㅋㅋ {next}부터 봐요!!', quiet: ['help', 'man'], done: '…', highlightClues: true },
desktop: { icons: [{ app: 'terminal' }, { app: 'messenger' }, { app: 'mail' }, { app: 'notes', after: 'df' }, …] },
// opening.objectives.items[] 에 say(그 항목 차례가 되면 레일 동료가 보내는 말), next(되돌림·답에 넣을 단계 이름, 명령 아님),
// direction(💡 방향: 도구 이름), answer(💡 정답: 명령), onTrack(단서가 새로 안 나와도 그 단계로 가는 중인 명령 줄 정규식)
```

- `shell.allow`: 이 명령만 돈다. 목록 밖의 **진짜** 명령은 `refuse` 문장으로 답하고(`blocked` 마찰로 기록), 없는 명령은 예전처럼 `command not found` + 목록 안에서 고른 "혹시 …인가요?". Tab 자동완성도 목록만.
- `rail`: 항목이 체크돼 다음 항목이 차례가 되면 1.5초 뒤 그 항목의 `say`가 `from`의 메시지로 온다(모두 끝나면 `done`). 단서도 체크도 못 만든 명령에는 차례인 항목마다 **한 번만** `offRail`(`{next}` = 그 항목의 `next`)이 온다(`rail-redirect` 이벤트). `quiet` 명령과 그 항목의 `onTrack` 정규식에 맞는 명령 줄(예: Case 0 "누가 채웠나"의 `du -sh /var/log/wiki/*`)은 세지 않는다. `highlightClues`면 단서 정규식에 걸리는 터미널 줄이 노랗게 표시된다.
- `desktop.icons`: 아이콘 순서와 해금 조건. `after`가 없는 아이콘만 처음에 보이고, 나머지는 그 항목이 체크되거나 체크리스트가 접히면 나타난다. 아이콘이 없어도 메시지 알림이나 보드의 "보고서 쓰기"로는 창이 열린다.
- 은재는 레일 동료가 될 수 없다(§8-3, 실시간 대사 없음). `tests/case0.test.ts`가 검사한다.

**도구 안내 `tour` (코치 마크, Case 0)** — 메인테이너 요청(2026-11-20) "이건 메모장 이건 대시보드 이건 모를 때 보는 거, 그리고 최종적으로 이거 푸는 거구나를 알아야 몰입이", 플레이테스트 뒤 "가이드는 case0에 나왔어야하는거 아냐?". 레일과 달리 명령을 알려 주지 않고 **도구가 무엇에 쓰는지**만 한 번씩 말한다. 도구 마크는 튜토리얼(Case 0)에 있고, 각 마크는 그 아이콘이 해금되는 체크 항목(`desktop.icons[].after`)과 같은 `after`를 써서 아이콘이 나오는 순간 뜬다(💡는 첫 체크 항목 뒤). 뒤 사건의 `tour`에는 그 사건에서 처음 나오는 도구와 🎯 목표만 넣는다(Case 1은 `goal` 하나, Case 2·3은 없음).

```ts
tour: { steps: [
  { id: 'terminal', app: 'terminal', title: '터미널', text: '서버에 명령을 치는 곳. …' },   // 처음부터 있는 아이콘
  { id: 'hint', app: 'hint', title: '💡 힌트', text: '막힐 때 보는 곳. …', after: 'history' },
  { id: 'notes', app: 'notes', title: '메모장', text: '단서 정리. …', after: 'df' },   // 메모장 아이콘과 같은 체크 항목 뒤
] }
// Case 1: tour: { steps: [{ id: 'goal', app: 'goal', title: '🎯 이번 사건에서 밝혀낼 것', … }] }
// afterMin: n (플레이 n분 뒤)도 쓸 수 있다
```

- 기준점은 앱 id 하나뿐이다: 열린 창 → 바탕화면 아이콘 → 작업 표시줄의 `data-tour="<id>"`(`hint`, `goal`, `help`) 순으로 찾는다. 화면 구조(보드·대시보드 마크업)에 묶이지 않는다.
- 한 번에 하나, 데이터 순서대로, 조건(`after` 체크 항목, `afterMin` 분, 기준점이 화면에 있음)이 맞는 첫 단계. 아이콘이 아직 안 나온 단계는 건너뛰었다가 나오면 보인다(`src/engine/tour.ts`, `tests/tour.test.ts`).
- 막지 않는다: 덮개 없음, 포커스를 가져가지 않음(터미널 입력이 그대로). "알겠어요"·Esc로 닫고, 15초 뒤에는 저절로 닫히며(본 것으로 침), "투어 건너뛰기"는 그 사건의 나머지를 모두 끈다. 본 단계 id는 사건을 가리지 않고 `no-handover:tour` 하나에 남아(같은 id는 어느 사건에서도 다시 뜨지 않는다), 건너뛰기는 `no-handover:tour:<사건 id>`에 남고, `?fresh=1`이 둘 다 지운다. 로그: `tour-step`, `tour-skip`. 첫 실행에서 "터미널이 익숙해요"를 고른 플레이어(`src/engine/experience.ts`)에게는 마크가 뜨지 않고, 같은 줄들이 작업 표시줄 🧭 도구 안내(❓에도 있음)에 목록으로 모인다(튜토리얼의 도구 마크 + 그 사건의 마크). 사건 데이터는 그대로 쓴다.
- `role="dialog"`(`aria-modal="false"`) + 제목·본문 연결, 버튼은 Tab으로 닿는다.

## 14. 새 사건 체크리스트

1. 원칙 하나를 정한다(설계 제약: 리눅스/IT 공통 분모. Case 3은 "프로세스별 열린 파일 한도, 소켓도 파일", Case 0은 "로그는 디스크를 채운다", Case 1은 "cron은 로그인 셸이 아니다", Case 2는 "지운 파일도 열려 있으면 공간을 차지한다").
2. 확정 타임라인 표를 먼저 쓰고 `timeline`으로 옮긴다.
3. 은재 history에 "알아보면 풀리는 한 줄"을 숨기지 않고 둔다.
4. 칸마다 핵심 단서 2~5개, 각 단서는 서로 다른 명령으로 닿게(같은 명령으로 두 용의자를 동시에 확인하지 않게).
5. 넛지·트리거 대사는 보이스 치트시트로 검토.
6. `opening`: 브리핑 대사(30~60초), 오늘 할 일 3개, 새 음성 줄이 있으면 `src/audio/manifest.ts`와 큐 시트(설계 노트)에 id 추가.
6-1. 결정적 단서 하나에 `aha`, 사건에 `goal.intro`. 주니어 사건이면 `tour`도.
7. `src/cases/index.ts`의 `CAMPAIGN`에서 자리(`slot`)의 `cs`를 채운다. 자리만 있던 "준비 중" 칸이 플레이 가능한 사건이 된다.
8. 대시보드가 있으면 `panels`를 ASCII 스냅샷과 같은 내용으로 채운다(선택).
9. `npm test` (무결성·도달 가능성 테스트), `npm run build && npm run e2e`.

## 15. ending — 마지막 장면 (보고서 뒤, 해설 앞)

마지막 보고서(정답이거나 제출 소진) 뒤, 해설이 열리기 전에 15~30초 장면이 흐른다. 점수표가 아니라 기분으로 사건이 끝나게 하려는 장치다(엔딩 리서치 §5-1). 엔진은 `src/engine/game.ts`(`startEnding`, `skipEnding`), 화면은 `src/main.ts`.

- `ending.beats[]`: 차례대로, 각 비트는 앞 비트가 "도착한" 뒤 `wait`초에 나온다(동료는 먼저 "입력 중…", 메모장 줄은 한 글자씩 쓰이는 시간까지 기다린다). 첫 비트는 결과 문구(2.2초)가 지나간 뒤.
  - `{ message: { channel, from, text } }` — 동료 DM. 다른 동료 말처럼 음성이 붙는다(`src/engine/voices.ts`가 목록에 넣고, `tests/voices.test.ts`가 파일을 요구한다). 메신저가 그 채널로 열린다.
  - `{ note, line? }` — 도윤의 메모장이 그 페이지로 열리고 `line`이 맨 아래에 한 글자씩 쓰인다(`{hm}` = 게임 시계). `line`이 없으면 그 페이지의 `reveal` 줄을 다시 쓴다.
  - `{ mail }` — 그 메일이 도착하고(아직이면) 열린다.
  - `{ act: { tab, prefill, until, timeoutSec?, sticky?, note? } }` — 플레이어가 한다: 그 터미널 탭 프롬프트에 `prefill`이 쳐져 있고 터미널이 빛나며, `until`에 맞는 명령을 치면 `note`(메모장 한 줄)가 쓰이고 장면이 이어진다. `timeoutSec`(기본 25초)이 지나면 아무것도 쓰지 않고 이어진다.
  - `unless: '<트리거 id>'` — 그 트리거가 이미 났으면 건너뛰는 비트(Case 4: 사인을 이미 찾았으면 사인 장면을 건너뜀).
- 화면 아래 막대의 **해설 바로 보기**나 Esc로 건너뛴다: 남은 비트가 소리 없이 한꺼번에 도착하고(act는 하지 않은 것으로) 해설이 열린다. 다시 불러와도 장면은 이어서 돌고, 끝난 장면은 다시 돌지 않는다. 보고서 창은 장면 동안 "보고서를 보냈어요"만 보여 준다.
- 은재는 말하지 않는다: 은재는 도윤이 메모장에 적는 몸짓으로만 나온다(`tests/ending.test.ts`가 은재가 보내는 메시지를 막는다).

