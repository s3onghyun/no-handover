// Case 0 (tutorial) — 「위키가 안 열려요」
// Ladder and framing: docs/campaign-ladder.md. Characters and voices: the character sheet in the design notes (not in this repo).
// All people, hosts, companies and logs are fictional. Read docs/case-format.md before editing.
//
// Framing: Tuesday 2026-11-10, the departed senior's last week. Seojin (Doyun's mentor) hands the
// wiki outage to Doyun as a "look only" exercise; Eunjae goes into a handover meeting until 10:30
// and leaves their PC open on a read-only investigation session. Eunjae never speaks live
// (characters.md §8-3): only the mail sent before the meeting, ~/README.txt, and `#` lines in
// ~/.bash_history. Live voices are Seojin (briefing, idle nudges, reply) and Jihoon, who walks the
// player along the rail (what to look at next, one redirect per step when off track). The exact
// command path lives only in Eunjae's records (history, README) and the 💡 panel's 정답.
// The first command is pre-typed and succeeds: `history` (web-escape analysis §9 #1, #7).
//
// One cause: the wiki's thumbnail worker retries a broken PDF with no delay and writes the whole
// traceback to /var/log/wiki/wiki.log every time. That file has no logrotate rule; overnight it
// grows ~11G and fills /var (20G). At 08:47 the wiki cannot write its session or its log, exits,
// and systemd gives up after five restarts. The fix is explained in the debrief, never executed.

import type { CaseFile, Emit, TimelineEvent } from '../engine/types.ts';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
/** The runaway log. 670 attempts/s × ~400 bytes each × 11.5 h ≈ 11G. */
export const WIKI_LOG_BYTES = Math.round(11.2 * GiB);
const LOOP_START = Date.UTC(2026, 10, 9, 21, 14, 3);
const PER_SEC = 670;

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** Retry attempt number the worker had reached at a local wall-clock time (UTC-encoded, like the engine). */
const attemptAt = (y: number, mo: number, d: number, h: number, mi: number, s: number) => Math.max(1, Math.floor(((Date.UTC(y, mo - 1, d, h, mi, s) - LOOP_START) / 1000) * PER_SEC));

const failure = (stamp: string, attempt: number) => [
  `${stamp} WARN thumbnail attach/8812 failed: PDF parse error (xref table broken) — retrying (attempt ${grouped(attempt)})`,
  'Traceback (most recent call last):',
  '  File "/opt/wiki/lib/thumbs.py", line 88, in render',
  '    doc = pdf.open(path)',
  '  File "/opt/wiki/lib/pdf.py", line 214, in open',
  '    raise PdfParseError("xref table broken")',
  'wiki.thumbs.PdfParseError: xref table broken',
];

/** Sample content of the 11G log: its 2023 beginning, the night's loop, and the cut-off last line. */
function wikiLog(): string {
  const at = (d: number, h: number, mi: number, s: number) => attemptAt(2026, 11, d, h, mi, s);
  const lines = [
    '2023-04-03 10:31:52 INFO wiki-server 1.4.0 started (log_file=/var/log/wiki/wiki.log)',
    '2023-04-03 10:31:52 INFO thumbnail worker ready (retry_delay_sec=0)',
    '2023-04-03 10:33:10 INFO GET /wiki/Home 200 (eunjae)',
    '2023-04-03 10:35:41 INFO page created: Home (eunjae)',
    '2023-04-04 09:12:03 INFO GET /wiki/RB-001 200 (sjkang)',
    '2023-04-04 09:40:17 INFO page created: RB-001 결제 API 재시작 절차 (sjkang)',
    '2026-11-02 08:00:13 INFO wiki-server 1.4.2 started (log_file=/var/log/wiki/wiki.log)',
    '2026-11-05 14:02:51 INFO GET /wiki/RB-001 200 (dyhan)',
    '2026-11-09 03:00:05 INFO nightly search index refreshed (1,284 pages)',
    '2026-11-09 17:40:22 INFO GET /wiki/RB-019 200 (sjkang)',
    '2026-11-09 21:10:11 INFO GET /wiki/결제팀-주간회의 200 (jhpark)',
    '2026-11-09 21:14:02 INFO upload attach/8812 주간회의_1109.pdf (2.4 MB) by jhpark',
    ...failure('2026-11-09 21:14:03', 1),
    ...failure('2026-11-09 21:14:03', 2),
    ...failure('2026-11-09 21:14:03', 3),
    ...failure('2026-11-09 23:30:00', at(9, 23, 30, 0)),
    '2026-11-10 03:00:05 INFO nightly search index refreshed (1,285 pages)',
    ...failure('2026-11-10 03:00:05', at(10, 3, 0, 5)),
    ...failure('2026-11-10 06:12:44', at(10, 6, 12, 44)),
    ...failure('2026-11-10 08:47:11', at(10, 8, 47, 11)),
    ...failure('2026-11-10 08:47:12', at(10, 8, 47, 12) - 1),
    ...failure('2026-11-10 08:47:12', at(10, 8, 47, 12)),
    '2026-11-10 08:47:12 ERROR session save failed: [Errno 28] No space left on device',
    // the disk filled in the middle of a write
    `2026-11-10 08:47:12 WARN thumbnail attach/8812 failed: PDF parse error (xref tab`,
  ];
  return lines.join('\n');
}

const ACCESS_LOG = [
  '10.20.5.17 - sjkang [09/Nov/2026:17:40:22 +0900] "GET /wiki/RB-019 HTTP/1.1" 200 18233 "-" "Mozilla/5.0"',
  '10.20.5.41 - dyhan [09/Nov/2026:18:02:10 +0900] "GET /wiki/용어집 HTTP/1.1" 200 9120 "-" "Mozilla/5.0"',
  '10.20.5.33 - jhpark [09/Nov/2026:21:10:11 +0900] "GET /wiki/%EA%B2%B0%EC%A0%9C%ED%8C%80-%EC%A3%BC%EA%B0%84%ED%9A%8C%EC%9D%98 HTTP/1.1" 200 7731 "-" "Mozilla/5.0"',
  '10.20.5.33 - jhpark [09/Nov/2026:21:14:01 +0900] "POST /attach?page=weekly-1109 HTTP/1.1" 200 412 "-" "Mozilla/5.0"',
  '10.20.5.33 - jhpark [09/Nov/2026:21:14:09 +0900] "GET /attach/8812/thumb HTTP/1.1" 202 31 "-" "Mozilla/5.0"',
  '10.20.5.33 - jhpark [09/Nov/2026:21:15:40 +0900] "GET /attach/8812/thumb HTTP/1.1" 202 31 "-" "Mozilla/5.0"',
  '10.20.5.17 - - [10/Nov/2026:08:46:58 +0900] "GET /wiki/RB-019 HTTP/1.1" 200 18233 "-" "Mozilla/5.0"',
  '10.20.5.29 - - [10/Nov/2026:08:47:20 +0900] "GET /wiki/Home HTTP/1.1" 502 166 "-" "Mozilla/5.0"',
  '10.20.9.2 - - [10/Nov/2026:08:49:05 +0900] "GET /healthz HTTP/1.1" 502 166 "-" "nuri-monitor/2.1"',
  '10.20.5.17 - - [10/Nov/2026:09:02:13 +0900] "GET /wiki/RB-019 HTTP/1.1" 502 166 "-" "Mozilla/5.0"',
  '10.20.5.33 - - [10/Nov/2026:09:03:02 +0900] "GET /wiki/%EA%B2%B0%EC%A0%9C%ED%8C%80-%EC%A3%BC%EA%B0%84%ED%9A%8C%EC%9D%98 HTTP/1.1" 502 166 "-" "Mozilla/5.0"',
  '10.20.9.2 - - [10/Nov/2026:09:29:05 +0900] "GET /healthz HTTP/1.1" 502 166 "-" "nuri-monitor/2.1"',
].join('\n');

const NGINX_ERROR = [
  '2026/11/10 08:47:20 [error] 911#911: *88213 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.5.29, server: wiki.nuricloud.example, request: "GET /wiki/Home HTTP/1.1", upstream: "http://127.0.0.1:8090/wiki/Home"',
  '2026/11/10 09:02:13 [error] 911#911: *88240 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.5.17, server: wiki.nuricloud.example, request: "GET /wiki/RB-019 HTTP/1.1", upstream: "http://127.0.0.1:8090/wiki/RB-019"',
  '2026/11/10 09:29:05 [error] 911#911: *88302 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.9.2, server: wiki.nuricloud.example, request: "GET /healthz HTTP/1.1", upstream: "http://127.0.0.1:8090/healthz"',
].join('\n');

const EUNJAE_BASHRC = `# ~/.bashrc — eunjae (wiki-01)
[ -z "$PS1" ] && return
export HISTTIMEFORMAT='%F %T '
export HISTSIZE=100000
shopt -s histappend
PS1='\\u@\\h:\\w\\$ '
alias ll='ls -alh'

# 다음 사람: 이 아래는 지워도 돼요
alias 디스크='df -h; du -sh /var/log/* 2>/dev/null'
alias 물주기='echo 🌱'`;

const README = `wiki-01 — 다음 사람에게 (남은재, 2023-04 처음 씀 / 2025-06 고침)

왜: 사내 위키 서버. 서진님 런북(RB-001~)이 여기 있어요.
    위키가 죽으면 런북도 못 봐요… 그래서 이 메모는 위키가 아니라 서버에 둡니다.

장애 나면 제 순서 (2025-06 디스크 장애 때 정리):
  1. df -h                 디스크부터. Use% 100% 인 줄이 있나? 어디(Mounted on)가 찼나?
  2. du -sh /var/log/*     꽉 찬 곳 안에서 누가 큰가? (더 들어가려면 du -sh /var/log/<폴더>/*)
  3. tail -n 20 <큰 파일>   그 파일 끝에 같은 줄이 계속 반복되나? 반복하는 쪽이 쓰는 쪽이에요.
  4. systemctl status wiki  서비스는 살아 있나? 맨 아래 몇 줄에 멈춘 이유가 있어요.
  5. journalctl -u wiki    언제부터였나? 시간을 먼저 적어요. 사람은 그다음.

참고로… 위키 로그(/var/log/wiki/wiki.log)는 아직 logrotate에 안 걸려 있어요. TODO (2023-04).
조사할 때는 아무것도 지우지 마세요. 고치는 건 원인을 적고 나서. :)`;

const WIKI_UNIT = `[Unit]
Description=Nuri Wiki (사내 위키)
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
User=wiki
ExecStart=/opt/wiki/bin/wiki-server --config /etc/wiki/wiki.conf
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target`;

const WIKI_STATUS = [
  '× wiki.service - Nuri Wiki (사내 위키)',
  '     Loaded: loaded (/etc/systemd/system/wiki.service; enabled; vendor preset: enabled)',
  '     Active: failed (Result: exit-code) since Tue 2026-11-10 08:47:41 KST; 42min ago',
  '    Process: 51875 ExecStart=/opt/wiki/bin/wiki-server --config /etc/wiki/wiki.conf (code=exited, status=1/FAILURE)',
  '   Main PID: 51875 (code=exited, status=1/FAILURE)',
  '        CPU: 1.204s',
  '',
  'Nov 10 08:47:38 wiki-01 systemd[1]: wiki.service: Scheduled restart job, restart counter is at 5.',
  'Nov 10 08:47:38 wiki-01 systemd[1]: Started Nuri Wiki (사내 위키).',
  "Nov 10 08:47:41 wiki-01 wiki-server[51875]: OSError: [Errno 28] No space left on device: '/var/log/wiki/wiki.log'",
  'Nov 10 08:47:41 wiki-01 systemd[1]: wiki.service: Main process exited, code=exited, status=1/FAILURE',
  'Nov 10 08:47:41 wiki-01 systemd[1]: wiki.service: Start request repeated too quickly.',
  "Nov 10 08:47:41 wiki-01 systemd[1]: wiki.service: Failed with result 'exit-code'.",
  'Nov 10 08:47:41 wiki-01 systemd[1]: Failed to start Nuri Wiki (사내 위키).',
];

const NGINX_STATUS = [
  '● nginx.service - A high performance web server and a reverse proxy server',
  '     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)',
  '     Active: active (running) since Mon 2026-11-02 08:00:11 KST; 1 week 1 day ago',
  '   Main PID: 911 (nginx)',
  '      Tasks: 3 (limit: 4585)',
  '     Memory: 9.8M',
  '        CPU: 41.233s',
  '     CGroup: /system.slice/nginx.service',
  '             ├─911 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"',
  '             └─912 "nginx: worker process"',
];

const LOGROTATE_NGINX = `/var/log/nginx/*.log {
\tdaily
\tmissingok
\trotate 14
\tcompress
\tdelaycompress
\tnotifempty
\tcreate 0640 www-data adm
\tsharedscripts
\tpostrotate
\t\tinvoke-rc.d nginx rotate >/dev/null 2>&1
\tendscript
}`;

const W = 'wiki-01';
const j = (unit: string, msg: string, extra: Partial<Extract<Emit, { kind: 'journal' }>> = {}): Emit => ({ kind: 'journal', host: W, unit, msg, ...extra });
const wiki = (msg: string, priority = 6, pid = 1423) => j('wiki.service', msg, { ident: 'wiki-server', pid, priority });
const sysd = (msg: string, priority = 6) => j('wiki.service', msg, { ident: 'systemd', pid: 1, priority });
const hist = (cmd: string): Emit => ({ kind: 'history', host: W, user: 'eunjae', cmd });

/** journald rate-limits the loop: one "Suppressed" line an hour through the night. */
function nightEvents(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (let k = 0; k < 11; k++) {
    const h = (21 + k + 1) % 24;
    const day = 21 + k + 1 >= 24 ? '10' : '09';
    out.push({ at: `2026-11-${day}T${String(h).padStart(2, '0')}:14:33`, emits: [j('wiki.service', `Suppressed ${grouped(19_811 + ((k * 37) % 61))} messages from wiki.service`, { ident: 'systemd-journald', pid: 298 })] });
  }
  for (let d = 3; d <= 10; d++) out.push({ at: `2026-11-${String(d).padStart(2, '0')}T03:00:05`, emits: [wiki(`INFO nightly search index refreshed (${grouped(1275 + d)} pages)`)] });
  return out;
}

/** Five restarts, each failing on the full disk, then systemd gives up. */
function restartEvents(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (let k = 1; k <= 5; k++) {
    const t0 = 13 + k * 5; // 08:47:18, :23, :28, :33, :38
    out.push({ at: `2026-11-10T08:47:${t0}`, emits: [sysd(`wiki.service: Scheduled restart job, restart counter is at ${k}.`), sysd('Started Nuri Wiki (사내 위키).')] });
    out.push({ at: `2026-11-10T08:47:${t0 + 3}`, emits: [wiki("OSError: [Errno 28] No space left on device: '/var/log/wiki/wiki.log'", 3, 51870 + k), sysd('wiki.service: Main process exited, code=exited, status=1/FAILURE', 4)] });
  }
  out.push({ at: '2026-11-10T08:47:41', emits: [sysd('wiki.service: Start request repeated too quickly.', 3), sysd("wiki.service: Failed with result 'exit-code'.", 4), sysd('Failed to start Nuri Wiki (사내 위키).', 3)] });
  return out;
}

const sized = (path: string, size: number, binary: string, owner = 'root', mode = '644') => ({ path, content: '', size, binary, owner, mode });

export const caseZeroWiki: CaseFile = {
  id: 'case0-wiki',
  title: '위키가 안 열려요',
  subtitle: '화요일 08:47, 사내 위키가 멈췄다. 서진의 런북도 같이 멈췄다. 원인만 찾으면 된다.',
  company: '누리클라우드',
  domain: 'nuricloud.example',
  clock: { start: '2026-11-10T09:30:00', deadline: '2026-11-10T10:30:00', tz: '+09:00', rate: 6 },
  player: 'doyun',
  owner: 'eunjae',

  people: {
    doyun: { name: '한도윤', role: '인프라팀 · 입사 2주차 (나)', initial: '도', color: '#2F3E5C', login: 'dyhan', avatar: 'characters/doyun-avatar.webp', avatarSmall: 'characters/doyun-avatar-64.webp', portrait: 'characters/doyun-full.webp' },
    seojin: { name: '강서진', role: '시니어 SRE · 도윤의 사수', initial: '서', color: '#3A3D42', login: 'sjkang', avatar: 'characters/seojin-avatar.webp', avatarSmall: 'characters/seojin-avatar-64.webp', portrait: 'characters/seojin-full.webp' },
    jihoon: { name: '박지훈', role: '결제개발팀 리드', initial: '지', color: '#F08A3C', login: 'jhpark', avatar: 'characters/jihun-avatar.webp', avatarSmall: 'characters/jihun-avatar-64.webp', portrait: 'characters/jihun-full.webp' },
    eunjae: { name: '남은재', role: '수석 엔지니어 · 11/13 퇴사 예정', initial: '은', color: '#6B7350', login: 'eunjae', avatar: 'characters/eunjae-avatar.webp', avatarSmall: 'characters/eunjae-avatar-64.webp', portrait: 'characters/eunjae-full.webp' },
    bot: { name: '알림봇', role: '모니터링', initial: '⚠', color: '#9A9A9A' },
    wikibot: { name: '위키 알림', role: '', initial: 'W', color: '#8A8580' },
    hr: { name: '인사팀', role: '', initial: '인', color: '#8A8580' },
  },

  // ------------------------------------------------------------------ the one host
  hosts: [
    {
      name: W,
      user: 'eunjae',
      ip: '10.20.3.21',
      motd: ['Nuri wiki-01 (Ubuntu 22.04 LTS) — 사내 위키', '조사 모드 (읽기 전용, 연습용) — 명령 목록: help'],
      uptime: 'up 8 days,  1:30,  1 user,  load average: 0.02, 0.05, 0.04',
      groups: { adm: { gid: 4, members: ['eunjae'] }, 'systemd-journal': { gid: 101, members: ['eunjae'] }, wiki: { gid: 998, members: [] } },
      df: [
        'Filesystem      Size  Used Avail Use% Mounted on',
        'tmpfs           392M  1.1M  391M   1% /run',
        '/dev/sda1        30G  7.9G   21G  28% /',
        'tmpfs           2.0G     0  2.0G   0% /dev/shm',
        '/dev/sdb1        20G   19G     0 100% /var',
        'tmpfs           392M  4.0K  392M   1% /run/user/1001',
      ],
      units: [
        { name: 'wiki.service', unitFile: WIKI_UNIT, props: { Description: 'Nuri Wiki (사내 위키)', ActiveState: 'failed', SubState: 'failed', Restart: 'on-failure', RestartUSec: '5s', StartLimitBurst: '5', NRestarts: '5', Result: 'exit-code' }, statusLines: WIKI_STATUS },
        { name: 'nginx.service', unitFile: '[Unit]\nDescription=A high performance web server and a reverse proxy server\n\n[Service]\nType=forking\nExecStart=/usr/sbin/nginx -g \'daemon on; master_process on;\'', pid: 911, props: { Description: 'A high performance web server and a reverse proxy server', ActiveState: 'active', SubState: 'running', MainPID: '911' }, statusLines: NGINX_STATUS },
      ],
      files: [
        { path: '/home/eunjae/.bashrc', content: EUNJAE_BASHRC, mtime: '2025-06-17T10:40' },
        { path: '/home/eunjae/README.txt', content: README, mtime: '2025-06-17T10:35' },
        { path: '/etc/wiki/wiki.conf', content: '# Nuri Wiki — 2023-04 eunjae\nlisten = 127.0.0.1:8090\ndata_dir = /var/lib/wiki\nsession_dir = /var/lib/wiki/sessions\nlog_file = /var/log/wiki/wiki.log\nlog_level = info\n\n[thumbnail]\nenabled = true\nretry_delay_sec = 0      # 기본값 그대로\n', mtime: '2023-04-03T10:28' },
        { path: '/etc/logrotate.conf', content: 'weekly\nrotate 4\ncreate\ninclude /etc/logrotate.d', mtime: '2023-04-03T09:50' },
        { path: '/etc/logrotate.d/nginx', content: LOGROTATE_NGINX, mtime: '2023-04-03T10:05' },
        { path: '/etc/logrotate.d/rsyslog', content: '/var/log/syslog\n/var/log/auth.log\n/var/log/kern.log\n{\n\trotate 4\n\tweekly\n\tmissingok\n\tcompress\n}', mtime: '2023-04-03T09:50' },
        { path: '/etc/logrotate.d/apt', content: '/var/log/apt/history.log {\n  rotate 12\n  monthly\n  compress\n  missingok\n}', mtime: '2023-04-03T09:50' },
        { path: '/etc/logrotate.d/dpkg', content: '/var/log/dpkg.log {\n\tmonthly\n\trotate 12\n\tcompress\n\tmissingok\n}', mtime: '2023-04-03T09:50' },
        { path: '/opt/wiki/bin/wiki-server', content: '', binary: '바이너리 파일입니다 (실행 파일)', mode: '755', mtime: '2026-11-02T07:58' },
        {
          path: '/opt/wiki/lib/thumbs.py',
          content: '# 첨부 미리보기(썸네일) 작업\nimport logging, time\nfrom wiki import pdf, config\n\nlog = logging.getLogger("wiki.thumbs")\n\ndef worker(queue):\n    while True:\n        job = queue.next()\n        try:\n            render(job)\n        except Exception:\n            log.warning("thumbnail %s failed — retrying", job, exc_info=True)\n            time.sleep(config.thumbnail.retry_delay_sec)   # 0 이면 쉬지 않고 다시\n            queue.retry(job)\n',
          mtime: '2026-11-02T07:58',
        },
        { path: '/var/log/wiki/wiki.log', content: wikiLog(), size: WIKI_LOG_BYTES, owner: 'wiki', group: 'adm', mode: '640', mtime: '2026-11-10T08:47' },
        { path: '/var/log/nginx/access.log', content: ACCESS_LOG, size: 118 * MiB, owner: 'www-data', group: 'adm', mode: '640', mtime: '2026-11-10T09:29' },
        { path: '/var/log/nginx/error.log', content: NGINX_ERROR, size: Math.round(2.1 * MiB), owner: 'www-data', group: 'adm', mode: '640', mtime: '2026-11-10T09:29' },
        { path: '/var/log/syslog', content: 'Nov 10 09:22:01 wiki-01 systemd-logind[640]: New session 412 of user eunjae.\nNov 10 09:22:01 wiki-01 systemd[1]: Started Session 412 of User eunjae.', size: 38 * MiB, group: 'adm', mode: '640', mtime: '2026-11-10T09:22' },
        { path: '/var/log/auth.log', content: 'Nov 10 09:22:01 wiki-01 sshd[51990]: Accepted publickey for eunjae from 10.20.5.12 port 51544 ssh2', size: Math.round(1.2 * MiB), group: 'adm', mode: '640', mtime: '2026-11-10T09:22' },
        { path: '/var/log/kern.log', content: 'Nov  2 08:00:02 wiki-01 kernel: [    0.000000] Linux version 5.15.0-125-generic', size: 410_000, group: 'adm', mode: '640', mtime: '2026-11-02T08:00' },
        { path: '/var/log/apt/history.log', content: 'Start-Date: 2026-11-02  07:58:12\nCommandline: apt-get install -y nuri-wiki=1.4.2\nUpgrade: nuri-wiki:amd64 (1.4.1, 1.4.2)\nEnd-Date: 2026-11-02  07:58:40', size: 60_000, mtime: '2026-11-02T07:58' },
        sized('/var/log/journal/3f9c2e17b84d4a5e/system.journal', 480 * MiB, 'journald 바이너리 파일입니다. journalctl 로 읽으세요.', 'root', '640'),
        sized('/var/log/journal/3f9c2e17b84d4a5e/user-1001.journal', 32 * MiB, 'journald 바이너리 파일입니다. journalctl 로 읽으세요.', 'root', '640'),
        sized('/var/lib/wiki/uploads/2023/objects.pack', Math.round(0.9 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/uploads/2024/objects.pack', Math.round(1.4 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/uploads/2025/objects.pack', Math.round(1.9 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/uploads/2026/objects.pack', Math.round(1.2 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/search/index.db', 380 * MiB, '검색 색인 (바이너리)', 'wiki', '640'),
        { path: '/var/lib/wiki/sessions/.keep', content: '', owner: 'wiki', mode: '640' },
        sized('/var/lib/apt/lists/archive.ubuntu.com_ubuntu_dists_jammy_main_binary-amd64_Packages', 120 * MiB, 'apt 패키지 목록'),
        sized('/var/lib/apt/lists/archive.ubuntu.com_ubuntu_dists_jammy-updates_main_binary-amd64_Packages', 90 * MiB, 'apt 패키지 목록'),
        sized('/var/lib/dpkg/status', Math.round(2.3 * MiB), 'dpkg 상태 파일'),
        sized('/var/cache/apt/archives/linux-firmware_20220329.git681281e4-0ubuntu3.36_all.deb', 600 * MiB, '.deb 패키지 (바이너리)'),
        sized('/var/cache/apt/archives/linux-modules-extra-5.15.0-125-generic_5.15.0-125.135_amd64.deb', 550 * MiB, '.deb 패키지 (바이너리)'),
        sized('/var/cache/apt/archives/nuri-wiki_1.4.2_amd64.deb', 437 * MiB, '.deb 패키지 (바이너리)'),
        sized('/var/backups/dpkg.status.0', Math.round(1.1 * MiB), '백업된 dpkg 상태'),
      ],
    },
  ],

  // ------------------------------------------------------------------ timeline
  timeline: [
    // Eunjae's history on wiki-01: the 2023 install, the 2025-06 disk incident (the order to copy), today.
    { at: '2023-04-03T10:02:11', emits: [hist('sudo apt-get install -y nginx python3-venv')] },
    { at: '2023-04-03T10:20:40', emits: [hist('sudo mkdir -p /opt/wiki /var/lib/wiki /var/log/wiki')] },
    { at: '2023-04-03T10:31:50', emits: [hist('sudo systemctl enable --now wiki')] },
    { at: '2023-04-03T10:32:05', emits: [hist('systemctl status wiki')] },
    { at: '2023-04-03T10:40:12', emits: [hist('ls /etc/logrotate.d/')] },
    { at: '2023-04-03T10:41:03', emits: [hist('# TODO: wiki 로그 logrotate 규칙 — 다음에. (지금은 작으니까)')] },
    { at: '2024-02-14T14:05:30', emits: [hist('df -h')] },
    { at: '2024-02-14T14:05:41', emits: [hist('uptime')] },
    { at: '2025-06-17T10:12:02', emits: [hist('df -h')] },
    { at: '2025-06-17T10:12:30', emits: [hist('# /var 97%. 디스크 먼저. 그다음 누가 쓰는지.')] },
    { at: '2025-06-17T10:13:04', emits: [hist('du -sh /var/log/*')] },
    { at: '2025-06-17T10:14:10', emits: [hist('du -sh /var/log/nginx/*')] },
    { at: '2025-06-17T10:15:22', emits: [hist('tail -n 20 /var/log/nginx/access.log')] },
    { at: '2025-06-17T10:16:01', emits: [hist('# 크롤러가 밤새 긁었음. 같은 줄이 반복되면 그게 쓰는 쪽.')] },
    { at: '2025-06-17T10:18:45', emits: [hist('systemctl status nginx')] },
    { at: '2025-06-17T10:20:13', emits: [hist('journalctl -u nginx --since "2025-06-17 08:00"')] },
    { at: '2025-06-17T10:31:40', emits: [hist('# 순서: df → du → tail → systemctl status → journalctl. README에도 적어 둠.')] },
    { at: '2026-10-20T15:10:09', emits: [hist('uptime')] },
    { at: '2026-11-10T09:22:10', emits: [hist('systemctl status wiki')] },
    { at: '2026-11-10T09:22:40', emits: [hist('# 도윤님 연습용으로 그대로 둠. 위 순서대로 보면 돼요 🌱')] },

    // the service's journal
    { at: '2026-11-02T08:00:12', emits: [sysd('Started Nuri Wiki (사내 위키).')] },
    { at: '2026-11-02T08:00:13', emits: [wiki('INFO wiki-server 1.4.2 listening on 127.0.0.1:8090')] },
    { at: '2026-11-09T21:14:02', emits: [wiki('INFO upload attach/8812 주간회의_1109.pdf (2.4 MB) by jhpark')] },
    { at: '2026-11-09T21:14:03', note: 'the loop starts: no delay between retries', emits: [wiki('WARN thumbnail attach/8812 failed: PDF parse error (xref table broken) — retrying (attempt 1)', 4)] },
    ...nightEvents(),
    { at: '2026-11-10T08:47:12', note: '/var is full', emits: [wiki('ERROR session save failed: [Errno 28] No space left on device', 3)] },
    { at: '2026-11-10T08:47:13', emits: [wiki('CRITICAL cannot write /var/log/wiki/wiki.log: [Errno 28] No space left on device — shutting down', 2), sysd('wiki.service: Main process exited, code=exited, status=1/FAILURE', 4)] },
    ...restartEvents(),
    { at: '2026-11-10T09:22:01', emits: [j('systemd-logind.service', 'New session 412 of user eunjae.', { ident: 'systemd-logind', pid: 640 })] },

    // messenger
    { at: '2026-11-10T08:49:05', emits: [{ kind: 'message', channel: 'pc-infra', from: 'bot', text: '[P3] wiki.nuricloud.example 응답 없음 (HTTP 502) · 08:47부터' }] },
    { at: '2026-11-10T09:02:30', emits: [{ kind: 'message', channel: 'pc-infra', from: 'seojin', text: '위키 502예요. 런북 안 열려요.' }] },
    { at: '2026-11-10T09:03:10', emits: [{ kind: 'message', channel: 'pc-infra', from: 'jihoon', text: '헉 저도요 ㅋㅋ 어제 회의록 올렸는데 날아간 거 아니죠?? 😂' }] },
    { at: '2026-11-10T09:03:22', emits: [{ kind: 'message', channel: 'pc-infra', from: 'jihoon', text: '주간회의 정리 진짜 열심히 했는데 🙏' }] },
    { at: '2026-11-10T09:18:04', emits: [{ kind: 'message', channel: 'pc-infra', from: 'seojin', text: '도윤님 연습으로 보게 할게요. 원인만. 고치는 건 제가.' }] },
    { at: '2026-11-10T09:19:40', emits: [{ kind: 'message', channel: 'pc-infra', from: 'eunjae', text: '네, 제 자리 PC 열어 둘게요. 저는 10시 반까지 회의예요… 🌱' }] },
    { at: '2026-11-10T09:20:12', emits: [{ kind: 'message', channel: 'pc-dm-seojin', from: 'seojin', text: '선배 PC 써도 돼요?' }] },
    { at: '2026-11-10T09:21:03', emits: [{ kind: 'message', channel: 'pc-dm-seojin', from: 'eunjae', text: '그럼요. 오늘부터 2주는 도윤님 자리인걸요. 조사 세션으로 열어 둘게요. 읽기 전용이라 아무것도 안 망가져요 :)' }] },
    { at: '2026-11-10T09:21:20', emits: [{ kind: 'message', channel: 'pc-dm-seojin', from: 'seojin', text: '고마워요.' }] },
    { at: '2026-11-10T09:25:41', emits: [{ kind: 'message', channel: 'me-dm-seojin', from: 'seojin', text: '오른쪽 위 할 일부터. 막히면 저한테.' }] },
    { at: '2026-11-10T09:27:10', emits: [{ kind: 'message', channel: 'me-dm-jihoon', from: 'jihoon', text: '도윤님!! 서진님 바쁘셔서 제가 옆에서 봐 드릴게요 ㅋㅋ 저도 위키 써야 돼서요 🙏' }] },
    { at: '2026-11-10T09:27:18', emits: [{ kind: 'message', channel: 'me-dm-jihoon', from: 'jihoon', text: '터미널에 history 쳐져 있죠? Enter만 누르면 돼요~' }] },
  ],

  generators: [],

  // ------------------------------------------------------------------ messenger, mail, notes
  channels: [
    { id: 'pc-infra', account: 'pc', kind: 'channel', title: '#인프라' },
    { id: 'pc-dm-seojin', account: 'pc', kind: 'dm', title: '강서진', with: 'seojin' },
    { id: 'me-dm-seojin', account: 'me', kind: 'dm', title: '강서진', with: 'seojin' },
    { id: 'me-dm-jihoon', account: 'me', kind: 'dm', title: '박지훈', with: 'jihoon' },
  ],

  mails: [
    {
      id: 'brief', account: 'me', folder: 'inbox', from: 'eunjae', to: '한도윤', cc: '강서진', at: '2026-11-10T09:24',
      subject: '[연습] 위키 502 — 제 자리 PC 쓰세요',
      body: '도윤님,\n저 10시 반까지 인수인계 회의예요… 서진님이 위키 원인 찾기를 도윤님 연습으로 맡기셨대요.\n\n- 제 자리 PC에 조사 세션(읽기 전용) 열어 뒀어요. 오늘부터 2주(11/23까지)는 도윤님이 이 자리를 맡아요. 후임 오실 때까지 임시로요. 미리 익혀 두면 좋겠어요.\n- 아무것도 안 망가져요. 지우거나 재시작하는 명령은 막혀 있어요.\n- 막히면 history 보세요. 제가 장애 볼 때 치는 순서가 거기 그대로 있어요. ~/README.txt 에도요.\n\n로그는 봤어요? 를 먼저 물어보세요. 자기한테요 :)\n\n남은재 🌱',
    },
    {
      id: 'closing', account: 'me', folder: 'inbox', from: 'seojin', to: '한도윤', cc: '남은재', at: '2026-11-10T10:31', later: true,
      subject: 'RE: 위키 502 원인',
      body: '봤어요.\n- 원인: /var 100%, wiki.log 11G. 맞아요.\n- 경위: 월 21:14부터 재시도. 08:47 꽉 참. 맞아요.\n\n재시도 끄고 로그 비웠어요. 위키 살아났어요.\nlogrotate 규칙은 제가. 디스크 80% 알림도.\n숙제: 위키 인증서 자동 갱신을 서버 cron 으로. 지금은 은재 선배 노트북에서 돌아요. 오늘 밤 걸어 봐요.\nRB-019에 df 순서 추가할게요.\n\n강서진',
    },
    {
      id: 'wiki-upload', account: 'pc', folder: 'inbox', from: 'wikibot', to: '인프라팀', at: '2026-11-09T21:14',
      subject: '[위키] 새 첨부: 주간회의_1109.pdf (박지훈)',
      body: '결제팀-주간회의 페이지에 새 첨부가 올라왔습니다.\n\n- 파일: 주간회의_1109.pdf (2.4 MB)\n- 첨부 번호: attach/8812\n- 올린 사람: 박지훈\n- 미리보기: 생성 중…\n\n이 메일은 위키 알림 설정에 따라 발송됩니다.',
    },
    {
      id: 'hr', account: 'pc', folder: 'inbox', from: 'hr', to: '남은재', at: '2026-11-02T10:00',
      subject: '[인사] 퇴사 일정 안내 (11/13)',
      body: '남은재님,\n퇴사일(11/13 금) 일정을 안내드립니다.\n\n- 인수인계 회의: 11/10(화) 09:30–10:30, 11/12(목) 14:00\n- 장비 반납: 11/13 17:00\n- 계정 회수: 11/16(월) 보안팀 일정에 따라\n\n인사팀',
    },
  ],

  notes: [
    {
      id: 'today', title: '11/10 (화) 위키 502 — 연습!!',
      lines: ['서진님: 원인만 찾기. 고치는 건 서진님. 10:30까지.', '은재님 순서 = history 에 있음 (?)', '1. 무슨 일  2. 언제  3. 왜', '점심: 지훈님 (12시?)'],
      highlight: 1, reveal: '→ 디스크 → 제일 큰 파일 → 그 끝 → 서비스. 알았음!',
    },
    { id: 'seat', title: '11/09 (월) 서진님 1:1', lines: ['내일부터 2주(11/10~11/23) 은재님 자리 맡기. 후임 올 때까지 임시', '이번 주: 은재님 PC로 연습 (은재님 옆) / 다음 주: 혼자 (!!)', '11/24부터 다시 내 자리 + 온콜 교육'] },
    { id: 'runbook', title: '11/05 (목) 서진님 런북 투어', lines: ['런북은 서진님이 다 씀. RB-001부터.', "서진님 말: '문서에 없는 건 없는 거예요.'", '런북은 위키에 있음 → 위키가 죽으면? (?)'] },
    { id: 'ot', title: '11/02 (월) 입사 OT', lines: ['온콜 = 밤에 전화 받는 사람(?)', 'fd = 에프디(?) → 회사 이름 아님'] },
  ],

  stickies: [{ text: '도윤님 —\n막히면 history 🌱', x: 74, y: 70, color: '#C9E4B4' }],

  // three icons at first (terminal, messenger, mail); the rest appear as the checklist progresses
  desktop: {
    icons: [
      { app: 'terminal' },
      { app: 'messenger' },
      { app: 'mail' },
      { app: 'notes', after: 'df' },
      { app: 'board', after: 'tail' },
      { app: 'dashboard', after: 'service' },
      { app: 'report', after: 'pins' },
    ],
  },

  // a coach mark per tool, shown once at the moment its icon unlocks (owner feedback 2026-11-20:
  // the tour belongs in the tutorial). Step ids are shared across cases, so a seen mark never repeats.
  tour: {
    steps: [
      { id: 'terminal', app: 'terminal', title: '터미널', text: '서버에 명령을 치는 곳. 증거는 대부분 여기서 나와요. help 로 쓸 수 있는 명령을 봐요.' },
      { id: 'messenger', app: 'messenger', title: '메신저', text: '동료들의 말. 막히면 입력창 위 "뭐부터 봐요?" 로 물어볼 수 있어요.' },
      { id: 'mail', app: 'mail', title: '메일', text: '브리핑 메일과 지난 기록. 은재님이 남긴 메일도 여기 있어요.' },
      { id: 'hint', app: 'hint', title: '💡 힌트', text: '막힐 때 보는 곳. 요약 → 방향 → 정답 순서로 열려요. 점수는 그대로, 기록만 남아요.', after: 'history' },
      { id: 'notes', app: 'notes', title: '메모장', text: '단서 정리. 도윤의 메모와 배운 것. 단서를 찾으면 저절로 넘어가기도 해요.', after: 'df' },
      { id: 'board', app: 'board', title: '증거 보드', text: '📌 한 줄이 시간순으로 모이는 곳. 보고서는 여기서 시작해요.', after: 'tail' },
      { id: 'dashboard', app: 'dashboard', title: '대시보드', text: '지표와 타임라인. "언제부터였나"를 한눈에 봐요.', after: 'service' },
      { id: 'report', app: 'report', title: '📝 보고서', text: '마지막 단계. 칸을 고르고 제출하면 서진님이 답해요.', after: 'pins' },
    ],
  },

  notifications: [
    { id: 'n-alert', at: '2026-11-10T08:49', app: '메신저', title: '알림봇 · #인프라', text: '[P3] wiki.nuricloud.example 응답 없음 (HTTP 502)' },
    { id: 'n-upload', at: '2026-11-09T21:14', app: '메일', title: '위키 알림', text: '[위키] 새 첨부: 주간회의_1109.pdf (박지훈)' },
  ],

  terminalTabs: [
    {
      label: 'wiki-01', host: W, cwd: '/home/eunjae', prefill: 'history',
      scrollback: [
        'Nuri wiki-01 (Ubuntu 22.04 LTS) — 사내 위키',
        '조사 모드 (읽기 전용, 연습용) — 명령 목록: help',
        'eunjae@wiki-01:~$ # 도윤님, 여기서 시작해요. Enter 를 누르면 제가 장애 때 친 순서가 나와요 🌱',
      ],
    },
  ],

  dashboard: [
    '사내 위키 — 대시보드 스냅샷 (월 11/09 18:00 ~ 화 11/10 09:30, 보관본)',
    '',
    '응답 (요청/분)',
    ' 40 ┤▅▅▃▃▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▂▃▅▆',
    ' 20 ┤██████████████████████████████████▏          ▇▇▇▇▇▇▇▇ 502',
    '  0 ┼──────────────────────────────────────────────────────',
    '    18:00  21:14                            08:47     09:30',
    '',
    '응답 시간 p50: 120ms → 08:47 이후 응답 없음 (502, nginx 앞단만 살아 있음)',
    '디스크: (패널 없음 — wiki-01은 디스크 사용량을 수집하지 않습니다)',
  ],

  // the same snapshot as structured panels (drawn by the dashboard app; pins appear as annotations)
  panels: {
    title: '사내 위키 · wiki-01',
    from: '2026-11-09T18:00',
    to: '2026-11-10T09:30',
    stepMin: 5,
    live: true,
    marks: ['2026-11-09T21:14', '2026-11-10T08:47'],
    stats: [
      { title: '응답 시간 p50', value: '응답 없음', state: 'crit', note: '08:47 전까지 120ms' },
      { title: 'HTTP 502', value: '08:47부터', state: 'crit', note: 'nginx 앞단만 살아 있음' },
      { title: '디스크', value: null, note: 'wiki-01은 디스크 사용량을 수집하지 않습니다' },
    ],
    timeseries: [
      {
        id: 'req', title: '응답 (요청/분)', unit: '/분', min: 0, max: 45,
        series: [
          { name: '2xx', color: 'green', jitter: 0.06, interp: 'linear', points: [['2026-11-09T18:00', 36], ['2026-11-09T19:30', 22], ['2026-11-10T08:10', 22], ['2026-11-10T08:46', 30], ['2026-11-10T08:47', null]] },
          { name: '502', color: 'red', jitter: 0.06, interp: 'linear', points: [['2026-11-09T18:00', 0], ['2026-11-10T08:46', 0], ['2026-11-10T08:47', 18], ['2026-11-10T09:30', 34]] },
        ],
      },
      {
        id: 'p50', title: '응답 시간 p50', unit: 'ms', min: 0, max: 200, width: 'half',
        description: '08:47 이후에는 응답이 없어 값이 없습니다 (502는 nginx가 대신 답한 것).',
        series: [{ name: 'p50', color: 'blue', jitter: 0.08, points: [['2026-11-09T18:00', 120], ['2026-11-10T08:47', null]] }],
      },
      { id: 'disk', title: '디스크 사용량', unit: '%', min: 0, max: 100, width: 'half', description: 'wiki-01은 디스크 사용량을 수집하지 않습니다.', series: [{ name: '/var', color: 'yellow', points: [] }] },
    ],
  },

  // ------------------------------------------------------------------ clues
  clues: [
    { id: 'c0_df', label: 'df -h: /var 100% (/ 는 28%)', slot: 'cause', key: true, match: [{ output: '^/dev/sdb1\\s+20G\\s+19G\\s+0\\s+100%\\s+/var$', host: W }] },
    {
      id: 'c0_du', label: 'du / ls -lh: /var/log/wiki/wiki.log 11G', slot: 'cause', key: true,
      aha: '찾았다 — /var 를 채운 건 wiki.log 하나, 11G.',
      match: [
        { output: '^11G\\s+\\S*wiki\\S*$', host: W },
        { output: `^${Math.ceil(WIKI_LOG_BYTES / 4096) * 4}\\s+\\S*wiki\\S*$`, host: W },
        { output: `\\s(11G|${WIKI_LOG_BYTES})\\s.*wiki\\.log$`, host: W },
      ],
    },
    { id: 'c0_loop', label: 'tail: 같은 미리보기 오류가 쉬지 않고 반복 (attempt 수천만)', slot: 'cause', key: true, match: [{ output: 'retrying \\(attempt \\d{1,3}(,\\d{3}){2,}\\)', host: W }] },
    { id: 'c0_status', label: 'systemctl status wiki: failed — No space left on device', slot: 'cause', key: true, match: [{ output: 'Active: failed \\(Result: exit-code\\)', host: W }, { output: 'No space left on device', host: W }] },
    { id: 'c0_root_ok', label: 'df -h: / 는 28% — 찬 곳은 /var 하나', slot: 'cause', match: [{ output: '^/dev/sda1\\s+30G.*28%\\s+/$', host: W }] },
    { id: 'c0_hist', label: '은재 history: "# /var 97%. 디스크 먼저. 그다음 누가 쓰는지."', slot: 'cause', trace: true, match: [{ output: '# /var 97%\\. 디스크 먼저', host: W }] },
    { id: 'c0_today', label: '은재 history 09:22: "도윤님 연습용으로 그대로 둠"', slot: 'cause', trace: true, match: [{ output: '도윤님 연습용으로 그대로 둠', host: W }] },
    { id: 'c0_readme', label: '~/README.txt: "장애 나면 제 순서"', slot: 'cause', trace: true, match: [{ output: '장애 나면 제 순서', host: W }] },

    { id: 'c0_start', label: '월 21:14:03 미리보기 재시도 시작 (attach/8812)', slot: 'sequence', key: true, match: [{ output: '(Nov 09 21:14:0[23]|2026-11-09 21:14:0[23]).*(thumbnail|attach/8812)', host: W }] },
    { id: 'c0_full', label: '화 08:47:12 No space left on device — 위키 종료', slot: 'sequence', key: true, match: [{ output: '(Nov 10 08:47:1\\d|2026-11-10 08:47:1\\d).*(No space left|Errno 28)', host: W }] },
    { id: 'c0_upload', label: '월 21:14 지훈의 회의록 PDF 업로드 (미리보기: 생성 중…)', slot: 'sequence', match: [{ output: '09/Nov/2026:21:14:01 .*POST /attach', host: W }, { open: 'mail:wiki-upload' }] },
    { id: 'c0_suppressed', label: 'journald: "Suppressed … messages" — 밤새 같은 메시지 폭주', slot: 'sequence', match: [{ output: 'Suppressed [\\d,]+ messages from wiki\\.service', host: W }] },
    { id: 'c0_norotate', label: 'wiki.log 가 2023-04부터 한 파일 — 회전 규칙 없음', slot: 'sequence', match: [{ output: '^2023-04-03 10:31:52 INFO wiki-server 1\\.4\\.0 started', host: W }, { output: 'TODO: wiki 로그 logrotate', host: W }] },
  ],

  // ------------------------------------------------------------------ report (two slots, unlimited)
  accusation: {
    maxSubmissions: 0,
    // a wrong report: ✓/✗ per field, and 서진 says per field what does not fit yet (숙련자 모드: the marks only)
    feedback: 'hints',
    intro: '서진님께 보낼 원인 보고. 두 칸만 채우면 된다. 제출은 몇 번이든 할 수 있다 — 틀리면 칸마다 ✓/✗ 와 서진님의 짧은 한마디가 온다.',
    reply: { from: '강서진', lines: ['✗ 칸이 로그랑 안 맞아요. 다시요.', '✗ 칸만 다시 봐요.', '아직 ✗ 칸이 있어요. 한 번 더요.'], sign: '강서진' },
    // options are hypotheses of the same length and grain; the pinned evidence decides
    slots: [
      {
        id: 'cause',
        title: '원인 (기술)',
        prompt: '위키는 왜 화요일 08:47부터 응답하지 않았나?',
        type: 'single',
        options: [
          { id: 'disk', correct: true, text: '디스크 한 곳이 가득 차서, 위키가 로그와 세션 파일을 더 쓰지 못하고 스스로 종료했다' },
          { id: 'pdf', blames: 'jihoon', text: '전날 밤 지훈님이 올린 회의록 파일 하나가 위키 프로세스를 망가뜨려, 그 뒤로 위키가 뜨지 못했다' },
          { id: 'memory', text: '메모리가 모자라 커널이 위키 프로세스를 강제로 종료했고(OOM), 재시작도 계속 실패했다' },
          { id: 'network', text: '위키 서버는 멀쩡한데 앞단 프록시의 DNS 설정이 꼬여, 요청이 위키까지 가지 못했다' },
          { id: 'stopped', text: '누군가 점검하려고 systemctl stop 으로 위키를 내려 두고, 다시 켜는 것을 잊어버렸다' },
        ],
        evidence: [
          { id: 'usage', label: '디스크 사용량 (df · du 의 수치)', clues: ['c0_df', 'c0_du', 'c0_root_ok'] },
          { id: 'state', label: '위키가 남긴 오류 · 서비스 상태', clues: ['c0_loop', 'c0_status', 'c0_full'] },
        ],
      },
      {
        id: 'sequence',
        title: '경위 (타임라인)',
        prompt: '언제부터, 무슨 순서로 일어났나?',
        type: 'single',
        options: [
          { id: 'true', correct: true, text: '월요일 밤 시작된 작업 하나가 같은 오류로 쉬지 않고 재시도하며 로그를 밤새 불렸고, 화요일 아침 공간이 바닥나자 위키가 멈췄다' },
          { id: 'slow', text: '로그가 몇 년 동안 조금씩 쌓여 오다가, 화요일 아침 마지막 남은 공간을 다 쓰는 순간 위키가 멈췄다 (전날 밤엔 별일 없었다)' },
          { id: 'restart', text: '화요일 아침 누군가 위키를 재시작하다 설정이 꼬였고, 그 뒤로 위키가 같은 오류를 내며 죽고 살아나기를 반복했다' },
          { id: 'hardware', text: '월요일 밤부터 디스크에 읽기 · 쓰기 오류가 늘다가, 화요일 아침 커널이 그 디스크를 읽기 전용으로 바꿔 위키가 멈췄다' },
        ],
        evidence: [
          { id: 'start', label: '처음 시작된 시각의 기록', clues: ['c0_start', 'c0_upload'] },
          { id: 'night', label: '밤사이 쌓인 기록', clues: ['c0_loop', 'c0_suppressed', 'c0_norotate'] },
          { id: 'stop', label: '위키가 멈춘 시각의 기록', clues: ['c0_full', 'c0_status'] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ hints: rung 1 is in the machine; rung 2 Seojin (mentor) after 5 min; rung 3 cheap
  hints: {
    idleMinutes: 2,
    idle: [
      { id: 'idle-1', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c0_df'], text: '음. 디스크부터 봐요. 100%인 데가 있는지.' },
      { id: 'idle-2', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c0_du', 'c0_loop'], text: '/var가 찼으면 그 안에서 제일 큰 것. 그리고 그 끝.' },
      { id: 'idle-3', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c0_status'], text: '서비스도 봐요. 맨 아래 줄에 이유.' },
      { id: 'idle-4', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c0_start', 'c0_full'], text: '시각 두 개만 적어요. 시작된 시각, 꽉 찬 시각. 서비스 저널에 있어요.' },
    ],
    wrong: {
      jihoon: { id: 'wrong-jihoon', from: 'jihoon', channel: 'me-dm-jihoon', text: '헉 제 회의록 PDF요?? 😂 근데… PDF 하나로 위키가 통째로 죽어요?? 그 PDF가 서버에서 뭘 했는지 로그 한번 봐 주세요 🙏' },
      default: { id: 'wrong-default', from: 'seojin', channel: 'me-dm-seojin', text: '음. 그 답이면 df -h 의 100%가 설명 안 돼요. 다시요.' },
    },
    // 💡 정답: the specifics behind the correct option (the options themselves stay hypotheses)
    answers: {
      cause: '/var 디스크가 100% 찼다. 위키 로그(/var/log/wiki/wiki.log) 하나가 11G까지 불어나 공간을 다 썼고, 위키가 로그·세션을 쓰지 못해 멈췄다',
      sequence: '월 21:14 미리보기(썸네일) 작업이 깨진 PDF에서 실패하고, 쉬지 않고 재시도하며 매번 오류를 wiki.log에 썼다 → 회전 규칙이 없는 로그가 밤새 약 11G 불어남 → 화 08:47 /var가 꽉 차 위키가 쓰기에 실패하고 종료 → 재시작 5번 실패 후 멈춤',
    },
    // 💡 panel "방향" lines (요약 is generated from found clues; 정답 defaults to the correct option)
    explicit: [
      {
        slot: 'cause', cost: 5, unlessClues: ['c0_df', 'c0_du'],
        text: '터미널(wiki-01)에서 df -h — Use% 가 100% 인 줄의 Mounted on 을 보세요. 그 경로 안에서 du -sh /var/log/* 로 가장 큰 것을 찾아, 두 줄 다 📌 (근거: 디스크 사용량).',
        compare: 'df -h 의 / 줄과 /var 줄을 나란히 보세요. 한 곳만 찼나요, 전부 찼나요? 메모리(OOM)나 DNS 가 원인이라면 df 가 이렇게 나올 이유가 있는지, 보기마다 대 보세요.',
      },
      {
        slot: 'cause', cost: 5, unlessClues: ['c0_loop', 'c0_status'],
        text: 'tail -n 20 /var/log/wiki/wiki.log (끝에서 반복되는 줄)와 systemctl status wiki (Active 줄과 맨 아래 줄) — 둘 다 📌 (근거: 위키가 남긴 오류 · 서비스 상태).',
        compare: 'systemctl status 맨 아래 줄의 오류 문구를 보기 다섯 개에 하나씩 대 보세요. 그 문구를 그대로 설명하는 보기는 하나뿐이에요. "파일 하나가 망가뜨렸다"면 반복되는 줄이 무엇을 쓰고 있어야 할까요?',
      },
      {
        slot: 'sequence', cost: 5, unlessClues: ['c0_start'],
        text: 'journalctl -u wiki — 위에서부터 처음 나오는 thumbnail(attach/…) 줄의 시각을 📌 (근거: 처음 시작된 시각의 기록). 은재님 메일함의 위키 업로드 알림 메일도 같은 시각이에요.',
        compare: '그 시각과 위키가 멈춘 시각 사이는 몇 시간인가요? 보기의 "몇 년 동안 조금씩"과 "하룻밤 사이" 중 어느 쪽 간격인지 보세요.',
      },
      {
        slot: 'sequence', cost: 5, unlessClues: ['c0_full'],
        text: 'journalctl -u wiki 에서 No space left on device 가 처음 나온 줄을 📌 (근거: 위키가 멈춘 시각의 기록).',
        compare: '그 줄과 바로 뒤의 Scheduled restart 줄들, 어느 쪽이 먼저인가요? "아침에 누가 재시작하다 꼬였다"면 순서가 어떻게 찍혀야 할지 대 보세요.',
      },
      {
        slot: 'sequence', cost: 5, unlessClues: ['c0_loop', 'c0_suppressed'],
        text: '밤사이 쌓인 기록: tail -n 20 /var/log/wiki/wiki.log 의 attempt 숫자, 또는 journalctl -u wiki 의 "Suppressed … messages" 줄 → 📌 (근거: 밤사이 쌓인 기록).',
        compare: 'attempt 숫자를 처음 시작된 시각부터 지난 시간으로 나눠 보세요. 가끔 한 번인가요, 쉬지 않고인가요? "디스크 읽기 · 쓰기 오류"라면 이 줄 대신 무엇이 찍혀야 할까요?',
      },
    ],
    // the panel also walks the open checklist item (요약 = ticked items, 방향 = its hint, 정답 = its command)
    objectivePanel: true,
    // "뭐부터 봐요?": 지훈 names the current step (not the command); after the checklist, 서진's idle nudges
    ask: {
      prompts: ['뭐부터 봐요?', '막혔어요'],
      rail: '지금은 {next} 차례예요!! 명령은 은재 선배 history 에 있고, 그래도 모르겠으면 💡 ㅋㅋ 🙏',
      none: { from: 'seojin', channel: 'me-dm-seojin', text: '찾은 것부터 보고서에. 원인, 경위. 그래도 막히면 💡.' },
    },
  },

  // ------------------------------------------------------------------ live scene
  triggers: [
    {
      id: 'jihoon-pdf',
      when: { clue: 'c0_start' },
      actions: [
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 8, text: '도윤님 ㅋㅋ 혹시… 제 회의록 PDF 때문이에요?? 😂' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 14, text: '어제 21시쯤 올렸는데 미리보기가 계속 "생성 중"이길래 그냥 퇴근했어요 🙏' } },
      ],
    },
    {
      id: 'memo-reveal',
      when: { allClues: ['c0_df', 'c0_loop', 'c0_status'] },
      actions: [{ note: 'today' }, { toast: '메모장이 넘어간다 — "은재님 순서 = history 에 있음 (?)"' }],
    },
    {
      id: 'seojin-report',
      when: { allClues: ['c0_status', 'c0_full'] },
      actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 10, text: '시각까지 찾았으면 보고서 써요. 원인, 경위 두 칸.' } }],
    },
    { id: 'jihoon-lunch', when: { afterMin: 4 }, actions: [{ message: { channel: 'me-dm-jihoon', from: 'jihoon', text: '도윤님 오늘 점심 12시 ㄱㄱ? 제가 쏩니다 🍕' } }] },
  ],

  // ------------------------------------------------------------------ debrief
  // ------------------------------------------------------------------ last scene (docs/case-format.md §15)
  // after the report, before the debrief: 서진's verdict, 은재's silent nod in 도윤's notebook, 지훈's lunch
  ending: {
    beats: [
      { wait: 0, message: { channel: 'me-dm-seojin', from: 'seojin', text: '봤어요. 맞아요. 위키 살아났어요. 숙제는 오늘 밤 cron으로.' } },
      { wait: 2.5, note: 'today', line: '10:33 은재님 회의 끝나고 자리로 오심. 화면에 남은 내 다섯 줄 보시고 고개만 끄덕. 말은 없으셨음. (근데 알 것 같음)' },
      { wait: 2, message: { channel: 'me-dm-jihoon', from: 'jihoon', text: '도윤님!! 위키 살았다면서요 ㅋㅋ 점심 제가 쏩니다 🍕' } },
    ],
  },

  debrief: {
    headline: '로그는 디스크를 채운다. 디스크가 차면 멀쩡한 서비스도 멈춘다.',
    story: [
      { at: '2023-04', text: '은재가 wiki-01을 처음 구성한다. 위키 로그는 logrotate 규칙 없이 시작했다. history에 "# TODO: wiki 로그 logrotate — 다음에. (지금은 작으니까)".' },
      { at: '월 21:14', text: '지훈이 주간회의 PDF를 올린다. 미리보기(썸네일) 작업이 그 PDF를 읽다 실패하고, 기다림 없이(retry_delay_sec = 0) 다시 시도하며 실패할 때마다 오류 전체를 wiki.log에 쓴다. 초당 약 670번.' },
      { at: '월 21:14 – 화 08:47', text: 'journald는 반복 메시지를 걸러 냈지만("Suppressed …"), 파일 로그는 거르지 않는다. wiki.log가 하룻밤 사이 약 11G 늘었다. 디스크 사용량 알림은 없었다.' },
      { at: '화 08:47', text: '/var 100%. 위키가 세션도, 로그도 쓰지 못해 종료한다. systemd가 다섯 번 다시 띄웠지만 같은 이유로 실패하고 멈췄다(failed).' },
      { at: '화 08:49', text: '알림봇: "응답 없음(502)". 증상 알림은 있었지만 원인(디스크) 알림은 없었다. 위키에 있는 서진의 런북도 같이 멈췄다.' },
      { at: '화 09:30', text: '도윤이 은재 PC에서 df -h → du → tail → systemctl status → journalctl 순서로 원인을 찾는다. 은재가 2025년에 남겨 둔 바로 그 순서다.' },
    ],
    systemFactors: [
      '위키 로그에 회전(logrotate) 규칙이 없었다 — 3년 동안 작아서 아무도 몰랐다.',
      '실패한 작업을 간격 없이 무한 재시도했다(백오프 없음) — 한 번의 실패가 초당 수백 줄이 됐다.',
      '디스크 사용량 알림이 없었다 — 80%에서 울렸다면 밤새 여유가 있었다.',
      '로그와 서비스 데이터가 같은 /var를 썼다 — 로그가 넘치면 서비스도 같이 멈춘다.',
    ],
    principle: '로그는 디스크를 채운다. 디스크가 차면 멀쩡한 서비스도 멈춘다. df -h로 어디가 찼는지 보고, du와 tail로 누가 쓰고 있는지 찾고, systemctl status로 서비스를 확인한다.',
    cards: [
      { title: '어디가 찼나', cmd: 'df -h', explain: 'Use% 100% 인 줄과 Mounted on. / 는 멀쩡해도 /var 하나만 찰 수 있다. -h 는 사람이 읽는 단위(G, M).' },
      { title: '누가 큰가', cmd: 'du -sh /var/log/*', explain: '찬 곳 안에서 폴더별 크기. 가장 큰 것으로 한 단계씩 내려간다: du -sh /var/log/wiki/*' },
      { title: '그 파일', cmd: 'ls -lh /var/log/wiki', explain: '크기(11G)와 마지막으로 쓴 시각. 11G짜리 파일은 cat 하지 않는다 — 터미널이 멈춘다.' },
      { title: '누가 쓰고 있나', cmd: 'tail -n 20 /var/log/wiki/wiki.log', explain: '끝부분에 같은 줄이 반복되면 그걸 쓰는 프로그램이 범인이다. 앞부분(언제부터 한 파일이었나)은 head.' },
      { title: '서비스는?', cmd: 'systemctl status wiki', explain: 'Active 줄(active / failed)과 맨 아래 몇 줄. 멈춘 이유가 거기 있다.' },
      { title: '언제부터?', cmd: 'journalctl -u wiki --since "2026-11-09 21:00"', explain: '시간을 먼저 적는다. 사람은 그다음. "Suppressed … messages"는 같은 말이 폭주했다는 뜻이다.' },
      { title: '고치는 법 (오늘은 설명만)', cmd: '재시도 멈춤 → 로그 비우기 → logrotate', explain: '① 쓰는 쪽(재시도)을 먼저 멈춘다. ② 열려 있는 로그는 rm 대신 비운다(: > wiki.log) — rm 하면 프로세스가 붙잡고 있는 동안 공간이 돌아오지 않는다(Case 2). ③ /etc/logrotate.d/wiki 규칙과 디스크 80% 알림.' },
      { title: '은재의 순서', cmd: 'history', explain: '선배가 장애 때 친 명령이 그대로 남아 있다. # 로 시작하는 줄은 선배가 자기에게 남긴 메모다.' },
    ],
    closingMail: 'closing',
    doyunLine: '은재님 history 다섯 줄을 따라 쳤을 뿐인데 답이 나왔다. 다음엔 내 순서로 쳐 보고 싶다. (메모했습니다)',
    cast: [
      { who: 'eunjae', text: '오늘은 한마디도 하지 않았다. 대신 2025년의 다섯 줄과 README를 남겨 두었다. 사흘 뒤면 이 자리는 도윤 혼자 맡는다. 후임이 올 때까지, 2주만.' },
      { who: 'jihoon', text: '평소처럼 회의록을 올렸을 뿐이다. 깨진 PDF 하나가 위키를 멈출 수 있다는 건 아무도 몰랐다. 범인이 아니라 방아쇠.' },
      { who: 'seojin', text: '"고치는 건 제가." 도윤에게 원인 찾기만 맡겼다. 런북에 순서를 하나 더 적을 것이다 — 위키가 아닌 곳에도.' },
    ],
  },

  // ------------------------------------------------------------------ first minutes
  opening: {
    briefing: {
      lockTime: '09:30',
      lockDate: '11월 10일 화요일',
      caller: 'seojin',
      kind: 'voice',
      voiceCue: 'voice.briefing-case0-seojin',
      // ≤ 20 s in total for the tutorial (web-escape analysis §9-1 #5)
      lines: [
        { text: '도윤님. 위키 502예요.', pauseMs: 800 },
        { text: '은재님 PC에 세션 열어 뒀어요. 원인만 찾아요.', pauseMs: 800 },
        { text: '고치는 건 제가. 할 일은 오른쪽 위.', pauseMs: 1000 },
      ],
      mail: 'brief',
      mailPreview: '…막히면 history 보세요. 제가 장애 볼 때 치는 순서가 거기 그대로 있어요.',
    },
    objectives: {
      title: '오늘 할 일 (Case 0)',
      items: [
        {
          id: 'history', text: 'Enter — 은재님 history 보기', hint: '반짝이는 터미널을 누르고 Enter. history 가 이미 쳐져 있어요. 노란 줄이 단서예요.',
          any: [{ cmd: '^\\s*history\\b', host: W }], pulse: 'terminal', next: 'Enter (history)',
          answer: '터미널 창을 한 번 누르고 Enter. history 가 이미 쳐져 있어요.',
        },
        // each step: one nudge (text + hint); 지훈's line reacts without the command; 💡 방향 names the tool, 💡 정답 the command
        {
          id: 'df', text: '어디가 찼나 — 디스크부터', hint: '은재님 history 의 # 줄이 순서예요. 첫 번째는 디스크.', any: [{ clue: 'c0_df' }],
          direction: 'df -h 를 치고 Use% 열을 보세요. 100% 인 줄이 있나요? 어디(Mounted on)인가요?',
          say: '오 은재 선배 순서 나왔다 ㅋㅋ # 붙은 줄이 선배 메모래요~ 그 순서대로 가 봐요!!', next: '디스크',
          answer: '터미널에 그대로 치세요: df -h',
        },
        {
          id: 'tail', text: '누가 채웠나 — 제일 큰 파일의 끝', hint: '찬 곳 안에서 제일 큰 것을 찾고, 그 파일의 끝을 읽어 보세요.', any: [{ clue: 'c0_loop' }],
          direction: 'du -sh /var/log/* 로 가장 큰 것을 찾고, tail -n 20 <그 안의 파일> 로 끝을 보세요.',
          say: '/var 100% ㅋㅋㅋ 꽉 찼네요. 근데 누가 채운 거예요?? 👍', next: '/var 안에서 제일 큰 것',
          // the direction's own way down: any du over /var, /var/log or /var/log/wiki (flags, globs,
          // relative paths, | sort …) is on track even when it finds nothing new
          onTrack: ['^\\s*du(\\s+(-\\S+|/var(/\\S*)?|[^/~\\s|;&]\\S*))*\\s*([|;&].*)?$'],
          answer: '터미널에 그대로: du -sh /var/log/* → 가장 큰 wiki 폴더 → tail -n 20 /var/log/wiki/wiki.log',
        },
        {
          id: 'service', text: '위키는 살아 있나', hint: '이번엔 로그 말고 서비스 자체. 멈춘 이유는 맨 아래 몇 줄에 있어요.', any: [{ output: 'Active: failed \\(Result: exit-code\\)', host: W }],
          direction: 'systemctl status wiki — Active 줄과 맨 아래 몇 줄을 보세요.',
          say: '같은 줄이 계속 반복… 😂 근데 위키 프로그램은 지금 살아 있는 거예요?? 🙏', next: '위키 서비스 상태',
          answer: '터미널에 그대로 치세요: systemctl status wiki',
        },
        {
          id: 'pins', text: '증거 2개 핀 → 보고서 쓰기 (칸마다 하나 이상) 📌', hint: '증거가 되는 줄에 마우스를 올리면 오른쪽에 📌 가 보여요. df -h 의 100% 줄부터.', any: [{ pins: 2 }],
          say: '찾았다!! 노란 줄 옆 📌 눌러서 증거 두 개만 보드에 올려 봐요~',
          answer: 'df -h 의 "/dev/sdb1 … 100% /var" 줄과 systemctl status 의 "No space left on device" 줄에 마우스를 올리고 오른쪽 📌.',
        },
      ],
      after: ['다음: 📝 원인 보고서 — 원인과 경위 두 칸', '언제부터였는지: 은재님 순서의 마지막 줄', '막히면: history, ~/README.txt, 💡'],
    },
  },

  // ------------------------------------------------------------------ the rail (Jihoon walks along; names the step, never the command)
  rail: {
    from: 'jihoon',
    channel: 'me-dm-jihoon',
    offRail: '그건 나중에요 ㅋㅋ {next}부터 봐요!!',
    quiet: ['help', 'man', 'hint', 'clear', 'pwd'],
    done: '완벽 ㅋㅋ 시각은 은재 선배 순서 마지막 줄에 있대요~ 그다음 📝 보고서!! 저는 점심 메뉴 고르러 갑니다 🍕',
    highlightClues: true,
  },

  // ------------------------------------------------------------------ tutorial shell
  shell: {
    allow: ['ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'grep', 'df', 'du', 'history', 'systemctl', 'journalctl', 'man', 'help', 'hint', 'clear'],
    refuse: "튜토리얼 세션: '{cmd}' 은(는) 오늘 연습 범위 밖이에요 (읽기 전용 조사 세션).\n  쓸 수 있는 명령은 help 로 볼 수 있어요.",
    help: [
      '누리클라우드 조사 모드 셸 — 연습용 읽기 전용 세션 (남은재 계정, wiki-01)',
      'Case 0 튜토리얼에서 쓸 수 있는 명령:',
      '  둘러보기    ls  cd  pwd',
      '  파일 보기   cat  head  tail  grep',
      '  디스크      df -h      du -sh <경로>',
      '  기록        history    journalctl -u <서비스>',
      '  서비스      systemctl status <서비스>',
      '  기타        man <명령>  help  hint (💡 힌트 패널)  clear',
      '바꾸는 명령(rm, vim, systemctl restart …)은 조사 모드에서 막혀 있어요.',
      '팁: man du 처럼 예시를 볼 수 있어요. ↑/↓ 이전 명령, Tab 자동완성, 줄 옆 📌 로 증거 보드에 핀.',
    ],
  },

  boot: {
    status: '회의 중 (~10:30) · 11/13 마지막 출근 🌱',
    unlock: '은재님이 열어 둔 세션으로 들어가기',
    note: '연습용 조사 세션 — 읽기 전용이라 아무것도 망가지지 않아요. 오늘부터 2주(11/23까지)는 도윤님이 이 자리를 맡아요.',
  },

  // ------------------------------------------------------------------ 숙련자 모드 (docs/campaign-ladder.md §숙련자 모드)
  // Red herring: "the journal ate /var". The hourly "Suppressed … messages" lines and journald
  // rotating its file overnight make a flooded systemd journal look plausible. It is ruled out by
  // `du -sh /var/log/*` (the journal is ~0.5G next to an 11G wiki.log) and by journald.conf's
  // SystemMaxUse=1G: journald dropped the flood (rate limit) and vacuums old files at the cap.
  expert: {
    maxSubmissions: 2,
    parMin: 8,
    intro: '서진님께 보낼 원인 보고. 두 칸. 제출은 2번까지 — 틀리면 칸마다 ✓/✗ 만 온다.',
    after: ['다음: 📝 원인 보고서 — 원인과 경위 두 칸 (제출 2번)', '막히면: history, ~/README.txt, 💡 (숙련자 모드: 감점)'],
    // Eunjae's records, short: no command order, no df/du/tail lines to copy. What is left needs
    // reading into: a 2023 TODO, the 2025 nginx incident's last steps, and today's line.
    history: [
      {
        host: W,
        user: 'eunjae',
        lines: [
          { at: '2023-04-03T10:02:11', cmd: 'sudo apt-get install -y nginx python3-venv' },
          { at: '2023-04-03T10:31:50', cmd: 'sudo systemctl enable --now wiki' },
          { at: '2023-04-03T10:40:12', cmd: 'ls /etc/logrotate.d/' },
          { at: '2023-04-03T10:41:03', cmd: '# TODO: wiki 로그 logrotate 규칙 — 다음에. (지금은 작으니까)' },
          { at: '2025-06-17T10:16:01', cmd: '# 크롤러. 같은 줄 반복.' },
          { at: '2025-06-17T10:20:13', cmd: 'journalctl -u nginx --since "2025-06-17 08:00"' },
          { at: '2026-11-10T09:22:40', cmd: '# 도윤님 연습용으로 그대로 둠 🌱' },
        ],
      },
    ],
    mails: [
      {
        id: 'brief', account: 'me', folder: 'inbox', from: 'eunjae', to: '한도윤', cc: '강서진', at: '2026-11-10T09:24',
        subject: '[연습] 위키 502 — 제 자리 PC 쓰세요',
        body: '도윤님,\n저 10시 반까지 인수인계 회의예요… 서진님이 위키 원인 찾기를 도윤님 연습으로 맡기셨대요.\n\n- 제 자리 PC에 조사 세션(읽기 전용) 열어 뒀어요. 오늘부터 2주(11/23까지)는 도윤님이 이 자리를 맡아요. 후임 오실 때까지 임시로요.\n- 아무것도 안 망가져요. 지우거나 재시작하는 명령은 막혀 있어요.\n\n로그는 봤어요? 를 먼저 물어보세요. 자기한테요 :)\n\n남은재 🌱',
      },
    ],
    terminalTabs: [
      {
        label: 'wiki-01', host: W, cwd: '/home/eunjae', prefill: 'history',
        scrollback: ['Nuri wiki-01 (Ubuntu 22.04 LTS) — 사내 위키', '조사 모드 (읽기 전용, 연습용) — 명령 목록: help', 'eunjae@wiki-01:~$ # 도윤님, 여기서 시작해요 🌱'],
      },
    ],
    files: [
      { host: W, file: { path: '/home/eunjae/README.txt', mtime: '2025-06-17T10:35', content: 'wiki-01 — 다음 사람에게 (남은재, 2023-04 / 2025-06 고침)\n\n왜: 사내 위키 서버. 위키가 죽으면 런북도 못 봐요.\n2025-06 디스크 장애: 시간을 먼저 적어요. 사람은 그다음.\n조사할 때는 아무것도 지우지 마세요. :)' } },
      { host: W, file: { path: '/home/eunjae/.bashrc', mtime: '2025-06-17T10:40', content: EUNJAE_BASHRC.slice(0, EUNJAE_BASHRC.indexOf('\n\n# 다음 사람')) } },
      {
        host: W,
        file: {
          path: '/etc/systemd/journald.conf',
          mtime: '2025-06-17T10:52',
          content: [
            '#  This file is part of systemd.',
            '#',
            '# Entries in this file show the compile time defaults. Local configuration',
            '# should be created by either modifying this file, or by creating "drop-ins" in',
            '# the journald.conf.d/ subdirectory.',
            '#',
            '# See journald.conf(5) for details.',
            '',
            '[Journal]',
            '#Storage=auto',
            '#Compress=yes',
            '#RateLimitIntervalSec=30s',
            '#RateLimitBurst=10000',
            '# 2025-06 은재: /var 가 20G 뿐이라 저널은 1G 까지만',
            'SystemMaxUse=1G',
            '#SystemKeepFree=',
            '#MaxRetentionSec=',
          ].join('\n'),
        },
      },
    ],
    timeline: [
      {
        at: '2026-11-09T23:41:07',
        emits: [
          j('systemd-journald.service', 'Data hash table of /var/log/journal/3f9c2e17b84d4a5e/system.journal has a fill level at 75.0 (174763 of 233016 items, 33554432 file size, 192 bytes per hash table item), suggesting rotation.', { ident: 'systemd-journald', pid: 298 }),
          j('systemd-journald.service', '/var/log/journal/3f9c2e17b84d4a5e/system.journal: Journal header limits reached or header out-of-date, rotating.', { ident: 'systemd-journald', pid: 298 }),
        ],
      },
      {
        at: '2026-11-10T04:12:55',
        emits: [
          j('systemd-journald.service', 'Deleted archived journal /var/log/journal/3f9c2e17b84d4a5e/system@0005f3a1c2d7e0b8-7c41e2a90b3f1d55.journal~ (128.0M).', { ident: 'systemd-journald', pid: 298 }),
          j('systemd-journald.service', 'Vacuuming done, freed 128.0M of archived journals from /var/log/journal/3f9c2e17b84d4a5e.', { ident: 'systemd-journald', pid: 298 }),
        ],
      },
    ],
    clues: [
      {
        id: 'c0x_journal', label: '저널은 500M 남짓, 상한 1G (journald.conf) — 밤새 불어난 건 저널이 아니다', slot: 'sequence',
        match: [{ output: '^5\\d\\dM\\s+/var/log/journal/?$', host: W }, { output: '^SystemMaxUse=1G$', host: W }, { output: 'Vacuuming done, freed', host: W }],
      },
    ],
    options: [
      { slot: 'sequence', at: 1, option: { id: 'journal', text: '같은 오류가 밤새 쏟아지자 시스템 저널(journald)이 그걸 다 받아 적으며 불었고, 화요일 아침 공간이 바닥나자 위키가 멈췄다' } },
    ],
  },
};
