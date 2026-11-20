// Case 2 — 「지웠는데 안 비워지는 디스크」
// Ladder and framing: docs/campaign-ladder.md. Characters and voices: data/infra-mystery-game/characters.md.
// All people, hosts, companies and logs are fictional. Read docs/case-format.md before editing.
//
// Framing: Thursday 2026-11-12, the departed senior's second-to-last day. Two hosts: logs-01 (the
// log collector, where the disk is full) and pay-api-01 (where the extra log volume comes from).
// Eunjae is in the office packing and speaks only through records: ~/README.txt on logs-01, the
// 2024-08 history lines of the same mistake, a sticky. Mirae appears for the first time, by mail.
//
// One cause: a deleted file still takes space while a process holds it open. On Wednesday 14:22
// Jihoon switched payment-api on pay-api-01 to debug logging at runtime (no restart, no expiry) to
// chase p99. At 14:28, to make room in advance, he removed the collector's open raw file
// /data/collector/raw/pay-api-01.log (20G) with sudo rm and logged out without checking df.
// logshipd (PID 1187) kept the file open and went on appending the debug stream (~3.7G/h) to the
// nameless inode all night. df says 180G used, du finds 95G. At 07:58 free space fell under
// logshipd's min_free (6G) and it began dropping DEBUG/INFO lines from every source — payment
// logs during an audit period — and told no one.
// Red herrings: Seojin raised the archive retention 8 → 12 weeks (logrotate runs only on Sunday,
// it has not run since) and added wiki-01 as a new source (0.3G).
// Continuity with Case 3: Jihoon's 14:18–14:31 bastion session and 14:20–14:26 pay-api-01 session
// are the ones Case 3's `last` shows; payment-api has run since Nov 02 with open_fds=1398/4096.

import type { CaseFile, Emit, TimelineEvent } from '../engine/types.ts';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const L = 'logs-01';
const P = 'pay-api-01';

/** The nameless file logshipd still writes: 20.3G at the rm + 17.5 h of debug at 3.7G/h. */
export const DELETED_BYTES = Math.round(85.05 * GiB);
/** Disk numbers shown by df on logs-01 (/dev/sdb1 on /data). */
export const DATA_DF = { size: '196G', used: '180G', avail: '5.9G', pct: '97%' };
const SIZE_FOR_PCT = 186.2; // GiB usable by non-root (196G minus the 5% reserve)

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad = (n: number) => String(n).padStart(2, '0');

// ------------------------------------------------------------------ the curve of /data
/** Used GiB on /data at a given (day 11 or 12, hour): anchored at 09:30 Thu, walked back. */
function usedAt(day: number, h: number, m = 0): number {
  const t = (day - 11) * 24 + h + m / 60; // hours since Wed 00:00
  const rm = 14 + 28 / 60;
  const debug = 14 + 22 / 60;
  const drop = 24 + 7 + 58 / 60;
  const at0930 = 180.3;
  if (t >= drop) return at0930 - (24 + 9.5 - t) * 0.02;
  const atDrop = at0930 - (24 + 9.5 - drop) * 0.02;
  if (t >= rm) return atDrop - (drop - t) * 3.96;
  // the rm at 14:28 unlinked 20.3G that logshipd kept open: df did not move
  const atRmDf = atDrop - (drop - rm) * 3.96;
  if (t >= debug) return atRmDf - (rm - t) * 3.96;
  return atRmDf - (rm - debug) * 3.96 - (debug - t) * 0.49;
}
const pctAt = (day: number, h: number, m = 0) => Math.round((usedAt(day, h, m) / SIZE_FOR_PCT) * 100);

// ------------------------------------------------------------------ logs-01 files
const ARCHIVE_WEEKS = ['20260920', '20260927', '20261004', '20261011', '20261018', '20261025', '20261101', '20261108'];
const ARCHIVE_SIZES: Record<string, number> = { 'pay-api-01': 4.0, 'pay-api-02': 4.0, 'review-web': 0.24, bastion: 0.12 };

const RAW_SAMPLE = (host: string, lines: string[]) => lines.map((l) => `${l.slice(0, 19)} ${host} ${l.slice(20)}`).join('\n');

const LOGSHIPD_CONF = `# logshipd — 2023-09 eunjae
listen = 0.0.0.0:5514
raw_dir = /data/collector/raw
state_dir = /data/collector/state

# 서버마다 raw/<서버>.log 하나를 열어 둔 채 계속 append 한다.
# 다시 열기: SIGHUP (logrotate postrotate 가 일요일 00:00 에 보냄)
reopen_on = SIGHUP

min_free = 6G               # 이보다 적으면 DEBUG/INFO 줄을 버림
on_low_disk_notify = none   # TODO(은재): 알림 연결
max_source_bytes = 0        # 0 = 서버별 상한 없음
stats_every = 1h`;

const LOGROTATE = `/data/collector/raw/*.log {
    weekly
    # 감사 대응: 보관 8주 → 12주 (서진, 11/11)
    rotate 12
    olddir /data/collector/archive
    dateext
    compress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl kill -s HUP logshipd.service
    endscript
}`;

const README = `logs-01 — 로그 수집 서버 (남은재, 2023-09 처음 씀 / 2024-08 고침)

왜: 서버들의 로그를 한곳에. 결제 로그는 감사 때문에 보관 기간이 정해져 있어요.

구성:
  logshipd        systemctl status logshipd   (각 서버의 logship-agent 가 5514 포트로 보냄)
  raw/<서버>.log  /data/collector/raw         이번 주. logshipd 가 열어 둔 채 계속 씀
  archive/        /data/collector/archive     지난주들. 일요일 00:00 logrotate 가 압축해서 옮김

디스크가 차면:
  - 숫자 두 개를 나란히 놓아 봐요. 디스크가 쓴 양, 파일을 다 더한 양.
  - 숫자 두 개가 다르면? 거기서부터예요. (이 서버엔 lsof 가 없어요)
  - 언제 누가 무엇을 했는지는 저널에. sudo 로 한 일은 -t sudo 로 골라 봐요.

raw 파일은 rm 하지 마세요. (2024-08에 제가 그랬다가 반나절을 헤맸어요…)
조사할 때는 아무것도 지우지 마세요. 고치는 건 원인을 적고 나서. :)`;

const EUNJAE_BASHRC = `# ~/.bashrc — eunjae (logs-01)
[ -z "$PS1" ] && return
export HISTTIMEFORMAT='%F %T '
export HISTSIZE=100000
shopt -s histappend
PS1='\\u@\\h:\\w\\$ '
alias ll='ls -alh'

# 다음 사람: 이 아래는 지워도 돼요
alias 숨은거='ls -l /proc/$(pgrep -f logshipd)/fd | grep deleted'
alias 물주기='echo 🌱'`;

const LOGSHIPD_UNIT = `[Unit]
Description=Nuri log collector (logshipd)
After=network-online.target

[Service]
User=logship
ExecStart=/usr/local/bin/logshipd --config /etc/logshipd/logshipd.conf
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target`;

// ------------------------------------------------------------------ pay-api-01 files (Case 3's host, four days earlier)
const PAY_README = `# pay-api-01 — 결제 API 1호기
왜: 결제 API. 2018-04 첫 구성 (은재). 02호기와 같은 구성.

- 서비스: systemctl status payment-api   (유닛 파일: /etc/systemd/system/payment-api.service)
- 설정:   /etc/payment-api/config.yaml   ← pay-cfg 저장소에서 매시 5분 pull-config 가 가져옴 (/etc/cron.d/pull-config)
- 로그:   journalctl -u payment-api
- 지표:   curl -s localhost:8080/metrics
- 원장:   /var/lib/ledger (세그먼트 파일 수천 개)
- 개인 스크립트: ~/bin (정리 예정…)

다음 사람에게: 서버들은 생각보다 착해요.`;

// ------------------------------------------------------------------ helpers
const j = (host: string, unit: string, msg: string, extra: Partial<Extract<Emit, { kind: 'journal' }>> = {}): Emit => ({ kind: 'journal', host, unit, msg, ...extra });
const shipd = (msg: string, priority = 6) => j(L, 'logshipd.service', msg, { ident: 'logshipd', pid: 1187, priority });
const hist = (cmd: string): Emit => ({ kind: 'history', host: L, user: 'eunjae', cmd });
const msg = (channel: string, from: string, text: string): Emit => ({ kind: 'message', channel, from, text });

/** logshipd's hourly stats from Wednesday 00:00 to Thursday 09:00. */
function statsEvents(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (let k = 0; k <= 33; k++) {
    const day = k < 24 ? 11 : 12;
    const h = k % 24;
    const debugOn = day === 12 || h >= 15;
    const dropping = day === 12 && h >= 8;
    const pay1 = dropping ? '0.01' : debugOn ? '3.70' : '0.23';
    const pay2 = dropping ? '0.00' : '0.23';
    const wiki = day === 12 || h >= 12 ? ' wiki-01=0.01' : '';
    const free = (SIZE_FOR_PCT - usedAt(day, h)).toFixed(1);
    out.push({
      at: `2026-11-${day}T${pad(h)}:00:00`,
      emits: [shipd(`stats: in GB/h pay-api-01=${pay1} pay-api-02=${pay2} review-web=0.02 bastion=0.01${wiki} · /data used ${pctAt(day, h)}% (free ${free}G)`)],
    });
    if (dropping) out.push({ at: `2026-11-12T${pad(h)}:00:01`, emits: [shipd(`dropped ${grouped(h === 8 ? 43_660 : 1_284_000 + h * 3_217)} DEBUG/INFO lines in the last hour (low disk)`, 4)] });
  }
  return out;
}

/** payment-api's hourly stats on pay-api-01 (same format as Case 3; the pool is still 50). */
function payEvents(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (let k = 0; k <= 33; k++) {
    const day = k < 24 ? 11 : 12;
    const h = k % 24;
    const debugOn = day === 12 || h >= 15;
    const dropping = day === 12 && h >= 8;
    out.push({
      at: `2026-11-${day}T${pad(h)}:00:00`,
      emits: [
        j(P, 'payment-api.service', 'stats: pool_max=50 workers=4 open_fds=1398/4096', { ident: 'payment-api', pid: 2817 }),
        j(P, 'logship-agent.service', `sent ${debugOn ? '3.70' : '0.23'} GB/h to logs-01:5514 (/var/log/payment-api/app.log)${dropping ? ' — server is dropping DEBUG/INFO (low disk)' : ''}`, { ident: 'logship-agent', pid: 1022 }),
      ],
    });
  }
  return out;
}

const sized = (path: string, size: number, binary: string, owner = 'logship', group = 'adm', mode = '640') => ({ path, content: '', size, binary, owner, group, mode });

export const caseTwoDeleted: CaseFile = {
  id: 'case2-deleted-open',
  title: '지웠는데 안 비워지는 디스크',
  subtitle: '목요일 07:58, 로그 서버가 결제 로그를 버리기 시작했다. 어제 큰 로그를 지웠는데 — 디스크는 한 줌도 안 비었다.',
  company: '누리클라우드',
  domain: 'nuricloud.example',
  clock: { start: '2026-11-12T09:30:00', deadline: '2026-11-12T18:00:00', tz: '+09:00', rate: 20 },
  player: 'doyun',
  owner: 'eunjae',

  people: {
    doyun: { name: '한도윤', role: '인프라팀 · 입사 2주차 (나)', initial: '도', color: '#2F3E5C', login: 'dyhan', avatar: 'characters/doyun-avatar.webp', avatarSmall: 'characters/doyun-avatar-64.webp', portrait: 'characters/doyun-full.webp' },
    seojin: { name: '강서진', role: '시니어 SRE · 도윤의 사수 · 이번 주 온콜', initial: '서', color: '#3A3D42', login: 'sjkang', avatar: 'characters/seojin-avatar.webp', avatarSmall: 'characters/seojin-avatar-64.webp', portrait: 'characters/seojin-full.webp' },
    jihoon: { name: '박지훈', role: '결제개발팀 리드', initial: '지', color: '#F08A3C', login: 'jhpark', avatar: 'characters/jihun-avatar.webp', avatarSmall: 'characters/jihun-avatar-64.webp', portrait: 'characters/jihun-full.webp' },
    eunjae: { name: '남은재', role: '수석 엔지니어 · 내일 마지막 출근', initial: '은', color: '#6B7350', login: 'eunjae', avatar: 'characters/eunjae-avatar.webp', avatarSmall: 'characters/eunjae-avatar-64.webp', portrait: 'characters/eunjae-full.webp' },
    mirae: { name: '오미래', role: 'CTO', initial: '미', color: '#7A4B6B', login: 'mroh' },
    bot: { name: '알림봇', role: '모니터링', initial: '⚠', color: '#9A9A9A' },
    hr: { name: '인사팀', role: '', initial: '인', color: '#8A8580' },
  },

  // ------------------------------------------------------------------ hosts
  hosts: [
    {
      name: L,
      user: 'eunjae',
      ip: '10.20.4.10',
      motd: ['Nuri logs-01 (Ubuntu 22.04 LTS) — 로그 수집 서버', '조사 모드 (읽기 전용) — 명령 목록: help.  README 먼저: cat ~/README.txt'],
      uptime: 'up 10 days,  1:28,  1 user,  load average: 1.12, 1.08, 1.05',
      groups: { adm: { gid: 4, members: ['eunjae', 'sjkang'] }, 'systemd-journal': { gid: 101, members: ['eunjae'] }, logship: { gid: 997, members: [] }, sudo: { gid: 27, members: ['sjkang', 'jhpark'] } },
      df: [
        'Filesystem      Size  Used Avail Use% Mounted on',
        'tmpfs           794M  1.3M  793M   1% /run',
        '/dev/sda1        48G   11G   35G  24% /',
        'tmpfs           3.9G     0  3.9G   0% /dev/shm',
        `/dev/sdb1       ${DATA_DF.size}  ${DATA_DF.used}  ${DATA_DF.avail}  ${DATA_DF.pct} /data`,
        'tmpfs           794M  4.0K  794M   1% /run/user/1001',
      ],
      procs: [
        {
          pid: 1187, user: 'logship', cmd: '/usr/local/bin/logshipd --config /etc/logshipd/logshipd.conf', fdCount: 27, limitNofile: 65536,
          fdSample: ['/dev/null', 'socket:[21877]', 'socket:[21877]', 'anon_inode:[eventpoll]', 'socket:[21890]', '/data/collector/state/offsets.db', '/data/collector/raw/bastion.log', '/data/collector/raw/pay-api-01.log (deleted)', '/data/collector/raw/pay-api-02.log', '/data/collector/raw/review-web.log', '/data/collector/raw/wiki-01.log'],
          // the nameless file: ls -lL /proc/1187/fd/7 (link count 0), du -L, fdinfo pos (logshipd appends, so pos = size)
          deleted: [{ path: '/data/collector/raw/pay-api-01.log', size: DELETED_BYTES, owner: 'logship', group: 'adm', mode: '640', mtime: '2026-11-12T09:30', ino: 1310742 }],
        },
      ],
      units: [
        {
          name: 'logshipd.service', unitFile: LOGSHIPD_UNIT, pid: 1187,
          props: { Id: 'logshipd.service', Description: 'Nuri log collector (logshipd)', MainPID: '1187', User: 'logship', ActiveState: 'active', SubState: 'running', NRestarts: '0', ExecMainStartTimestamp: 'Mon 2026-11-02 08:02:10 KST', LimitNOFILE: '65536', FragmentPath: '/etc/systemd/system/logshipd.service' },
          statusLines: [
            '● logshipd.service - Nuri log collector (logshipd)',
            '     Loaded: loaded (/etc/systemd/system/logshipd.service; enabled; vendor preset: enabled)',
            '     Active: active (running) since Mon 2026-11-02 08:02:10 KST; 1 week 3 days ago',
            '   Main PID: 1187 (logshipd)',
            '      Tasks: 12 (limit: 9387)',
            '     Memory: 148.6M',
            '        CPU: 3h 41min 9.204s',
            '     CGroup: /system.slice/logshipd.service',
            '             └─1187 /usr/local/bin/logshipd --config /etc/logshipd/logshipd.conf',
            '',
            'Nov 12 07:58:12 logs-01 logshipd[1187]: low disk: /data free 5.9G < min_free 6G — dropping DEBUG/INFO lines (all sources; notify: none)',
            'Nov 12 09:00:00 logs-01 logshipd[1187]: stats: in GB/h pay-api-01=0.01 pay-api-02=0.00 review-web=0.02 bastion=0.01 wiki-01=0.01 · /data used 97% (free 5.9G)',
            'Nov 12 09:00:01 logs-01 logshipd[1187]: dropped 1,312,953 DEBUG/INFO lines in the last hour (low disk)',
          ],
        },
        {
          name: 'cron.service', pid: 640,
          unitFile: '[Unit]\nDescription=Regular background program processing daemon\n\n[Service]\nExecStart=/usr/sbin/cron -f -P\n\n[Install]\nWantedBy=multi-user.target',
          props: { Id: 'cron.service', Description: 'Regular background program processing daemon', MainPID: '640', ActiveState: 'active', SubState: 'running' },
          statusLines: ['● cron.service - Regular background program processing daemon', '     Loaded: loaded (/lib/systemd/system/cron.service; enabled; vendor preset: enabled)', '     Active: active (running) since Mon 2026-11-02 08:02:01 KST; 1 week 3 days ago', '   Main PID: 640 (cron)'],
        },
      ],
      crontabs: {},
      files: [
        { path: '/home/eunjae/.bashrc', content: EUNJAE_BASHRC, mtime: '2024-08-21T11:02' },
        { path: '/home/eunjae/README.txt', content: README, mtime: '2024-08-21T11:00' },
        { path: '/home/eunjae/.ssh/config', mode: '600', mtime: '2025-02-11T14:20', content: '# 다음 사람: 여기서 갈 일이 있는 서버\nHost pay-api-01\n  HostName 10.20.1.11\n  # 결제 API 1호기 — 로그가 제일 많이 오는 곳' },
        { path: '/etc/logshipd/logshipd.conf', content: LOGSHIPD_CONF, mtime: '2023-09-14T15:30' },
        { path: '/etc/logshipd/sources.d/pay-api-01.conf', content: 'name = pay-api-01\naddr = 10.20.1.11\n# 결제 로그 — 감사 대상', mtime: '2023-09-14T15:31' },
        { path: '/etc/logshipd/sources.d/pay-api-02.conf', content: 'name = pay-api-02\naddr = 10.20.1.12\n# 결제 로그 — 감사 대상', mtime: '2023-09-14T15:31' },
        { path: '/etc/logshipd/sources.d/review-web.conf', content: 'name = review-web\naddr = 10.20.0.12', mtime: '2024-02-02T10:10' },
        { path: '/etc/logshipd/sources.d/bastion.conf', content: 'name = bastion\naddr = 10.20.0.5', mtime: '2023-09-14T15:32' },
        { path: '/etc/logshipd/sources.d/wiki-01.conf', content: 'name = wiki-01\naddr = 10.20.3.21\n# 11/11 서진: wiki-01 추가 (화요일 장애 뒤 위키 로그도 보관)', mtime: '2026-11-11T11:01' },
        { path: '/etc/logrotate.d/logshipd', content: LOGROTATE, mtime: '2026-11-11T15:20' },
        { path: '/usr/local/bin/logshipd', content: '', binary: '바이너리 파일입니다 (로그 수집 데몬)', mode: '755', mtime: '2025-10-02T10:00' },
        { path: '/data/collector/state/offsets.db', content: '', size: 12 * MiB, binary: '수신 위치 기록 (바이너리)', owner: 'logship', group: 'logship', mode: '640', mtime: '2026-11-12T09:30' },
        // this week's raw files (pay-api-01.log is gone from the directory: it was removed on Wednesday)
        {
          path: '/data/collector/raw/pay-api-02.log', owner: 'logship', group: 'adm', mode: '640', mtime: '2026-11-12T09:30', size: Math.round(24.0 * GiB),
          content: RAW_SAMPLE('pay-api-02', [
            '2026-11-08T00:00:04 payment-api[3102]: INFO log reopened by logrotate',
            '2026-11-12T07:57:58 payment-api[3102]: INFO POST /v1/payments 201 41ms order=8f21c0 amount=12900',
            '2026-11-12T07:57:59 payment-api[3102]: INFO POST /v1/payments 201 38ms order=8f21c1 amount=4500',
            '2026-11-12T08:14:02 payment-api[3102]: WARN pg timeout, retry 1/3 order=8f2d77',
            '2026-11-12T09:12:40 payment-api[3102]: WARN pg timeout, retry 1/3 order=8f3a10',
          ]),
        },
        { path: '/data/collector/raw/review-web.log', owner: 'logship', group: 'adm', mode: '640', mtime: '2026-11-12T09:29', size: Math.round(2.6 * GiB), content: '2026-11-12T07:57:30 review-web nginx: 10.20.30.52 - sjkang "GET /review/409 HTTP/1.1" 200 5521' },
        { path: '/data/collector/raw/bastion.log', owner: 'logship', group: 'adm', mode: '640', mtime: '2026-11-12T09:30', size: Math.round(1.4 * GiB), content: '2026-11-11T14:18:22 bastion sshd[88120]: Accepted publickey for jhpark from 10.20.30.61 port 51920 ssh2\n2026-11-11T14:31:05 bastion sshd[88120]: pam_unix(sshd:session): session closed for user jhpark\n2026-11-12T09:24:10 bastion sshd[90402]: Accepted publickey for eunjae from 10.20.30.77 port 50318 ssh2' },
        { path: '/data/collector/raw/wiki-01.log', owner: 'logship', group: 'adm', mode: '640', mtime: '2026-11-12T09:30', size: Math.round(0.3 * GiB), content: '2026-11-11T11:02:13 wiki-01 wiki-server[52210]: INFO GET /wiki/RB-019 200 (sjkang)' },
        // archive: eight weeks so far (retention is now 12, but logrotate has not run since the change)
        ...ARCHIVE_WEEKS.flatMap((d) =>
          Object.entries(ARCHIVE_SIZES).map(([host, g]) => sized(`/data/collector/archive/${host}.log-${d}.gz`, Math.round(g * GiB), 'gzip 압축 파일 (지난주 로그)', 'logship', 'adm', '640')),
        ),
        { path: '/var/log/auth.log', group: 'adm', mode: '640', mtime: '2026-11-12T09:24', content: [
          'Nov 11 11:00:12 logs-01 sshd[39102]: Accepted publickey for sjkang from 10.20.0.5 port 50110 ssh2',
          'Nov 11 11:01:40 logs-01 sudo:   sjkang : TTY=pts/0 ; PWD=/home/sjkang ; USER=root ; COMMAND=/usr/bin/vim /etc/logshipd/sources.d/wiki-01.conf',
          'Nov 11 11:02:05 logs-01 sudo:   sjkang : TTY=pts/0 ; PWD=/home/sjkang ; USER=root ; COMMAND=/usr/bin/systemctl reload logshipd',
          'Nov 11 11:04:30 logs-01 sshd[39102]: pam_unix(sshd:session): session closed for user sjkang',
          'Nov 11 14:27:40 logs-01 sshd[40211]: Accepted publickey for jhpark from 10.20.0.5 port 52210 ssh2',
          'Nov 11 14:28:41 logs-01 sudo:   jhpark : TTY=pts/1 ; PWD=/data/collector/raw ; USER=root ; COMMAND=/usr/bin/rm pay-api-01.log',
          'Nov 11 14:29:50 logs-01 sshd[40211]: pam_unix(sshd:session): session closed for user jhpark',
          'Nov 11 15:18:02 logs-01 sshd[40630]: Accepted publickey for sjkang from 10.20.0.5 port 50388 ssh2',
          'Nov 11 15:20:11 logs-01 sudo:   sjkang : TTY=pts/0 ; PWD=/home/sjkang ; USER=root ; COMMAND=/usr/bin/vim /etc/logrotate.d/logshipd',
          'Nov 11 15:21:30 logs-01 sshd[40630]: pam_unix(sshd:session): session closed for user sjkang',
          'Nov 12 09:24:12 logs-01 sshd[41877]: Accepted publickey for eunjae from 10.20.0.5 port 50402 ssh2',
        ].join('\n') },
      ],
    },
    {
      name: P,
      user: 'eunjae',
      ip: '10.20.1.11',
      motd: ['Welcome to pay-api-01 (결제 API 1호기) — Ubuntu 24.04 LTS', '이 서버에 대해서는 ~/README.txt 를 먼저 보세요. — 은재'],
      uptime: 'up 10 days,  5:18,  2 users,  load average: 0.61, 0.55, 0.52',
      df: [
        'Filesystem      Size  Used Avail Use% Mounted on',
        'tmpfs           794M  1.2M  793M   1% /run',
        '/dev/sda1        98G   38G   56G  41% /',
        '/dev/sdb1       500G  216G  284G  44% /var/lib/ledger',
        'backup:/ledger  2.0T  1.1T  0.9T  55% /backup',
      ],
      procs: [
        { pid: 2817, user: 'payapi', cmd: '/opt/payment-api/bin/payment-api --config /etc/payment-api/config.yaml', fdCount: 1398, limitNofile: 4096, fdSample: ['/dev/null', '/dev/null', '/dev/null', '/var/log/payment-api/app.log', 'anon_inode:[eventpoll]', 'socket:[47110]', '/var/lib/ledger/index.db'] },
        { pid: 1022, user: 'logship', cmd: '/usr/local/bin/logship-agent --to logs-01:5514 --follow /var/log/payment-api/app.log', fdCount: 9, limitNofile: 1024, fdSample: ['/dev/null', 'socket:[20117]', 'socket:[20117]', 'anon_inode:[eventpoll]', '/var/log/payment-api/app.log', 'socket:[20240]'] },
      ],
      units: [
        {
          name: 'payment-api.service', pid: 2817,
          unitFile: '[Unit]\nDescription=Nuri payment API\nAfter=network-online.target\n\n[Service]\nUser=payapi\nExecStart=/opt/payment-api/bin/payment-api --config /etc/payment-api/config.yaml\nRestart=on-failure\n# RB-012: 한도 바꿀 땐 인프라팀 리뷰 (강서진)\nLimitNOFILE=4096\n\n[Install]\nWantedBy=multi-user.target',
          props: { Id: 'payment-api.service', Description: 'Nuri payment API', MainPID: '2817', User: 'payapi', LimitNOFILE: '4096', ActiveState: 'active', SubState: 'running', NRestarts: '0', ExecMainStartTimestamp: 'Mon 2026-11-02 04:12:09 KST' },
          statusLines: [
            '● payment-api.service - Nuri payment API',
            '     Loaded: loaded (/etc/systemd/system/payment-api.service; enabled; preset: enabled)',
            '     Active: active (running) since Mon 2026-11-02 04:12:09 KST; 1 week 3 days ago',
            '   Main PID: 2817 (payment-api)',
            '      Tasks: 64 (limit: 9387)',
            '     Memory: 471.9M (peak: 1.1G)',
            '     CGroup: /system.slice/payment-api.service',
            '             └─2817 /opt/payment-api/bin/payment-api --config /etc/payment-api/config.yaml',
            '',
            'Nov 12 07:00:00 pay-api-01 payment-api[2817]: stats: pool_max=50 workers=4 open_fds=1398/4096',
            'Nov 12 08:00:00 pay-api-01 payment-api[2817]: stats: pool_max=50 workers=4 open_fds=1398/4096',
            'Nov 12 09:00:00 pay-api-01 payment-api[2817]: stats: pool_max=50 workers=4 open_fds=1398/4096',
          ],
        },
        {
          name: 'logship-agent.service', pid: 1022,
          unitFile: '[Unit]\nDescription=Nuri log shipping agent\n\n[Service]\nUser=logship\nExecStart=/usr/local/bin/logship-agent --to logs-01:5514 --follow /var/log/payment-api/app.log\nRestart=always\n\n[Install]\nWantedBy=multi-user.target',
          props: { Id: 'logship-agent.service', Description: 'Nuri log shipping agent', MainPID: '1022', ActiveState: 'active', SubState: 'running', ExecMainStartTimestamp: 'Mon 2026-11-02 04:12:01 KST' },
          statusLines: ['● logship-agent.service - Nuri log shipping agent', '     Loaded: loaded (/etc/systemd/system/logship-agent.service; enabled; preset: enabled)', '     Active: active (running) since Mon 2026-11-02 04:12:01 KST; 1 week 3 days ago', '   Main PID: 1022 (logship-agent)', '', 'Nov 12 09:00:00 pay-api-01 logship-agent[1022]: sent 3.70 GB/h to logs-01:5514 (/var/log/payment-api/app.log) — server is dropping DEBUG/INFO (low disk)'],
        },
      ],
      files: [
        { path: '/home/eunjae/README.txt', content: PAY_README, mtime: '2025-11-03T16:40' },
        { path: '/var/log/payment-api/app.log', content: '2026-11-12T09:29:58 DEBUG POST /v1/payments order=8f3c02 sql="SELECT … FROM ledger_idx WHERE …" rows=1 12ms\n2026-11-12T09:29:58 DEBUG pg request order=8f3c02 headers={…} body_len=412\n2026-11-12T09:29:58 INFO POST /v1/payments 201 44ms order=8f3c02 amount=8800', size: Math.round(0.71 * GiB), owner: 'payapi', group: 'adm', mode: '640', mtime: '2026-11-12T09:30' },
        { path: '/var/log/payment-api/app.log.1', content: '', size: GiB, binary: '지난 로그 (1G마다 앱이 스스로 자름, 3개 보관)', owner: 'payapi', group: 'adm', mode: '640', mtime: '2026-11-12T09:12' },
        { path: '/var/log/payment-api/app.log.2', content: '', size: GiB, binary: '지난 로그 (1G마다 앱이 스스로 자름, 3개 보관)', owner: 'payapi', group: 'adm', mode: '640', mtime: '2026-11-12T08:56' },
      ],
    },
  ],

  // ------------------------------------------------------------------ timeline
  timeline: [
    // Eunjae's history on logs-01: the same mistake in 2024-08
    { at: '2023-09-14T15:40:02', emits: [hist('sudo systemctl enable --now logshipd')] },
    { at: '2024-08-21T10:02:11', emits: [hist('df -h')] },
    { at: '2024-08-21T10:03:40', emits: [hist('du -sh /data/collector/*')] },
    { at: '2024-08-21T10:05:12', emits: [hist('# df 92% / du 51%. 숫자가 안 맞음. 숨은 게 있다.')] },
    { at: '2024-08-21T10:31:05', emits: [hist('ls -la /data/collector/raw')] },
    { at: '2024-08-21T10:36:15', emits: [hist('journalctl -t sudo --since "2024-08-21 07:00"')] },
    { at: '2024-08-21T10:36:50', emits: [hist('# 07:12 rm. 내가. 그 뒤로 df 가 안 줄었음.')] },
    { at: '2024-08-21T10:40:22', emits: [hist('ls -l /proc/$(pgrep -f logshipd)/fd | grep deleted')] },
    { at: '2024-08-21T10:41:30', emits: [hist('# 찾았다. 내가 아침에 지운 그 파일.')] },
    { at: '2024-08-21T10:42:05', emits: [hist('ls -lhL /proc/$(pgrep -f logshipd)/fd/9')] },
    { at: '2024-08-21T10:42:30', emits: [hist('# 링크 0개, 76G. 이름만 없다.')] },
    { at: '2024-08-21T10:44:02', emits: [hist('sudo systemctl kill -s HUP logshipd')] },
    { at: '2024-08-21T10:45:10', emits: [hist('df -h')] },
    { at: '2024-08-21T10:45:40', emits: [hist('# 92% → 51%. README 에 적어 둠. 지운 다음엔 꼭 df 🌱')] },
    { at: '2026-11-12T09:24:40', emits: [hist('df -h')] },
    { at: '2026-11-12T09:25:02', emits: [hist('# 도윤님, 오늘은 logs-01. README 먼저 🌱')] },

    // logs-01 journal
    { at: '2026-11-08T00:00:03', emits: [j(L, 'logrotate.service', 'logrotate.service: Deactivated successfully.', { ident: 'systemd', pid: 1 }), j(L, 'logrotate.service', 'Finished Rotate log files.', { ident: 'systemd', pid: 1 })] },
    { at: '2026-11-08T00:00:04', note: 'the last time logshipd reopened its files', emits: [shipd('SIGHUP: reopened 4 file(s) in /data/collector/raw')] },
    { at: '2026-11-11T11:00:12', emits: [j(L, 'ssh.service', 'Accepted publickey for sjkang from 10.20.0.5 port 50110 ssh2', { ident: 'sshd', pid: 39102 })] },
    { at: '2026-11-11T11:02:05', emits: [j(L, 'logshipd.service', 'Reloading Nuri log collector (logshipd)...', { ident: 'systemd', pid: 1 }), shipd('SIGHUP: reopened 4 file(s) in /data/collector/raw'), shipd('source added: wiki-01 (10.20.3.21)')] },
    { at: '2026-11-11T11:04:30', emits: [j(L, 'ssh.service', 'pam_unix(sshd:session): session closed for user sjkang', { ident: 'sshd', pid: 39102 })] },
    { at: '2026-11-11T14:27:40', emits: [j(L, 'ssh.service', 'Accepted publickey for jhpark from 10.20.0.5 port 52210 ssh2', { ident: 'sshd', pid: 40211 })] },
    {
      at: '2026-11-11T14:28:41', note: 'the rm: the name goes, the inode stays open in logshipd',
      emits: [
        j(L, 'session-881.scope', '  jhpark : TTY=pts/1 ; PWD=/data/collector/raw ; USER=root ; COMMAND=/usr/bin/rm pay-api-01.log', { ident: 'sudo', pid: 40288, priority: 5 }),
        j(L, 'session-881.scope', 'pam_unix(sudo:session): session opened for user root(uid=0) by jhpark(uid=1003)', { ident: 'sudo', pid: 40288 }),
        j(L, 'session-881.scope', 'pam_unix(sudo:session): session closed for user root', { ident: 'sudo', pid: 40288 }),
      ],
    },
    { at: '2026-11-11T14:29:50', emits: [j(L, 'ssh.service', 'pam_unix(sshd:session): session closed for user jhpark', { ident: 'sshd', pid: 40211 })] },
    { at: '2026-11-11T15:18:02', emits: [j(L, 'ssh.service', 'Accepted publickey for sjkang from 10.20.0.5 port 50388 ssh2', { ident: 'sshd', pid: 40630 })] },
    { at: '2026-11-11T15:20:11', emits: [j(L, 'session-889.scope', '  sjkang : TTY=pts/0 ; PWD=/home/sjkang ; USER=root ; COMMAND=/usr/bin/vim /etc/logrotate.d/logshipd', { ident: 'sudo', pid: 40702, priority: 5 })] },
    { at: '2026-11-11T15:21:30', emits: [j(L, 'ssh.service', 'pam_unix(sshd:session): session closed for user sjkang', { ident: 'sshd', pid: 40630 })] },
    { at: '2026-11-12T07:58:12', note: 'free < min_free: payment INFO lines are being dropped from here on', emits: [shipd('low disk: /data free 5.9G < min_free 6G — dropping DEBUG/INFO lines (all sources; notify: none)', 4)] },
    { at: '2026-11-12T09:24:12', emits: [j(L, 'ssh.service', 'Accepted publickey for eunjae from 10.20.0.5 port 50402 ssh2', { ident: 'sshd', pid: 41877 })] },
    ...statsEvents(),

    // pay-api-01 journal: Jihoon's runtime switch (matches Case 3's `last`)
    { at: '2026-11-11T14:20:31', emits: [j(P, 'ssh.service', 'Accepted publickey for jhpark from 10.20.0.5 port 50122 ssh2', { ident: 'sshd', pid: 77120 })] },
    { at: '2026-11-11T14:22:47', note: 'debug at runtime: no restart, no expiry', emits: [j(P, 'payment-api.service', 'log level changed: info -> debug (PUT /admin/log-level from 127.0.0.1; stays until changed back)', { ident: 'payment-api', pid: 2817, priority: 5 })] },
    { at: '2026-11-11T14:26:02', emits: [j(P, 'ssh.service', 'pam_unix(sshd:session): session closed for user jhpark', { ident: 'sshd', pid: 77120 })] },
    ...payEvents(),

    // messenger
    { at: '2026-11-11T11:05:10', emits: [msg('pc-logs', 'seojin', 'wiki-01 로그도 logs-01 로 받기 시작했어요.')] },
    { at: '2026-11-11T14:31:20', emits: [msg('pc-logs', 'jihoon', '로그 서버에 제 옛날 결제 로그 좀 지워 뒀어요 ㅋㅋ 디버그 잠깐 켜 놔서 공간 미리 확보!! 👍')] },
    { at: '2026-11-11T15:23:02', emits: [msg('pc-logs', 'seojin', '결제 로그 보관 8주 → 12주. 감사 대응. 일요일부터 적용.')] },
    { at: '2026-11-11T19:30:05', emits: [msg('pc-logs', 'bot', '[P4] logs-01 /data 70% 넘음 (경고) · 19:30')] },
    { at: '2026-11-11T19:34:40', emits: [msg('pc-logs', 'jihoon', '어 제가 아까 지웠는데?? ㅋㅋ 곧 반영되겠죠 🙏')] },
    { at: '2026-11-11T19:35:02', emits: [msg('pc-logs', 'jihoon', '(df는 안 봤어요 퇴근 중이라 😂)')] },
    { at: '2026-11-12T04:43:05', emits: [msg('pc-logs', 'bot', '[P2] logs-01 /data 90% · 04:43 → 온콜 강서진')] },
    { at: '2026-11-12T04:51:30', emits: [msg('pc-logs', 'seojin', '확인. 증가 3.9G/h. 08:30에 봐요.')] },
    { at: '2026-11-12T08:41:12', emits: [msg('pc-logs', 'seojin', '97%. 지훈님 어제 지운 파일이 뭐였어요?')] },
    { at: '2026-11-12T08:47:50', emits: [msg('pc-logs', 'jihoon', '네넵 raw/pay-api-01.log 요!! 20G 넘던 거 ㅋㅋ 지웠는데 왜 안 줄었지 😂')] },
    { at: '2026-11-12T09:02:30', emits: [msg('pc-logs', 'eunjae', '음… 그거 예전에 저도 한 번 했어요. README 에 적어 뒀어요 🌱')] },
    { at: '2026-11-12T09:20:11', emits: [msg('me-dm-seojin', 'seojin', '도윤님. logs-01. 은재 선배 세션으로 봐요. 세 칸.')] },
    { at: '2026-11-12T09:21:40', emits: [msg('me-dm-seojin', 'doyun', '넵! 확인해보겠습니다. 혹시 지훈님이 지운 파일이 아직 어딘가 남아 있을 수도 있을까요? (메모했습니다)')] },
    { at: '2026-11-12T09:22:05', emits: [msg('me-dm-seojin', 'seojin', '그걸 찾는 거예요.')] },
  ],

  generators: [],

  channels: [
    { id: 'pc-logs', account: 'pc', kind: 'channel', title: '#로그서버' },
    { id: 'me-dm-seojin', account: 'me', kind: 'dm', title: '강서진', with: 'seojin' },
    { id: 'me-dm-jihoon', account: 'me', kind: 'dm', title: '박지훈', with: 'jihoon' },
  ],

  mails: [
    {
      id: 'brief', account: 'me', folder: 'inbox', from: 'mirae', to: '인프라팀 (한도윤 외)', cc: '박지훈', at: '2026-11-12T09:10',
      subject: '[중요] 로그 서버 디스크 — 결제 로그 유실 여부 확인 요청',
      body: '인프라팀 여러분,\n아침부터 죄송합니다.\n\n- 로그 서버(logs-01) 디스크 경보 건으로 결제 로그 유실 여부 확인 부탁드립니다. 감사 대응 기간입니다.\n- 원인과 경위, 재발 방지(무엇이 그걸 가능하게 했는지)를 오늘 18:00까지 공유해 주십시오.\n- 보고서는 서진님 검토 후 저에게 주시면 됩니다.\n\n오미래 드림 / CTO',
    },
    {
      id: 'closing', account: 'me', folder: 'inbox', from: 'mirae', to: '한도윤', cc: '강서진, 박지훈', at: '2026-11-12T18:05', later: true,
      subject: 'RE: [중요] 로그 서버 디스크 — 결제 로그 유실 여부 확인 요청',
      body: '도윤님,\n보고서 잘 받았습니다.\n\n- 07:58부터 서진님 조치(10:12)까지 결제 DEBUG/INFO 로그 일부가 유실된 것으로 이해했습니다. 감사팀에는 오늘 제가 알리겠습니다.\n- 디버그 전환 시한, 수동 삭제 뒤 확인 절차, 수집 서버 상한과 알림을 이번 주 안에 정리 부탁드립니다.\n- "누가 지웠나"보다 "지웠는데 왜 안 비었나"를 먼저 써 주셔서 설명하기 쉬웠습니다.\n\n오미래 드림 / CTO',
    },
    {
      id: 'p99', account: 'pc', folder: 'inbox', from: 'mirae', to: '박지훈', cc: '인프라팀 (남은재 외)', at: '2026-11-12T16:40', later: true,
      subject: '[중요] 월요일 파트너 데모 전 결제 지연(p99) 개선 요청',
      body: '지훈님,\n바쁘신 와중에 죄송합니다.\n\n- 월요일 10시 데모 전까지 p99 개선 부탁드립니다.\n- 방법은 맡기겠습니다. 다만 일정은 맡길 수 없습니다.\n- 진행 상황은 금요일 18:00까지 공유해 주십시오.\n\n오미래 드림 / CTO',
    },
    {
      id: 'hr', account: 'pc', folder: 'inbox', from: 'hr', to: '남은재', at: '2026-11-02T10:00',
      subject: '[인사] 퇴사 일정 안내 (11/13)',
      body: '남은재님,\n퇴사일(11/13 금) 일정을 안내드립니다.\n\n- 인수인계 회의: 11/10(화) 09:30–10:30, 11/12(목) 14:00\n- 장비 반납: 11/13 17:00\n- 계정 회수: 11/16(월) 보안팀 일정에 따라\n\n인사팀',
    },
  ],

  notes: [
    {
      id: 'today', title: '11/12 (목) logs-01 97%',
      lines: ['서진님: 왜 안 줄었는지. 언제부터. 무엇이.', '지훈님: 어제 큰 로그 지웠음 → 그럼 줄어야 하는데 (?)', 'df = 디스크 전체, du = 파일을 다 더한 것 (화요일에 배움)', '1. 무엇이 찼나  2. 언제  3. 왜 가능했나'],
      highlight: 1, reveal: '→ 이름만 지워짐. logshipd 가 아직 열고 쓰는 중. (deleted)',
    },
    { id: 'wed', title: '11/11 (수) cron ≠ 내 터미널', lines: ['cron 의 PATH = /usr/bin:/bin 뿐', '"터미널에서 됐다" ≠ 증거', '→ 고친 다음엔 cron 처럼 돌려 보기'] },
    { id: 'tue', title: '11/10 (화) 위키 502 — 연습!!', lines: ['원인: /var 100%, wiki.log 11G', 'df → du → tail → systemctl status → journalctl ✓'] },
  ],

  stickies: [{ text: '다음 분께 —\n지운 다음엔\n꼭 df 🌱', x: 74, y: 66, color: '#C9E4B4' }],

  notifications: [
    { id: 'n-page', at: '2026-11-12T04:43', app: '메신저', title: '알림봇 · #로그서버', text: '[P2] logs-01 /data 90% → 온콜 강서진' },
    { id: 'n-mail', at: '2026-11-12T09:10', app: '메일', title: '오미래', text: '[중요] 로그 서버 디스크 — 결제 로그 유실 여부 확인 요청' },
  ],

  terminalTabs: [
    {
      label: 'logs-01', host: L, cwd: '/home/eunjae',
      scrollback: ['Nuri logs-01 (Ubuntu 22.04 LTS) — 로그 수집 서버', '조사 모드 (읽기 전용) — 명령 목록: help.  README 먼저: cat ~/README.txt', 'eunjae@logs-01:~$ # 도윤님, 오늘은 logs-01. README 먼저 🌱'],
    },
  ],
  deadTabs: ['wiki-01', 'pay-api-02'],

  dashboard: [
    'logs-01 — 수집 서버 (수 11/11 00:00 ~ 목 11/12 09:30, 1시간 간격)',
    '',
    '/data 사용량 (%)',
    '100 ┤',
    ' 90 ┤╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌▄▆███████ 호출 90%',
    ' 70 ┤╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌▂▄▆██████████████████████████ 경고 70%',
    ' 50 ┤▆▆▆▆▆▆▆▆▆▆▆▆▆▆▄▆████████████████████████████████',
    '  0 ┼──────────────────────────────────────────────────',
    '    00:00     14:28           19:30         04:43  07:58 09:30',
    '                (어? 줄지 않음)',
    '',
    '수신량 (GB/시간, 서버별)',
    '  pay-api-01  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████████████████████████████▁▁  (14:22 부터 3.7)',
    '  pay-api-02  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  (0.23)',
    '  wiki-01                ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  (11:02 부터 0.01)',
    '',
    '버려진 줄 (07:58 부터): 시간당 약 130만 줄 · 알림: 없음',
  ],

  // the same snapshot as structured panels (dashboard app; the player's pins become annotations)
  panels: {
    title: '로그 수집 · logs-01',
    from: '2026-11-11T00:00',
    to: '2026-11-12T09:30',
    stepMin: 15,
    live: true,
    marks: ['2026-11-11T14:28', '2026-11-12T07:58'],
    stats: [
      { title: '/data', value: '97%', state: 'crit', note: '180G / 196G' },
      { title: '버려진 줄', value: '시간당 약 130만', state: 'crit', note: '07:58부터 · 알림 없음' },
      { title: 'logshipd 재시작', value: '0', state: 'ok', note: '11/02 08:02부터' },
      { title: '수신 서버', value: '5대', state: 'none' },
    ],
    timeseries: [
      {
        id: 'data', title: '/data 사용량 (%)', unit: '%', min: 0, max: 100,
        thresholds: [{ value: 70, label: '경고 70%' }, { value: 90, label: '호출 90%' }],
        series: [{ name: '/data', color: 'yellow', interp: 'linear', points: [['2026-11-11T00:00', pctAt(11, 0)], ['2026-11-11T14:22', pctAt(11, 14, 22)], ['2026-11-12T07:58', pctAt(12, 7, 58)], ['2026-11-12T09:30', pctAt(12, 9, 30)]] }],
      },
      {
        id: 'ingest', title: '수신량 (GB/시간, 서버별)', unit: 'G/h', min: 0, max: 4,
        series: [
          { name: 'pay-api-01', color: 'red', points: [['2026-11-11T00:00', 0.23], ['2026-11-11T14:22', 3.7], ['2026-11-12T07:58', 0.01]] },
          { name: 'pay-api-02', color: 'blue', points: [['2026-11-11T00:00', 0.23], ['2026-11-12T07:58', 0]] },
          { name: 'wiki-01', color: 'green', points: [['2026-11-11T00:00', null], ['2026-11-11T11:02', 0.01]] },
        ],
      },
      {
        id: 'dropped', title: '버려진 줄 (줄/시간)', min: 0, max: 1_500_000, width: 'half',
        description: '여유 공간이 min_free(6G) 아래로 내려가면 logshipd 가 DEBUG/INFO 줄을 버린다.',
        series: [{ name: 'dropped', color: 'purple', points: [['2026-11-11T00:00', 0], ['2026-11-12T07:58', 1_300_000]] }],
      },
    ],
    annotations: [
      { at: '2026-11-11T11:02', label: 'source added: wiki-01', kind: 'event' },
      { at: '2026-11-11T19:30', label: '70% 경고', kind: 'alert' },
      { at: '2026-11-12T04:43', label: '90% 호출', kind: 'alert' },
      { at: '2026-11-12T07:58', label: 'low disk: dropping', kind: 'error' },
    ],
  },

  // ------------------------------------------------------------------ clues
  clues: [
    { id: 'c2_df', label: 'df -h: /data 97% (180G 사용)', slot: 'cause', key: true, match: [{ output: `^/dev/sdb1\\s+196G\\s+180G\\s+5\\.9G\\s+97%\\s+/data$`, host: L }] },
    { id: 'c2_du', label: 'du: 파일을 다 더하면 95G (archive 67G + raw 28G) — df 와 85G 차이', slot: 'cause', key: true, match: [{ output: '^9[45]G\\s+/data(/collector)?/?$', host: L }, { output: '^9[45]G\\s+total$', host: L }, { output: '^67G\\s+/data/collector/archive/?$', host: L }] },
    {
      id: 'c2_pid', label: 'logshipd 는 PID 1187, 11/02 부터 한 번도 재시작 안 함', slot: 'cause', key: true,
      match: [{ output: '^1187( |$)', host: L }, { output: '^MainPID=1187$', host: L }, { output: '^logship\\s+1187\\s', host: L }, { output: 'Main PID: 1187 \\(logshipd\\)', host: L }],
    },
    {
      id: 'c2_size', label: '지워진 파일(/proc/1187/fd/7)은 아직 85G — 링크 0개, logshipd 가 계속 쓰는 중', slot: 'cause',
      match: [{ output: '^-rw-r-----\\s+0\\s+logship\\s+adm\\s+(85G|9132\\d{7})\\s', host: L }, { output: '^pos:\\s+9132\\d{7}$', host: L }, { output: '^8[56]G\\s+/proc/1187/fd/7/?$', host: L }],
    },
    { id: 'c2_deleted', label: '/proc/1187/fd/7 -> /data/collector/raw/pay-api-01.log (deleted)', slot: 'cause', key: true, aha: '(deleted) — 이름만 지워졌다. 파일은 아직 열려 있다.', match: [{ output: '7 -> /data/collector/raw/pay-api-01\\.log \\(deleted\\)', host: L }] },
    { id: 'c2_reopen', label: '마지막으로 파일을 다시 연 것: 수 11:02 (rm 보다 앞) — 그 뒤로 HUP 없음', slot: 'cause', match: [{ output: 'SIGHUP: reopened 4 file\\(s\\)', host: L }, { output: 'ExecMainStartTimestamp=Mon 2026-11-02', host: L }] },
    { id: 'c2_readme', label: '은재 README: "숫자 두 개가 다르면? 거기서부터예요"', slot: 'cause', trace: true, match: [{ output: '숫자 두 개가 다르면\\? 거기서부터예요', host: L }] },
    { id: 'c2_hist', label: '은재 history 2024-08: "df 92% / du 51%. 숫자가 안 맞음" → /proc/…/fd | grep deleted', slot: 'cause', trace: true, match: [{ output: 'df 92% / du 51%', host: L }, { output: '# 찾았다\\. 내가 아침에 지운 그 파일', host: L }] },
    { id: 'c2_alias', label: '~/.bashrc 별칭: 숨은거', slot: 'cause', trace: true, match: [{ output: "^alias 숨은거=", host: L }] },

    { id: 'c2_rm', label: '수 14:28:41 sudo: jhpark COMMAND=/usr/bin/rm pay-api-01.log', slot: 'sequence', key: true, match: [{ output: 'jhpark : TTY=pts/1 ; PWD=/data/collector/raw ; USER=root ; COMMAND=/usr/bin/rm pay-api-01\\.log', host: L }] },
    { id: 'c2_debug', label: 'pay-api-01 수 14:22:47 로그 레벨 info → debug (재시작 없이, 끌 때까지)', slot: 'sequence', key: true, match: [{ output: 'log level changed: info -> debug', host: P }] },
    { id: 'c2_growth', label: 'logshipd 통계: pay-api-01 3.70 GB/h (평소 0.23) — rm 뒤에도 계속', slot: 'sequence', key: true, match: [{ output: 'stats: in GB/h pay-api-01=3\\.70', host: L }, { output: 'sent 3\\.70 GB/h to logs-01', host: P }] },
    { id: 'c2_drop', label: '목 07:58 logshipd: 여유 6G 아래 — DEBUG/INFO 줄을 버리기 시작 (결제 로그 포함, 알림 없음)', slot: 'sequence', match: [{ output: 'dropping DEBUG/INFO lines', host: L }, { output: 'dropped [\\d,]+ DEBUG/INFO lines', host: L }] },
    { id: 'c2_rotate', label: '서진 수 15:20: 보관 8주 → 12주 (logrotate 는 일요일에만 — 아직 안 돌았다)', slot: 'sequence', match: [{ output: '감사 대응: 보관 8주 → 12주', host: L }] },
    { id: 'c2_wiki', label: '서진 수 11:02: 새 소스 wiki-01 (시간당 0.01G)', slot: 'sequence', match: [{ output: 'source added: wiki-01', host: L }, { output: '11/11 서진: wiki-01 추가', host: L }] },

    { id: 'r2_quota', label: 'logshipd.conf: max_source_bytes = 0 (서버별 상한 없음), on_low_disk_notify = none', slot: 'responsibility', key: true, match: [{ output: '^max_source_bytes = 0', host: L }] },
    { id: 'r2_noverify', label: '지훈: 지운 지 1분 만에 접속 종료, "df는 안 봤어요" — 확인 없는 수동 조치', slot: 'responsibility', key: true, match: [{ open: 'channel:pc-logs' }, { output: '14:29:50 .*session closed for user jhpark', host: L }] },
    { id: 'r2_expiry', label: 'payment-api: 디버그는 "끌 때까지" — 만료 시각 없음', slot: 'responsibility', match: [{ output: 'stays until changed back', host: P }] },
    { id: 'r2_silent', label: 'logshipd: 로그를 버리면서 "notify: none"', slot: 'responsibility', match: [{ output: 'notify: none', host: L }, { output: '^on_low_disk_notify = none', host: L }] },
  ],

  // ------------------------------------------------------------------ report (three slots, four submissions, per-field reply)
  accusation: {
    maxSubmissions: 4,
    intro: '서진님 검토 후 오미래 CTO 에게 갈 보고서. 세 칸. 제출은 4번까지 — 틀리면 칸마다 ✓/✗ 와 서진님의 짧은 한마디가 온다.',
    feedback: 'hints',
    reply: { from: '강서진', lines: ['✗ 칸 숫자가 로그랑 안 맞아요. 다시요.', '✗ 칸만 다시 봐요.', '아직 ✗ 칸이 있어요. 한 번 더요.'], sign: '강서진' },
    // options are hypotheses of the same length and grain; the pinned evidence decides.
    // Seojin's two changes are in #로그-서버 (r2_noverify opens it): her red herrings wait for it.
    slots: [
      {
        id: 'cause',
        title: '원인 (기술)',
        prompt: '지훈이 큰 로그를 지웠는데, /data 는 왜 비지 않았고 밤새 계속 찼나?',
        type: 'single',
        options: [
          { id: 'perm', text: 'rm 이 권한 문제로 실제로는 실패해서, 지웠다던 큰 로그가 그 자리에 그대로 남아 밤새 계속 커졌다' },
          { id: 'hidden', text: 'du 가 세지 못하는 숨김 디렉터리에 다른 로그가 따로 쌓이고 있어서, 지운 만큼 다른 곳이 밤새 다시 찼다' },
          { id: 'rotate', blames: 'seojin', needs: ['r2_noverify'], text: '서진님이 늘린 보관 주기와 새로 붙인 로그 소스 때문에, 밤사이 들어온 양이 지운 양보다 훨씬 많았다' },
          { id: 'open', correct: true, text: '지운 로그를 어떤 프로세스가 아직 열어 둔 채 쓰고 있어서, 이름만 사라지고 공간은 돌아오지 않은 채 늘었다' },
          { id: 'fs', text: '파일 시스템 메타데이터가 꼬여 df 가 실제보다 많이 쓴 것처럼 보고한다 — 실제 디스크에는 여유가 충분하다' },
        ],
        evidence: [
          { id: 'usage', label: '디스크 사용량 (df · du 의 수치)', clues: ['c2_df', 'c2_du', 'c2_size'] },
          { id: 'proc', label: '프로세스 · 서비스 상태', clues: ['c2_deleted', 'c2_pid', 'c2_reopen'] },
        ],
      },
      {
        id: 'sequence',
        title: '경위 (타임라인)',
        prompt: '수요일 오후부터 목요일 09:30 까지, 무슨 순서로 일어났나? (왼쪽에서 오른쪽으로 시간순)',
        type: 'single',
        options: [
          { id: 'freed-then', blames: 'seojin', needs: ['r2_noverify'], text: '큰 로그 rm → 공간이 바로 돌아옴 → 서진님이 붙인 새 소스와 늘린 보관 주기로 밤새 다시 참 → 07:58 여유가 바닥나 로그를 버리기 시작' },
          { id: 'sunday', text: '지난 일요일 로그 정리 → 그 뒤로 매일 조금씩 차오름 (수요일엔 별일 없음) → 오늘 새벽 우연히 한계를 넘음 → 07:58 로그를 버리기 시작' },
          { id: 'true', correct: true, text: '한 서버의 로그가 갑자기 늘기 시작 → 몇 분 뒤 큰 로그 rm → 늘어난 로그가 지운 파일에 밤새 쌓임 → 07:58 여유가 바닥나 로그를 버리기 시작' },
          { id: 'rm-first', text: '큰 로그를 rm 해 공간을 먼저 비움 → 그 뒤에야 한 서버의 로그가 늘기 시작 → 새로 생긴 파일에 밤새 쌓임 → 07:58 로그를 버리기 시작' },
          { id: 'double', blames: 'jihoon', text: '큰 로그 rm 이 파일 시스템을 망가뜨림 → 그때부터 들어오는 로그가 모두 두 번씩 기록됨 → 공간을 두 배로 쓰며 밤새 참 → 07:58 로그를 버리기 시작' },
        ],
        evidence: [
          { id: 'actions', label: '누가 언제 무엇을 했는지 (명령 · 변경 기록)', clues: ['c2_rm', 'c2_debug'] },
          { id: 'volume', label: '들어온 양의 변화', clues: ['c2_growth', 'c2_drop'] },
        ],
      },
      {
        id: 'responsibility',
        title: '재발 방지 (무엇이 가능하게 했나)',
        prompt: '보고서의 이 칸에 무엇을 쓸까? 가장 크게 작용한 3개를 고르세요.',
        type: 'multi',
        // exactly three (docs/case-format.md §8): any three factors pass, the best three (65) make 100
        picks: 3,
        options: [
          { id: 'no-verify', weight: 25, text: '지운 뒤 df 로 공간이 실제로 돌아왔는지 확인하는 절차가 없었다 — "지웠으니 됐다"가 확인이었다' },
          { id: 'open-rule', weight: 20, text: '열려 있는 로그는 rm 대신 비우거나 프로세스가 다시 열게 해야 한다는 절차가 런북에 없었다' },
          { id: 'debug-expiry', weight: 20, text: '운영 중 로그 레벨을 바꿔도 만료 시각도 알림도 없어서, 켠 사람조차 끄는 것을 잊을 수 있었다' },
          { id: 'quota', weight: 20, text: '수집 서버에 서버별 용량 상한이 없어서, 한 서버의 로그가 디스크 전체를 채울 수 있었다' },
          { id: 'silent-drop', weight: 15, text: '수집 서버가 로그를 버리기 시작했다는 사실이 저널에만 남고, 사람에게는 알리지 않았다' },
          { id: 'bigger-disk', weight: -20, text: '수집 서버 디스크가 처음부터 너무 작았다 — 두 배 큰 디스크로 바꾸면 같은 일은 다시 생기지 않는다' },
          { id: 'blame-jihoon', weight: -40, blames: 'jihoon', text: '박지훈이 확인 없이 운영 서버에서 rm 을 했다 — 그의 sudo 권한을 회수하고 징계하는 것이 재발 방지다' },
          { id: 'blame-seojin', weight: -40, blames: 'seojin', needs: ['r2_noverify'], text: '강서진이 리뷰 없이 보관 주기와 수집 대상을 바꿨다 — 그의 변경 권한을 회수하는 것이 재발 방지다' },
        ],
        evidence: [
          { id: 'config', label: '설정 파일', clues: ['r2_quota', 'r2_silent'] },
          { id: 'people', label: '사람이 남긴 기록 (대화 · 접속)', clues: ['r2_noverify'] },
          { id: 'service', label: '서비스가 남긴 기록', clues: ['r2_expiry', 'r2_silent', 'c2_drop'] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ hints
  hints: {
    idleMinutes: 6,
    idle: [
      { id: 'idle-1', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c2_df', 'c2_du'], text: '음. df 하고 du, 둘 다요. 숫자가 같아야 해요.' },
      { id: 'idle-2', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c2_deleted'], text: '이름은 없어졌는데 공간은 남았다. 그럼 누가 아직 잡고 있는지. 은재 선배 history 2024-08.' },
      {
        id: 'idle-3', from: 'jihoon', channel: 'me-dm-jihoon', unlessClues: ['c2_debug'],
        text: 'ㅋㅋ 도윤님 혹시… 그 로그 제가 어제 디버그 켜서 커진 거라… pay-api-01 저널 한번 봐 주실래요?? ssh pay-api-01 하면 돼요 🙏',
        askText: '아 ㅋㅋ 그 로그 제가 어제 디버그 켜서 커진 거라… pay-api-01 저널 한번 봐 주실래요?? ssh pay-api-01 하면 돼요 🙏',
      },
      { id: 'idle-4', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c2_rm'], text: '지운 시각이 필요해요. sudo 는 저널에 남아요. --since, --until.' },
    ],
    wrong: {
      jihoon: { id: 'wrong-jihoon', from: 'jihoon', channel: 'me-dm-jihoon', text: '헉 제가 범인이에요?? 😂 지운 건 맞는데… 지웠는데 왜 안 줄었는지가 진짜 궁금해요 🙏' },
      seojin: { id: 'wrong-seojin', from: 'seojin', channel: 'me-dm-seojin', text: '보관 주기는 일요일에 돌아요. 바꾼 뒤로 한 번도 안 돌았어요. 다시요.' },
      default: { id: 'wrong-default', from: 'seojin', channel: 'me-dm-seojin', text: '음. 그 답이면 df 와 du 의 85G 차이가 설명 안 돼요.' },
    },
    // 💡 정답: the specifics behind the correct option (the options themselves stay hypotheses)
    answers: {
      cause: '지운 pay-api-01.log 를 logshipd(PID 1187)가 아직 열어 두고 쓰고 있다. rm 은 이름만 지웠고, 공간은 그 파일을 연 프로세스가 닫을 때까지 돌아오지 않는다. 디버그 로그가 그 이름 없는 파일에 밤새 계속 쌓여 df(180G)와 du(95G)가 85G 다르다',
      sequence: '수 14:22 지훈이 pay-api-01 로그 레벨을 debug 로 (재시작 없이, 끌 때까지) → 14:28 공간을 미리 비우려고 logs-01 에서 sudo rm raw/pay-api-01.log, df 확인 없이 접속 종료 → logshipd 는 지워진 파일에 시간당 약 3.7G 씩 계속 씀 → 19:30 70% 경고 → 목 04:43 90% 호출 → 07:58 여유 6G 아래, logshipd 가 DEBUG/INFO 줄을 버리기 시작 (결제 로그 유실, 알림 없음) → 09:30 97%',
      responsibility: '지훈은 rm 1분 뒤 접속 종료, df 확인 없음 · 열린 로그는 rm 대신 : > 파일 로 비우거나 HUP 으로 다시 열게 · payment-api 의 debug 는 "끌 때까지" — 만료 없음 · logshipd.conf: max_source_bytes = 0 (서버별 상한 없음), on_low_disk_notify = none',
    },
    explicit: [
      { slot: 'cause', cost: 10, unlessClues: ['c2_df', 'c2_du'], text: 'df -h 의 /data Used 와 du -sh /data/collector/* 의 합을 비교해 보세요. 같아야 정상이에요.' },
      { slot: 'cause', cost: 10, unlessClues: ['c2_pid', 'c2_deleted'], text: '파일을 쓰는 프로세스를 찾고(pgrep -f logshipd), 그 프로세스가 연 파일 목록을 보세요: ls -l /proc/<PID>/fd | grep deleted' },
      { slot: 'sequence', cost: 10, unlessClues: ['c2_rm'], text: 'journalctl -t sudo --since "2026-11-11 14:00" --until "2026-11-11 15:00" — 누가 언제 무엇을 지웠는지 sudo 줄만 골라 보여요. /var/log/auth.log 에도.' },
      { slot: 'sequence', cost: 10, unlessClues: ['c2_debug', 'c2_growth'], text: '수신량이 언제부터 늘었나: journalctl -u logshipd 의 stats 줄. 그 서버로 가서(ssh pay-api-01) journalctl -u payment-api --since "2026-11-11 14:00".' },
      { slot: 'sequence', cost: 10, text: '서진님의 두 변경(wiki-01, 보관 주기)은 언제 효과가 나나요? logrotate 는 언제 돌고, wiki-01 은 시간당 얼마나 보내나요?' },
      { slot: 'responsibility', cost: 10, unlessClues: ['r2_quota'], text: 'cat /etc/logshipd/logshipd.conf — 한 서버가 보낼 수 있는 양과, 디스크가 모자랄 때 누구에게 알리는지.' },
      { slot: 'responsibility', cost: 10, text: '이 칸은 "누가"가 아니라 "무엇이 그걸 가능하게 했나"입니다. 사람을 범인으로 고르면 틀린 칸이 돼요.' },
    ],
    ask: {
      prompts: ['뭐부터 봐요?', '막혔어요'],
      none: { from: 'jihoon', channel: 'me-dm-jihoon', text: 'ㅋㅋ 저도 이제 아는 게 없어요… 💡 힌트 패널 한번 봐요!! 🙏' },
    },
  },

  // ------------------------------------------------------------------ live scene
  triggers: [
    {
      id: 'jihoon-open',
      when: { afterMin: 2 },
      actions: [
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', text: '도윤님 ㅋㅋ 그 로그 제가 지운 거 맞아요!! 공간 미리 만들어 두려고 🙏' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 7, text: '근데 왜 안 줄었을까요… 휴지통 같은 게 있나?? 😂' } },
      ],
    },
    {
      id: 'memo-reveal',
      when: { clue: 'c2_deleted' },
      actions: [{ note: 'today' }, { toast: '메모장이 넘어간다 — "지훈님: 어제 큰 로그 지웠음 → 그럼 줄어야 하는데 (?)"' }],
    },
    {
      id: 'seojin-found',
      when: { allClues: ['c2_deleted', 'c2_du'] },
      actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 12, text: '그거예요. 이름 없는 85G. 언제부터인지도 적어요.' } }],
    },
    {
      id: 'jihoon-debug',
      when: { clue: 'c2_debug' },
      actions: [
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 8, deleteAfterSec: 4, text: 'ㅋㅋ 설마 디버그 아직 켜져 있어요??' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 16, text: '어제 끈 줄 알았어요. 지금 껐습니다. 죄송합니다.' } },
      ],
    },
    { id: 'p99-mail', when: { afterMin: 21.5 }, actions: [{ mail: 'p99' }, { toast: '새 메일 (은재님 메일함): [중요] 월요일 파트너 데모 전 결제 지연(p99) 개선 요청' }] },
  ],

  // ------------------------------------------------------------------ debrief
  debrief: {
    headline: '지운 파일도 열려 있으면 공간을 차지한다. 고쳤다고 믿은 조치는, 확인해야 조치다.',
    story: [
      { at: '2024-08', text: '은재가 같은 일을 겪는다. 아침에 raw 파일을 rm 했는데 df 92%, du 51%. 반나절 뒤 /proc/<PID>/fd 에서 "(deleted)" 를 찾고, logshipd 에 HUP 를 보내 공간을 돌려받는다. README 에 한 줄 남긴다: "숫자 두 개가 다르면?"' },
      { at: '수 11:02', text: '서진이 wiki-01 을 새 소스로 붙이고 logshipd 를 reload(HUP) 한다. logshipd 가 파일을 다시 연 마지막 순간이다.' },
      { at: '수 14:22', text: '지훈이 p99 를 보려고 pay-api-01 의 payment-api 로그 레벨을 debug 로 바꾼다. 재시작 없이, 끌 때까지. 로그가 시간당 0.23G 에서 3.7G 로.' },
      { at: '수 14:28', text: '"디버그가 많이 쌓일 테니 미리 공간을." 지훈이 logs-01 에서 sudo rm raw/pay-api-01.log (20G). 1분 뒤 접속을 끊는다. df 는 보지 않았다.' },
      { at: '수 14:28 – 목 07:58', text: 'logshipd(PID 1187)는 그 파일을 열어 둔 채였다. 디렉터리에서 이름만 사라졌고, 데이터와 공간은 프로세스가 닫을 때까지 남는다. 디버그 스트림이 이름 없는 파일에 밤새 85G 까지 쌓였다.' },
      { at: '수 15:20', text: '(같은 날) 서진이 보관 주기를 8주 → 12주로. logrotate 는 일요일에만 돈다 — 이번 일과는 관계가 없었다.' },
      { at: '수 19:30 / 목 04:43', text: '70% 경고, 90% 호출. 지훈은 "곧 반영되겠죠", 서진은 "08:30에 봐요". 지운 파일이 아직 열려 있다는 걸 아는 사람은 없었다.' },
      { at: '목 07:58', text: '여유 공간이 min_free(6G) 아래로. logshipd 가 모든 서버의 DEBUG/INFO 줄을 버리기 시작한다. 감사 기간의 결제 로그였다. 알림은 "none".' },
      { at: '목 10:12', text: '보고를 받은 서진이 logshipd 에 HUP 를 보낸다. 파일이 닫히고 85G 가 한 번에 돌아온다. 지훈은 디버그를 껐다.' },
    ],
    systemFactors: [
      '지운 뒤 df 로 확인하는 절차가 없었다 — "지웠으니 됐다"가 확인이었다. (2024-08 에도 같은 일이 있었고, 기록은 은재의 README 에만 있었다)',
      '열린 로그를 비우는 법(: > 파일, 또는 프로세스가 다시 열게 하는 HUP)이 런북에 없었다.',
      '런타임 디버그 전환에 만료 시각도 알림도 없었다.',
      '수집 서버에 서버별 용량 상한이 없었다 (max_source_bytes = 0).',
      '로그를 버리기 시작해도 사람에게 알리지 않았다 (on_low_disk_notify = none) — 감사 기간의 결제 로그였다.',
    ],
    principle: '파일 이름을 지워도, 그 파일을 열고 있는 프로세스가 있으면 공간은 돌아오지 않는다. df 와 du 가 다르면 /proc/<PID>/fd 에서 "(deleted)" 를 찾는다. 열린 로그는 rm 하지 말고 비우거나 다시 열게 하고, 무엇을 고쳤든 숫자로 확인한다.',
    cards: [
      { title: 'df 와 du 가 다르면', cmd: 'df -h /data   ·   du -sh /data/*', explain: 'df 는 파일 시스템이 실제로 쓴 블록, du 는 이름이 있는 파일들의 합. 이름 없는 파일(지웠지만 열린 파일)은 df 에만 보인다.' },
      { title: '누가 쓰고 있나', cmd: 'pgrep -f logshipd   ·   systemctl show logshipd -p MainPID,ExecMainStartTimestamp', explain: 'PID 와 언제부터 떠 있었는지. 오래 떠 있는 프로세스는 오래전에 연 파일을 아직 쥐고 있을 수 있다.' },
      { title: '지웠지만 열린 파일', cmd: 'ls -l /proc/<PID>/fd | grep deleted   ·   lsof +L1   (lsof 가 있으면)', explain: '"-> 경로 (deleted)". 크기는 ls -lL /proc/<PID>/fd/<번호>, 또는 /proc/<PID>/fdinfo/<번호> 의 pos.' },
      { title: '공간 돌려받기 (오늘은 설명만)', cmd: ': > /proc/<PID>/fd/<번호>   ·   systemctl kill -s HUP logshipd   ·   systemctl restart …', explain: '열린 파일을 0 으로 비우거나, 프로세스가 파일을 닫고 다시 열게 한다. 프로세스가 닫는 순간 공간이 돌아온다.' },
      { title: '애초에 rm 대신', cmd: ': > /data/collector/raw/pay-api-01.log   ·   logrotate 의 copytruncate / postrotate HUP', explain: '열린 로그는 이름을 지우지 말고 내용을 비운다. 회전은 프로세스에 다시 열라고 알려 주는 도구에 맡긴다.' },
      { title: '언제 누가 지웠나', cmd: 'journalctl --since "2026-11-11 14:00" --until "2026-11-11 15:00" -t sudo   ·   grep sudo /var/log/auth.log', explain: 'sudo 는 누가, 어디서(PWD), 무엇을(COMMAND) 했는지 남긴다. 사람을 찾으려는 게 아니라 시각을 맞추려고 본다.' },
      { title: '켜 둔 것은 끄는 시각과 함께', cmd: 'curl -X PUT localhost:8080/admin/log-level -d debug   →  끄는 시각을 같이 적기', explain: '디버그·임시 설정에는 만료와 알림을. 수집 서버에는 서버별 상한(max_source_bytes)과 버릴 때의 알림을.' },
    ],
    closingMail: 'closing',
    doyunLine: '지훈님이 지운 20G 는 사라진 게 아니라 이름만 없어진 채 85G 가 돼 있었어요. 다음부터 뭘 지우면 df 부터 볼게요. 은재님 포스트잇대로요. (메모했습니다)',
    cast: [
      { who: 'jihoon', text: '도와주려고 미리 지웠다. 확인하지 않았을 뿐이다. 디버그를 켠 것도, 끄는 걸 잊은 것도 같은 하루의 "살짝"이었다. 마지막엔 마침표를 찍었다.' },
      { who: 'seojin', text: '두 가지를 바꿨고 둘 다 의심받았다. 둘 다 관계가 없었다. 04:43 의 "08:30에 봐요" 는 지운 파일이 열려 있다는 걸 몰랐기 때문이다.' },
      { who: 'eunjae', text: '2024년에 똑같이 넘어졌다. 그날 적은 README 와 포스트잇 "지운 다음엔 꼭 df" 가 오늘의 답이었다. 내일이 마지막 출근이다.' },
      { who: 'doyun', text: '처음으로 "프로세스가 연 파일" 을 직접 봤다. 사흘 뒤 금요일 사건의 fd 한도로 가는 다리다.' },
    ],
  },

  goal: { intro: '서진님 검토 뒤 오미래 CTO 에게 갈 보고서. 세 칸을 채우면 사건이 끝나요. 제출은 4번까지 — 틀리면 칸마다 ✓/✗ 로 알려 줘요.' },

  // ------------------------------------------------------------------ first minutes
  opening: {
    briefing: {
      lockTime: '09:30',
      lockDate: '11월 12일 목요일',
      caller: 'seojin',
      kind: 'voice',
      voiceCue: 'voice.briefing-case2-seojin',
      lines: [
        { text: '도윤님. logs-01 /data 97%예요.', pauseMs: 1000 },
        { text: '어제 지훈님이 큰 로그를 지웠대요. 그런데 안 줄었어요. 밤새 더 찼어요.', pauseMs: 1200 },
        { text: '07:58부터 로그 서버가 결제 로그를 버리고 있어요. 감사 기간이라 미래님 메일도 왔어요.', pauseMs: 1300 },
        { text: '왜 안 줄었는지, 언제부터, 무엇이 그걸 가능하게 했는지. 세 칸이에요.', pauseMs: 1200 },
        { text: '은재 선배 세션으로 봐요. 고치는 건 원인 적고 나서.', pauseMs: 1400 },
      ],
      mail: 'brief',
      mailPreview: '로그 서버(logs-01) 디스크 경보 건으로 결제 로그 유실 여부 확인 부탁드립니다. 오늘 18:00까지.',
    },
    objectives: {
      title: '오늘 할 일 (Case 2)',
      items: [
        { id: 'gap', text: '디스크는 정말 찼나, 파일은 다 어디 있나', hint: '두 가지 숫자를 나란히 놓아 보세요.', any: [{ clue: 'c2_du' }], pulse: 'terminal' },
        { id: 'holder', text: '지운 파일은 어디로 갔나', any: [{ clue: 'c2_deleted' }] },
        { id: 'pins', text: '증거 3개 핀 → 보고서 쓰기 (칸마다 하나 이상) 📌', any: [{ pins: 3 }] },
      ],
      after: ['다음: 📝 보고서 — 원인, 경위, 재발 방지 세 칸 (제출 4번)', '언제부터: 지운 시각, 그리고 로그를 보낸 쪽 서버', '막히면: ~/README.txt, history, 💡'],
    },
  },

  shell: {
    allow: ['ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'grep', 'df', 'du', 'history', 'systemctl', 'journalctl', 'crontab', 'id', 'echo', 'which', 'type', 'env', 'printenv', 'ps', 'pgrep', 'pidof', 'wc', 'sort', 'uniq', 'ssh', 'exit', 'logout', 'man', 'help', 'hint', 'clear'],
    refuse: "조사 세션: '{cmd}' 은(는) 오늘 범위 밖이에요 (읽기 전용 조사 세션).\n  쓸 수 있는 명령은 help 로 볼 수 있어요.",
    help: [
      '누리클라우드 조사 모드 셸 — 읽기 전용 세션 (남은재 계정)',
      'Case 2 에서 쓸 수 있는 명령:',
      '  둘러보기    ls [-l] [-a]  cd  pwd',
      '  파일 보기   cat  head  tail  grep  wc -l  sort  uniq',
      '  디스크      df -h      du -sh <경로>',
      '  기록        history    journalctl [-u 서비스] [-t sudo] [--since …] [--until …]',
      '  서비스      systemctl status|show|cat <서비스>',
      '  프로세스    ps aux  pgrep [-f] <이름>  ls -l[L] /proc/<PID>/fd[/<번호>]  cat /proc/<PID>/fdinfo/<번호>',
      '  이동        ssh pay-api-01   exit',
      '  그 밖에     crontab -l  id  echo  env  which  type',
      '  기타        man <명령>  help  hint (💡 힌트 패널)  clear',
      '바꾸는 명령(rm, kill, systemctl restart, lsof 설치 …)은 조사 모드에서 막혀 있어요. 이 서버엔 lsof 가 없어요.',
      '팁: man journalctl, man du. ↑/↓ 이전 명령, Tab 자동완성, 줄 옆 📌 로 증거 보드에 핀.',
    ],
  },

  boot: {
    status: '짐 정리 중 · 14:00 인수인계 회의 · 내일 마지막 출근 🌱',
    unlock: '은재님이 열어 둔 세션으로 들어가기',
    note: '조사 세션 — 읽기 전용이라 아무것도 망가지지 않아요.',
  },

  // ------------------------------------------------------------------ 숙련자 모드 (docs/campaign-ladder.md §숙련자 모드)
  // Red herring: "files hidden under a mount point". With wiki-01, Seojin also mounted a 2G tmpfs
  // over /data/collector/spool, and systemd noted the directory was not empty. Files under a mount
  // point do count in df and not in du — the other textbook reason for df ≠ du. It is ruled out
  // by logshipd's own line a second earlier (it flushed the spool into raw/ and kept only its lock
  // file) and because covered files cannot grow, while /data grew 3.7G/h all night.
  // Records: Eunjae's 2024-08 history keeps only the HUP that gave the space back; README, .bashrc
  // (no 숨은거 alias), logshipd.conf and pay-api-01's README lose their how-to lines.
  // Human trace: Jihoon's reply-all to Mirae, his own account of Wednesday — debug "briefly, then
  // off", and "last week's" file removed. The journals say otherwise: debug from 14:22:47 with no
  // switch back (logshipd's stats stay at 3.70 all night), and raw/ is this week's open file.
  expert: {
    maxSubmissions: 2,
    parMin: 16,
    intro: '서진님 검토 후 오미래 CTO 에게 갈 보고서. 세 칸. 제출은 2번까지 — 틀리면 칸마다 ✓/✗ 만 온다.',
    goalIntro: '서진님 검토 뒤 오미래 CTO 에게 갈 보고서. 세 칸을 채우면 사건이 끝나요. 제출은 2번까지 — 틀리면 칸마다 ✓/✗ 만 알려 줘요.',
    after: ['다음: 📝 보고서 — 원인, 경위, 재발 방지 세 칸 (제출 2번)', '막히면: ~/README.txt, history, 💡 (숙련자 모드: 감점)'],
    history: [
      {
        host: L,
        user: 'eunjae',
        lines: [
          { at: '2023-09-14T15:40:02', cmd: 'sudo systemctl enable --now logshipd' },
          { at: '2024-08-21T10:31:05', cmd: 'ls -la /data/collector/raw' },
          { at: '2024-08-21T10:44:02', cmd: 'sudo systemctl kill -s HUP logshipd' },
          { at: '2024-08-21T10:45:40', cmd: '# 92% → 51%. 🌱' },
          { at: '2026-11-12T09:25:02', cmd: '# 도윤님, 오늘은 logs-01. README 먼저 🌱' },
        ],
      },
    ],
    mails: [
      {
        id: 'jihoon-account', account: 'me', folder: 'inbox', from: 'jihoon', to: '오미래', cc: '인프라팀 (한도윤 외)', at: '2026-11-12T09:16',
        subject: 'RE: [중요] 로그 서버 디스크 — 결제 로그 유실 여부 확인 요청',
        body: '미래님,\n어제 제가 한 작업 공유드립니다!!\n\n- 14:10쯤 pay-api-01 결제 API 디버그 로그를 잠깐 켜서 p99 확인하고, 끝나고 바로 껐습니다.\n- 14:30쯤 logs-01 에서 지난주 결제 로그(raw/pay-api-01.log, 20G 정도)를 지웠습니다. 이번 주 로그는 건드리지 않았습니다.\n- 그 뒤로는 두 서버 다 손대지 않았습니다.\n\n혹시 제 작업 때문이면 말씀 주세요 🙏\n박지훈 드림',
      },
    ],
    df: [
      {
        host: L,
        lines: [
          'Filesystem      Size  Used Avail Use% Mounted on',
          'tmpfs           794M  1.3M  793M   1% /run',
          '/dev/sda1        48G   11G   35G  24% /',
          'tmpfs           3.9G     0  3.9G   0% /dev/shm',
          `/dev/sdb1       ${DATA_DF.size}  ${DATA_DF.used}  ${DATA_DF.avail}  ${DATA_DF.pct} /data`,
          'tmpfs           2.0G  8.0K  2.0G   1% /data/collector/spool',
          'tmpfs           794M  4.0K  794M   1% /run/user/1001',
        ],
      },
    ],
    files: [
      { host: L, file: { path: '/home/eunjae/README.txt', mtime: '2024-08-21T11:00', content: 'logs-01 — 로그 수집 서버 (남은재, 2023-09 / 2024-08 고침)\n\nraw/<서버>.log 는 이번 주, archive/ 는 지난주들 (일요일 00:00 logrotate).\nraw 파일은 rm 하지 마세요. (2024-08에 제가 그랬다가 반나절을 헤맸어요…)\n조사할 때는 아무것도 지우지 마세요. :)' } },
      { host: L, file: { path: '/home/eunjae/.bashrc', mtime: '2024-08-21T11:02', content: EUNJAE_BASHRC.slice(0, EUNJAE_BASHRC.indexOf('\n\n# 다음 사람')) } },
      { host: L, file: { path: '/home/eunjae/.ssh/config', mode: '600', mtime: '2025-02-11T14:20', content: 'Host pay-api-01\n  HostName 10.20.1.11' } },
      { host: L, file: { path: '/etc/logshipd/logshipd.conf', mtime: '2023-09-14T15:30', content: LOGSHIPD_CONF.split('\n').filter((l) => !/^# (서버마다|다시 열기)/.test(l)).map((l) => l.replace(/\s+# (이보다 적으면|0 = 서버별).*$/, '')).join('\n') } },
      { host: P, file: { path: '/home/eunjae/README.txt', mtime: '2025-11-03T16:40', content: '# pay-api-01 — 결제 API 1호기\n왜: 결제 API. 2018-04 첫 구성 (은재). 02호기와 같은 구성.\n- 설정: /etc/payment-api/config.yaml (pay-cfg 저장소에서 매시 5분 pull)\n다음 사람에게: 서버들은 생각보다 착해요.' } },
      {
        host: L,
        file: {
          path: '/etc/fstab',
          mtime: '2026-11-11T11:01',
          content: [
            '# /etc/fstab: static file system information.',
            '# <file system>                           <mount point>          <type>  <options>                              <dump> <pass>',
            'UUID=5b0e3c2a-7d1f-4e8b-9a61-2f3c4d5e6a7b  /                      ext4    errors=remount-ro                      0      1',
            'UUID=9c8d7e6f-1a2b-4c3d-8e9f-0a1b2c3d4e5f  /data                  ext4    defaults,noatime                       0      2',
            '# 11/11 서진: 수신 버퍼(spool)는 메모리로 — 디스크 덜 쓰게',
            'tmpfs                                      /data/collector/spool  tmpfs   size=2G,mode=0750,uid=logship,gid=logship  0  0',
          ].join('\n'),
        },
      },
      { host: L, file: { path: '/data/collector/spool/wiki-01.buf', content: '', size: 4096, binary: '수신 버퍼 (바이너리)', owner: 'logship', group: 'logship', mode: '640', mtime: '2026-11-12T09:30' } },
    ],
    timeline: [
      {
        at: '2026-11-11T11:01:48',
        emits: [
          j(L, 'session-873.scope', '  sjkang : TTY=pts/0 ; PWD=/home/sjkang ; USER=root ; COMMAND=/usr/bin/mount /data/collector/spool', { ident: 'sudo', pid: 39188, priority: 5 }),
          shipd('spool: flushed 2 buffer file(s) (38M) into raw/ before remount; kept logshipd.lock'),
        ],
      },
      {
        at: '2026-11-11T11:01:49',
        emits: [
          j(L, 'data-collector-spool.mount', 'data-collector-spool.mount: Directory /data/collector/spool to mount over is not empty, mounting anyway.', { ident: 'systemd', pid: 1, priority: 5 }),
          j(L, 'data-collector-spool.mount', 'Mounting data-collector-spool.mount - /data/collector/spool...', { ident: 'systemd', pid: 1 }),
          j(L, 'data-collector-spool.mount', 'Mounted data-collector-spool.mount - /data/collector/spool.', { ident: 'systemd', pid: 1 }),
        ],
      },
      { at: '2026-11-11T11:05:40', emits: [msg('pc-logs', 'seojin', 'spool 은 tmpfs(2G)로 붙였어요. 디스크 덜 쓰게.')] },
    ],
    clues: [
      { id: 'c2x_spool', label: '수 11:02 logshipd: spool 을 raw/ 로 비우고 잠금 파일만 남긴 뒤 tmpfs 마운트 — 가려진 건 잠금 파일 하나', slot: 'cause', match: [{ output: 'spool: flushed 2 buffer file\\(s\\) \\(38M\\)', host: L }] },
    ],
    options: [
      { slot: 'cause', at: 2, option: { id: 'mount', text: '어제 /data 아래 새로 붙인 마운트가 원래 있던 파일들을 가려서, du 에는 안 보여도 공간은 그대로 차지한다' } },
    ],
  },
};
