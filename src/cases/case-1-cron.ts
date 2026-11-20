// Case 1 — 「밤에만 실패하는 스크립트」
// Ladder and framing: docs/campaign-ladder.md. Characters and voices: data/infra-mystery-game/characters.md.
// All people, hosts, companies and logs are fictional. Read docs/case-format.md before editing.
//
// Framing: Wednesday 2026-11-11, the day after Case 0, same host (wiki-01). Seojin had handed Doyun
// a homework: a temporary cleanup script for wiki.log until a logrotate rule exists. On Tuesday
// 18:41 Doyun put it in the departed senior's crontab (his own account is not in /etc/cron.allow),
// every hour on the hour, after testing it in his terminal. Eunjae is on a half day off and speaks
// only through old records: the two comment lines at the top of the crontab, ~/log/cron-env.txt,
// an `env -i …` test line in the history, and a mail sent on Tuesday.
//
// One cause: cron is not a login shell. A user crontab runs with PATH=/usr/bin:/bin, SHELL=/bin/sh
// and the home directory as working directory; it reads neither ~/.bashrc nor ~/.profile. The
// script calls `wikictl`, which lives in /opt/wiki/bin; only Eunjae's ~/.bashrc adds that to PATH.
// Under cron the call fails with "command not found" every hour, the script still prints
// "정리 끝 ✓", and the output goes to ~/wiki-clean.log (the redirect is relative, so it is relative
// to $HOME), not to ~/bin/wiki-clean.log, where Doyun looks. Nobody is told.
// Why it mattered: on Tuesday Seojin marked the broken thumbnail job as failed but left
// retry_delay_sec = 0; the wiki requeues failed jobs every night at 00:00 (a default nobody knew),
// so the retry loop from Case 0 restarted at 00:00:05 and wiki.log grew about 1G an hour again.
// Red herring: Jihoon raised nginx client_max_body_size at 23:12 the same night.

import type { CaseFile, Emit, TimelineEvent } from '../engine/types.ts';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const W = 'wiki-01';

/** Bytes per second the retry loop writes to wiki.log (the same loop as Case 0: 11.2G in 11h33m). */
export const LOOP_BYTES_PER_SEC = Math.round((11.2 * GiB) / 41589);
/** wiki.log right after Seojin emptied it on Tuesday, plus a day of normal logging. */
const QUIET_BYTES = Math.round(2.1 * MiB);
/** Seconds since the loop restarted (2026-11-11 00:00:05) at a local time on Wednesday. */
const since = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s - 5;
/** wiki.log at 09:30, when the game starts. */
export const WIKI_LOG_BYTES = QUIET_BYTES + since(9, 30) * LOOP_BYTES_PER_SEC;
const sizeMB = (h: number, m: number, s = 1) => Math.floor((QUIET_BYTES + Math.max(0, since(h, m, s)) * LOOP_BYTES_PER_SEC) / MiB);
const PER_SEC_ATTEMPTS = 670;
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const failure = (stamp: string, attempt: number) => [
  `${stamp} WARN thumbnail attach/8812 failed: PDF parse error (xref table broken) — retrying (attempt ${grouped(attempt)})`,
  'Traceback (most recent call last):',
  '  File "/opt/wiki/lib/thumbs.py", line 88, in render',
  '    doc = pdf.open(path)',
  '  File "/opt/wiki/lib/pdf.py", line 214, in open',
  '    raise PdfParseError("xref table broken")',
  'wiki.thumbs.PdfParseError: xref table broken',
];

/** Sample of the 9G wiki.log: it starts when Seojin emptied it on Tuesday 10:40. */
function wikiLog(): string {
  const at = (h: number, m: number, s: number) => Math.max(1, since(h, m, s) * PER_SEC_ATTEMPTS);
  return [
    '2026-11-10 10:40:02 INFO wiki-server 1.4.2 started (log_file=/var/log/wiki/wiki.log)',
    '2026-11-10 10:40:02 INFO thumbnail worker ready (retry_delay_sec=0)',
    '2026-11-10 10:40:03 INFO jobs: 1 failed job(s) kept (attach/8812); requeue_failed=daily 00:00',
    '2026-11-10 10:41:15 INFO GET /wiki/RB-019 200 (sjkang)',
    '2026-11-10 14:22:40 INFO GET /wiki/Home 200 (dyhan)',
    '2026-11-10 18:36:12 INFO admin: log truncate requested (keep_tail=50M) — 2.1M, nothing to do',
    '2026-11-10 23:14:51 INFO GET /wiki/결제팀-주간회의 200 (jhpark)',
    '2026-11-11 00:00:05 INFO maintenance: requeued 1 failed job(s): attach/8812',
    ...failure('2026-11-11 00:00:05', 1),
    ...failure('2026-11-11 00:00:05', 2),
    ...failure('2026-11-11 03:00:05', at(3, 0, 5)),
    '2026-11-11 03:00:05 INFO nightly search index refreshed (1,286 pages)',
    ...failure('2026-11-11 07:15:00', at(7, 15, 0)),
    ...failure('2026-11-11 09:29:58', at(9, 29, 58)),
    ...failure('2026-11-11 09:29:59', at(9, 29, 59)),
  ].join('\n');
}

const SCRIPT = `#!/bin/bash
# wiki.log 임시 정리 — 한도윤 (11/10, 서진님 숙제!!)
# logrotate 규칙 생기기 전까지만. 매시 정각 cron.
# 테스트: cd ~/bin && ./wiki-log-clean.sh --force >> wiki-clean.log  → 잘 됨 ✓

LOG=/var/log/wiki/wiki.log
LIMIT_MB=500
SIZE_MB=$(( $(stat -c %s "$LOG") / 1048576 ))

if [ "$SIZE_MB" -lt "$LIMIT_MB" ] && [ "$1" != "--force" ]; then
  echo "$(date '+%F %T') wiki.log \${SIZE_MB}M — 괜찮음"
  exit 0
fi
echo "$(date '+%F %T') wiki.log \${SIZE_MB}M — 정리 시작"
wikictl log truncate --keep-tail 50M
echo "$(date '+%F %T') 정리 끝 ✓"`;

const DISK_REPORT = `#!/bin/bash
# 월요일 09:00 디스크 리포트 (은재, 2024-03)
# cron에서 도니까 전부 절대 경로로. 내 터미널의 PATH를 믿지 말 것.
/usr/bin/date '+%F %T'
/usr/bin/df -h /var
/usr/bin/du -sh /var/log/* 2>/dev/null
/opt/wiki/bin/wikictl stats --short`;

const CRONTAB = `# m h dom mon dow  command
# cron은 로그인 셸이 아니에요. PATH가 /usr/bin:/bin 뿐이라 명령은 절대 경로로. (은재, 2024-03)
# 출력은 어디로 가는지 꼭 정하기. 아무도 안 보는 곳에 쓰면 실패도 안 보여요.
0 9 * * 1 /home/eunjae/bin/disk-report.sh > /home/eunjae/log/disk-report.txt 2>&1

# 11/10 한도윤 — wiki.log 임시 정리 (매시 정각) 🙇
0 * * * * ~/bin/wiki-log-clean.sh >> wiki-clean.log 2>&1`;

const CRON_ENV = `HOME=/home/eunjae
LOGNAME=eunjae
PATH=/usr/bin:/bin
SHELL=/bin/sh
PWD=/home/eunjae`;

const EUNJAE_BASHRC = `# ~/.bashrc — eunjae (wiki-01)
[ -z "$PS1" ] && return
export HISTTIMEFORMAT='%F %T '
export HISTSIZE=100000
shopt -s histappend
PS1='\\u@\\h:\\w\\$ '
export PATH="$PATH:/opt/wiki/bin"   # wikictl (2023-04)
alias ll='ls -alh'

# 다음 사람: 이 아래는 지워도 돼요
alias 디스크='df -h; du -sh /var/log/* 2>/dev/null'
alias 물주기='echo 🌱'`;

const README = `wiki-01 — 다음 사람에게 (남은재, 2023-04 처음 씀 / 2025-06 고침)

왜: 사내 위키 서버. 서진님 런북(RB-001~)이 여기 있어요.
    위키가 죽으면 런북도 못 봐요… 그래서 이 메모는 위키가 아니라 서버에 둡니다.

장애 나면 제 순서 (2025-06 디스크 장애 때 정리):
  1. df -h                 디스크부터. Use% 100% 인 줄이 있나? 어디(Mounted on)가 찼나?
  2. du -sh /var/log/*     꽉 찬 곳 안에서 누가 큰가?
  3. tail -n 20 <큰 파일>   그 파일 끝에 같은 줄이 계속 반복되나?
  4. systemctl status wiki  서비스는 살아 있나?
  5. journalctl -u wiki    언제부터였나? 시간을 먼저 적어요. 사람은 그다음.

위키 관리 도구: wikictl (/opt/wiki/bin). 로그 자르기, 작업 큐, 통계.
참고로… 위키 로그(/var/log/wiki/wiki.log)는 아직 logrotate에 안 걸려 있어요. TODO (2023-04).
조사할 때는 아무것도 지우지 마세요. 고치는 건 원인을 적고 나서. :)`;

const ETC_CRONTAB = `# /etc/crontab: system-wide crontab
# Unlike any other crontab you don't have to run the \`crontab'
# command to install the new version when you edit this file
# and files in /etc/cron.d. These files also have username fields,
# that none of the other crontabs do.

SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Example of job definition:
# .---------------- minute (0 - 59)
# |  .------------- hour (0 - 23)
# |  |  .---------- day of month (1 - 31)
# |  |  |  .------- month (1 - 12) OR jan,feb,mar,apr ...
# |  |  |  |  .---- day of week (0 - 6) (Sunday=0 or 7) OR sun,mon,tue,wed,thu,fri,sat
# |  |  |  |  |
# *  *  *  *  * user-name command to be executed
17 *	* * *	root    cd / && run-parts --report /etc/cron.hourly
25 6	* * *	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )
47 6	* * 7	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.weekly )
52 6	1 * *	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.monthly )
#`;

const NGINX_SITE = `# wiki.nuricloud.example — 2023-04 eunjae
server {
    listen 80;
    server_name wiki.nuricloud.example;
    # 2026-11-10 jhpark: 첨부 50MB까지 (회의록 PDF가 커서요 🙏 서진님 OK)
    client_max_body_size 50m;
    access_log /var/log/nginx/access.log;
    error_log  /var/log/nginx/error.log;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`;

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

const CRON_UNIT = `[Unit]
Description=Regular background program processing daemon
Documentation=man:cron(8)
After=remote-fs.target nss-user-lookup.target

[Service]
EnvironmentFile=-/etc/default/cron
ExecStart=/usr/sbin/cron -f -P $EXTRA_OPTS
IgnoreSIGPIPE=false
KillMode=process
Restart=on-failure

[Install]
WantedBy=multi-user.target`;

// ------------------------------------------------------------------ the ~/wiki-clean.log cron wrote
function homeCleanLog(): string {
  const out: string[] = [];
  const stamp = (d: string, h: number) => `2026-11-${d} ${String(h).padStart(2, '0')}:00:01`;
  for (let h = 19; h <= 23; h++) out.push(`${stamp('10', h)} wiki.log 2M — 괜찮음`);
  out.push(`${stamp('11', 0)} wiki.log 2M — 괜찮음`);
  for (let h = 1; h <= 9; h++) {
    out.push(`${stamp('11', h)} wiki.log ${sizeMB(h, 0)}M — 정리 시작`);
    out.push('/home/eunjae/bin/wiki-log-clean.sh: line 15: wikictl: command not found');
    out.push(`${stamp('11', h)} 정리 끝 ✓`);
  }
  return out.join('\n');
}

const TEST_LOG = [
  '2026-11-10 18:36:12 wiki.log 2M — 정리 시작',
  'wikictl: /var/log/wiki/wiki.log is 2.1M (<= keep-tail 50M), nothing to truncate',
  '2026-11-10 18:36:12 정리 끝 ✓',
].join('\n');

const DISK_REPORT_TXT = [
  '2026-11-09 09:00:01',
  'Filesystem      Size  Used Avail Use% Mounted on',
  '/dev/sdb1        20G  8.1G   11G  43% /var',
  '138M\t/var/log/nginx',
  '41M\t/var/log/syslog',
  '1.9M\t/var/log/wiki',
  'pages=1284 attachments=8811 jobs_failed=0 log=/var/log/wiki/wiki.log (1.9M)',
].join('\n');

// ------------------------------------------------------------------ timeline helpers
const j = (unit: string, msg: string, extra: Partial<Extract<Emit, { kind: 'journal' }>> = {}): Emit => ({ kind: 'journal', host: W, unit, msg, ...extra });
const wiki = (msg: string, priority = 6, pid = 52210) => j('wiki.service', msg, { ident: 'wiki-server', pid, priority });
const sysd = (unit: string, msg: string, priority = 6) => j(unit, msg, { ident: 'systemd', pid: 1, priority });
const hist = (cmd: string): Emit => ({ kind: 'history', host: W, user: 'eunjae', cmd });
const msg = (channel: string, from: string, text: string): Emit => ({ kind: 'message', channel, from, text });

/** cron's own journal: Doyun's hourly job, the system hourly run-parts, e2scrub. */
function cronEvents(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  let pid = 58200;
  const run = (at: string, user: string, uid: number, cmd: string) => {
    const p = pid;
    pid += 2;
    out.push({
      at,
      emits: [
        j('cron.service', `pam_unix(cron:session): session opened for user ${user}(uid=${uid}) by (uid=0)`, { ident: 'CRON', pid: p }),
        j('cron.service', `(${user}) CMD (${cmd})`, { ident: 'CRON', pid: p + 1 }),
      ],
    });
    out.push({ at: at.replace(/:01$/, ':02'), emits: [j('cron.service', `pam_unix(cron:session): session closed for user ${user}`, { ident: 'CRON', pid: p })] });
  };
  run('2026-11-09T09:00:01', 'eunjae', 1001, '/home/eunjae/bin/disk-report.sh > /home/eunjae/log/disk-report.txt 2>&1');
  for (const [d, h] of [['10', 9], ['10', 10], ['10', 11], ['10', 12], ['10', 13], ['10', 14], ['10', 15], ['10', 16], ['10', 17], ['10', 18]] as const)
    run(`2026-11-${d}T${String(h).padStart(2, '0')}:17:01`, 'root', 0, 'cd / && run-parts --report /etc/cron.hourly');
  out.push({ at: '2026-11-10T18:42:01', note: 'Doyun saved the crontab at 18:41', emits: [j('cron.service', '(eunjae) RELOAD (crontabs/eunjae)', { ident: 'cron', pid: 612 })] });
  const hours: [string, number][] = [];
  for (let h = 19; h <= 23; h++) hours.push(['10', h]);
  for (let h = 0; h <= 9; h++) hours.push(['11', h]);
  for (const [d, h] of hours) {
    const hh = String(h).padStart(2, '0');
    run(`2026-11-${d}T${hh}:00:01`, 'eunjae', 1001, '~/bin/wiki-log-clean.sh >> wiki-clean.log 2>&1');
    if (!(d === '11' && h === 9)) run(`2026-11-${d}T${hh}:17:01`, 'root', 0, 'cd / && run-parts --report /etc/cron.hourly');
  }
  run('2026-11-11T03:10:01', 'root', 0, 'test -e /run/systemd/system || SERVICE_MODE=1 /sbin/e2scrub_all -A -r');
  run('2026-11-11T06:25:01', 'root', 0, 'test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )');
  return out;
}

/** The loop restarts at 00:00:05; journald rate-limits it once an hour. */
function loopEvents(): TimelineEvent[] {
  const out: TimelineEvent[] = [
    { at: '2026-11-11T00:00:05', note: 'requeue_failed (default daily 00:00) puts attach/8812 back', emits: [wiki('INFO maintenance: requeued 1 failed job(s): attach/8812 (requeue_failed=daily 00:00)'), wiki('WARN thumbnail attach/8812 failed: PDF parse error (xref table broken) — retrying (attempt 1)', 4)] },
    { at: '2026-11-11T03:00:05', emits: [wiki('INFO nightly search index refreshed (1,286 pages)')] },
  ];
  for (let h = 0; h <= 9; h++) out.push({ at: `2026-11-11T${String(h).padStart(2, '0')}:00:33`, emits: [j('wiki.service', `Suppressed ${grouped(19_790 + ((h * 41) % 67))} messages from wiki.service`, { ident: 'systemd-journald', pid: 298 })] });
  return out;
}

const sized = (path: string, size: number, binary: string, owner = 'root', mode = '644') => ({ path, content: '', size, binary, owner, mode });

export const caseOneCron: CaseFile = {
  id: 'case1-cron-env',
  title: '밤에만 실패하는 스크립트',
  subtitle: '수요일 07:15, /var 80% 알림. 어젯밤 매시간 돌았어야 할 정리 스크립트는 — 내 거다.',
  company: '누리클라우드',
  domain: 'nuricloud.example',
  clock: { start: '2026-11-11T09:30:00', deadline: '2026-11-11T12:00:00', tz: '+09:00', rate: 10 },
  player: 'doyun',
  owner: 'eunjae',

  people: {
    doyun: { name: '한도윤', role: '인프라팀 · 입사 2주차 (나)', initial: '도', color: '#2F3E5C', login: 'dyhan', avatar: 'characters/doyun-avatar.webp', avatarSmall: 'characters/doyun-avatar-64.webp', portrait: 'characters/doyun-full.webp' },
    seojin: { name: '강서진', role: '시니어 SRE · 도윤의 사수', initial: '서', color: '#3A3D42', login: 'sjkang', avatar: 'characters/seojin-avatar.webp', avatarSmall: 'characters/seojin-avatar-64.webp', portrait: 'characters/seojin-full.webp' },
    jihoon: { name: '박지훈', role: '결제개발팀 리드', initial: '지', color: '#F08A3C', login: 'jhpark', avatar: 'characters/jihun-avatar.webp', avatarSmall: 'characters/jihun-avatar-64.webp', portrait: 'characters/jihun-full.webp' },
    eunjae: { name: '남은재', role: '수석 엔지니어 · 오전 반차 · 11/13 퇴사 예정', initial: '은', color: '#6B7350', login: 'eunjae', avatar: 'characters/eunjae-avatar.webp', avatarSmall: 'characters/eunjae-avatar-64.webp', portrait: 'characters/eunjae-full.webp' },
    bot: { name: '알림봇', role: '모니터링', initial: '⚠', color: '#9A9A9A' },
    wikibot: { name: '위키 알림', role: '', initial: 'W', color: '#8A8580' },
    hr: { name: '인사팀', role: '', initial: '인', color: '#8A8580' },
  },

  // ------------------------------------------------------------------ the one host (same as Case 0, a day later)
  hosts: [
    {
      name: W,
      user: 'eunjae',
      ip: '10.20.3.21',
      motd: ['Nuri wiki-01 (Ubuntu 22.04 LTS) — 사내 위키', '조사 모드 (읽기 전용) — 명령 목록: help'],
      uptime: 'up 9 days,  1:30,  1 user,  load average: 0.71, 0.66, 0.62',
      // the login shell's PATH: Ubuntu's default plus /opt/wiki/bin from ~/.bashrc
      env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin:/opt/wiki/bin' },
      groups: { adm: { gid: 4, members: ['eunjae'] }, 'systemd-journal': { gid: 101, members: ['eunjae'] }, wiki: { gid: 998, members: [] }, crontab: { gid: 105, members: [] } },
      df: [
        'Filesystem      Size  Used Avail Use% Mounted on',
        'tmpfs           392M  1.1M  391M   1% /run',
        '/dev/sda1        30G  7.9G   21G  28% /',
        'tmpfs           2.0G     0  2.0G   0% /dev/shm',
        '/dev/sdb1        20G   17G  1.6G  92% /var',
        'tmpfs           392M  4.0K  392M   1% /run/user/1001',
      ],
      crontabs: { eunjae: CRONTAB },
      units: [
        {
          name: 'wiki.service', unitFile: WIKI_UNIT, pid: 52210,
          props: { Id: 'wiki.service', Description: 'Nuri Wiki (사내 위키)', MainPID: '52210', ActiveState: 'active', SubState: 'running', User: 'wiki', NRestarts: '0', ExecMainStartTimestamp: 'Tue 2026-11-10 10:40:02 KST' },
          statusLines: [
            '● wiki.service - Nuri Wiki (사내 위키)',
            '     Loaded: loaded (/etc/systemd/system/wiki.service; enabled; vendor preset: enabled)',
            '     Active: active (running) since Tue 2026-11-10 10:40:02 KST; 22h ago',
            '   Main PID: 52210 (wiki-server)',
            '      Tasks: 9 (limit: 4585)',
            '     Memory: 212.4M',
            '        CPU: 6h 2min 11.402s',
            '     CGroup: /system.slice/wiki.service',
            '             └─52210 /opt/wiki/bin/wiki-server --config /etc/wiki/wiki.conf',
            '',
            'Nov 11 06:00:33 wiki-01 systemd-journald[298]: Suppressed 19,836 messages from wiki.service',
            'Nov 11 07:00:33 wiki-01 systemd-journald[298]: Suppressed 19,810 messages from wiki.service',
            'Nov 11 08:00:33 wiki-01 systemd-journald[298]: Suppressed 19,851 messages from wiki.service',
            'Nov 11 09:00:33 wiki-01 systemd-journald[298]: Suppressed 19,825 messages from wiki.service',
          ],
        },
        {
          name: 'cron.service', unitFile: CRON_UNIT, pid: 612,
          props: { Id: 'cron.service', Description: 'Regular background program processing daemon', MainPID: '612', ActiveState: 'active', SubState: 'running', NRestarts: '0', ExecMainStartTimestamp: 'Mon 2026-11-02 08:00:04 KST' },
          statusLines: [
            '● cron.service - Regular background program processing daemon',
            '     Loaded: loaded (/lib/systemd/system/cron.service; enabled; vendor preset: enabled)',
            '     Active: active (running) since Mon 2026-11-02 08:00:04 KST; 1 week 2 days ago',
            '       Docs: man:cron(8)',
            '   Main PID: 612 (cron)',
            '      Tasks: 1 (limit: 4585)',
            '     Memory: 1.9M',
            '        CPU: 4.118s',
            '     CGroup: /system.slice/cron.service',
            '             └─612 /usr/sbin/cron -f -P',
            '',
            'Nov 11 09:00:01 wiki-01 CRON[58431]: (eunjae) CMD (~/bin/wiki-log-clean.sh >> wiki-clean.log 2>&1)',
            'Nov 11 09:00:02 wiki-01 CRON[58430]: pam_unix(cron:session): session closed for user eunjae',
          ],
        },
        {
          name: 'nginx.service', pid: 911,
          unitFile: "[Unit]\nDescription=A high performance web server and a reverse proxy server\n\n[Service]\nType=forking\nExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'\nExecReload=/usr/sbin/nginx -g 'daemon on; master_process on;' -s reload",
          props: { Id: 'nginx.service', Description: 'A high performance web server and a reverse proxy server', MainPID: '911', ActiveState: 'active', SubState: 'running', ExecMainStartTimestamp: 'Mon 2026-11-02 08:00:11 KST' },
          statusLines: [
            '● nginx.service - A high performance web server and a reverse proxy server',
            '     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)',
            '     Active: active (running) since Mon 2026-11-02 08:00:11 KST; 1 week 2 days ago',
            '    Process: 61822 ExecReload=/usr/sbin/nginx -g daemon on; master_process on; -s reload (code=exited, status=0/SUCCESS)',
            '   Main PID: 911 (nginx)',
            '      Tasks: 3 (limit: 4585)',
            '     Memory: 10.4M',
            '     CGroup: /system.slice/nginx.service',
            '             ├─911 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"',
            '             └─61823 "nginx: worker process"',
            '',
            'Nov 10 23:12:40 wiki-01 systemd[1]: Reloading A high performance web server and a reverse proxy server...',
            'Nov 10 23:12:40 wiki-01 systemd[1]: Reloaded A high performance web server and a reverse proxy server.',
          ],
        },
      ],
      files: [
        { path: '/home/eunjae/.bashrc', content: EUNJAE_BASHRC, mtime: '2025-06-17T10:40' },
        { path: '/home/eunjae/.profile', content: '# ~/.profile: executed by the command interpreter for login shells.\nif [ -n "$BASH_VERSION" ] && [ -f "$HOME/.bashrc" ]; then\n    . "$HOME/.bashrc"\nfi', mtime: '2023-04-03T09:50' },
        { path: '/home/eunjae/README.txt', content: README, mtime: '2025-06-17T10:35' },
        { path: '/home/eunjae/bin/wiki-log-clean.sh', content: SCRIPT, mode: '755', mtime: '2026-11-10T18:35' },
        { path: '/home/eunjae/bin/wiki-clean.log', content: TEST_LOG, mtime: '2026-11-10T18:36' },
        { path: '/home/eunjae/bin/disk-report.sh', content: DISK_REPORT, mode: '755', mtime: '2024-03-12T10:18' },
        { path: '/home/eunjae/wiki-clean.log', content: homeCleanLog(), mtime: '2026-11-11T09:00' },
        { path: '/home/eunjae/log/cron-env.txt', content: CRON_ENV, mtime: '2024-03-12T10:21' },
        { path: '/home/eunjae/log/disk-report.txt', content: DISK_REPORT_TXT, mtime: '2026-11-09T09:00' },
        { path: '/home/eunjae/.config/wikictl/token', content: '(관리 토큰 — 조사 모드에서는 가려져 있어요)', mode: '600', mtime: '2023-04-03T10:45' },
        { path: '/etc/crontab', content: ETC_CRONTAB, mtime: '2023-04-03T09:50' },
        { path: '/etc/cron.allow', content: 'root\neunjae\nsjkang', mtime: '2023-04-03T10:50' },
        { path: '/etc/cron.d/e2scrub_all', content: '30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all_cron\n10 3 * * * root test -e /run/systemd/system || SERVICE_MODE=1 /sbin/e2scrub_all -A -r', mtime: '2023-04-03T09:50' },
        { path: '/etc/cron.d/.placeholder', content: '# DO NOT EDIT OR REMOVE\n# This file is a simple placeholder to keep dpkg from removing this directory', mtime: '2023-04-03T09:50' },
        { path: '/etc/cron.hourly/.placeholder', content: '# DO NOT EDIT OR REMOVE\n# This file is a simple placeholder to keep dpkg from removing this directory', mtime: '2023-04-03T09:50' },
        { path: '/etc/cron.daily/logrotate', content: '#!/bin/sh\n# skip in favour of systemd timer\nif [ -d /run/systemd/system ]; then\n    exit 0\nfi\n/usr/sbin/logrotate /etc/logrotate.conf', mode: '755', mtime: '2023-04-03T09:50' },
        { path: '/etc/cron.daily/apt-compat', content: '#!/bin/sh\nset -e\n# Systemd systems use a systemd timer unit which is preferable to run.\nif [ -d /run/systemd/system ]; then\n    exit 0\nfi', mode: '755', mtime: '2023-04-03T09:50' },
        { path: '/etc/wiki/wiki.conf', content: '# Nuri Wiki — 2023-04 eunjae\nlisten = 127.0.0.1:8090\ndata_dir = /var/lib/wiki\nsession_dir = /var/lib/wiki/sessions\nlog_file = /var/log/wiki/wiki.log\nlog_level = info\n\n[thumbnail]\nenabled = true\nretry_delay_sec = 0      # 기본값 그대로\n', mtime: '2023-04-03T10:28' },
        { path: '/etc/nginx/sites-available/wiki', content: NGINX_SITE, mtime: '2026-11-10T23:12' },
        { path: '/etc/nginx/sites-enabled/wiki', content: NGINX_SITE, mtime: '2026-11-10T23:12' },
        { path: '/etc/logrotate.d/nginx', content: '/var/log/nginx/*.log {\n\tdaily\n\tmissingok\n\trotate 14\n\tcompress\n\tdelaycompress\n\tnotifempty\n\tcreate 0640 www-data adm\n\tsharedscripts\n\tpostrotate\n\t\tinvoke-rc.d nginx rotate >/dev/null 2>&1\n\tendscript\n}', mtime: '2023-04-03T10:05' },
        { path: '/opt/wiki/bin/wiki-server', content: '', binary: '바이너리 파일입니다 (실행 파일)', mode: '755', mtime: '2026-11-02T07:58' },
        { path: '/opt/wiki/bin/wikictl', content: '', binary: '바이너리 파일입니다 (위키 관리 도구 — log truncate / jobs / stats)', mode: '755', mtime: '2026-11-02T07:58' },
        { path: '/var/log/wiki/wiki.log', content: wikiLog(), size: WIKI_LOG_BYTES, owner: 'wiki', group: 'adm', mode: '640', mtime: '2026-11-11T09:29' },
        { path: '/var/log/nginx/access.log', content: '10.20.5.33 - jhpark [10/Nov/2026:23:14:51 +0900] "GET /wiki/%EA%B2%B0%EC%A0%9C%ED%8C%80-%EC%A3%BC%EA%B0%84%ED%9A%8C%EC%9D%98 HTTP/1.1" 200 7731 "-" "Mozilla/5.0"\n10.20.9.2 - - [11/Nov/2026:09:29:05 +0900] "GET /healthz HTTP/1.1" 200 2 "-" "nuri-monitor/2.1"', size: 9 * MiB, owner: 'www-data', group: 'adm', mode: '640', mtime: '2026-11-11T09:29' },
        { path: '/var/log/nginx/access.log.1', content: '', size: 118 * MiB, binary: '어제까지의 접속 로그 (회전됨)', owner: 'www-data', group: 'adm', mode: '640', mtime: '2026-11-10T00:00' },
        { path: '/var/log/nginx/error.log', content: '', size: 0, owner: 'www-data', group: 'adm', mode: '640', mtime: '2026-11-10T00:00' },
        { path: '/var/log/syslog', content: 'Nov 11 09:10:02 wiki-01 systemd-logind[640]: New session 431 of user eunjae.\nNov 11 09:10:02 wiki-01 systemd[1]: Started Session 431 of User eunjae.', size: 41 * MiB, group: 'adm', mode: '640', mtime: '2026-11-11T09:10' },
        { path: '/var/log/auth.log', content: 'Nov 11 09:10:02 wiki-01 sshd[58402]: Accepted publickey for eunjae from 10.20.5.12 port 50412 ssh2', size: Math.round(1.3 * MiB), group: 'adm', mode: '640', mtime: '2026-11-11T09:10' },
        sized('/var/log/journal/3f9c2e17b84d4a5e/system.journal', 496 * MiB, 'journald 바이너리 파일입니다. journalctl 로 읽으세요.', 'root', '640'),
        sized('/var/log/journal/3f9c2e17b84d4a5e/user-1001.journal', 32 * MiB, 'journald 바이너리 파일입니다. journalctl 로 읽으세요.', 'root', '640'),
        sized('/var/lib/wiki/uploads/2023/objects.pack', Math.round(0.9 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/uploads/2024/objects.pack', Math.round(1.4 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/uploads/2025/objects.pack', Math.round(1.9 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/uploads/2026/objects.pack', Math.round(1.2 * GiB), '위키 첨부파일 묶음 (바이너리)', 'wiki', '640'),
        sized('/var/lib/wiki/search/index.db', 381 * MiB, '검색 색인 (바이너리)', 'wiki', '640'),
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
    // Eunjae's history: the 2025-06 order (Case 0), the 2024-03 cron test, Tuesday, Doyun's homework
    { at: '2023-04-03T10:31:50', emits: [hist('sudo systemctl enable --now wiki')] },
    { at: '2023-04-03T10:45:12', emits: [hist('echo \'export PATH="$PATH:/opt/wiki/bin"   # wikictl (2023-04)\' >> ~/.bashrc')] },
    { at: '2023-04-03T10:45:30', emits: [hist('wikictl stats --short')] },
    { at: '2024-03-12T10:18:40', emits: [hist('crontab -e')] },
    { at: '2024-03-12T10:19:05', emits: [hist('# 월요일 리포트가 cron에서만 "wikictl: command not found". 터미널에선 됨. 왜?')] },
    { at: '2024-03-12T10:20:02', emits: [hist('crontab -e')] },
    { at: '2024-03-12T10:21:30', emits: [hist('cat ~/log/cron-env.txt')] },
    { at: '2024-03-12T10:22:10', emits: [hist('# cron 환경은 이게 전부. PATH가 /usr/bin:/bin 뿐. 내 터미널이랑 다름.')] },
    { at: '2024-03-12T10:24:44', emits: [hist("env -i HOME=/home/eunjae LOGNAME=eunjae PATH=/usr/bin:/bin SHELL=/bin/sh /bin/sh -c 'cd && ~/bin/disk-report.sh'")] },
    { at: '2024-03-12T10:25:01', emits: [hist('# 터미널에서 되는 건 증거가 아님. cron처럼 돌려 봐야 앎 🌱')] },
    { at: '2024-03-12T10:26:15', emits: [hist('crontab -e')] },
    { at: '2025-06-17T10:12:02', emits: [hist('df -h')] },
    { at: '2025-06-17T10:12:30', emits: [hist('# /var 97%. 디스크 먼저. 그다음 누가 쓰는지.')] },
    { at: '2025-06-17T10:13:04', emits: [hist('du -sh /var/log/*')] },
    { at: '2025-06-17T10:31:40', emits: [hist('# 순서: df → du → tail → systemctl status → journalctl. README에도 적어 둠.')] },
    { at: '2026-11-10T09:22:10', emits: [hist('systemctl status wiki')] },
    { at: '2026-11-10T09:22:40', emits: [hist('# 도윤님 연습용으로 그대로 둠. 위 순서대로 보면 돼요 🌱')] },
    // Tuesday 09:30-10:20: Doyun's Case 0 run in the investigation session
    { at: '2026-11-10T09:31:02', emits: [hist('history')] },
    { at: '2026-11-10T09:33:40', emits: [hist('df -h')] },
    { at: '2026-11-10T09:36:12', emits: [hist('du -sh /var/log/*')] },
    { at: '2026-11-10T09:38:55', emits: [hist('tail -n 20 /var/log/wiki/wiki.log')] },
    { at: '2026-11-10T09:41:20', emits: [hist('systemctl status wiki')] },
    { at: '2026-11-10T09:45:03', emits: [hist('journalctl -u wiki')] },
    // Tuesday evening: Doyun's homework, typed in Eunjae's session
    { at: '2026-11-10T18:31:40', emits: [hist('cd ~/bin')] },
    { at: '2026-11-10T18:32:05', emits: [hist('vim wiki-log-clean.sh')] },
    { at: '2026-11-10T18:35:50', emits: [hist('chmod +x wiki-log-clean.sh')] },
    { at: '2026-11-10T18:36:12', emits: [hist('./wiki-log-clean.sh --force >> wiki-clean.log 2>&1')] },
    { at: '2026-11-10T18:36:20', emits: [hist('cat wiki-clean.log')] },
    { at: '2026-11-10T18:36:41', emits: [hist('# 됨!! ✓ (도윤)')] },
    { at: '2026-11-10T18:40:02', emits: [hist('crontab -e')] },
    { at: '2026-11-10T18:41:30', emits: [hist('crontab -l')] },
    { at: '2026-11-10T18:41:52', emits: [hist('# 매시 정각. 은재님 crontab 빌림 🙇 (도윤)')] },
    // Wednesday morning, before the half day off
    { at: '2026-11-11T09:10:40', emits: [hist('df -h')] },
    { at: '2026-11-11T09:11:05', emits: [hist('# 도윤님, 오늘은 제 crontab 이에요. 맨 위 주석 두 줄부터 🌱')] },

    // wiki journal: Case 0's incident, Seojin's Tuesday fix, the nightly requeue
    { at: '2026-11-09T21:14:03', emits: [wiki('WARN thumbnail attach/8812 failed: PDF parse error (xref table broken) — retrying (attempt 1)', 4, 1423)] },
    { at: '2026-11-10T08:47:13', emits: [wiki('CRITICAL cannot write /var/log/wiki/wiki.log: [Errno 28] No space left on device — shutting down', 2, 1423)] },
    { at: '2026-11-10T08:47:41', emits: [sysd('wiki.service', "wiki.service: Failed with result 'exit-code'.", 4), sysd('wiki.service', 'Failed to start Nuri Wiki (사내 위키).', 3)] },
    { at: '2026-11-10T10:38:12', note: 'Seojin marks the job failed; retry_delay_sec stays 0', emits: [j('wiki.service', 'INFO job attach/8812 marked failed (wikictl jobs fail, user sjkang)', { ident: 'wikictl', pid: 52190 })] },
    { at: '2026-11-10T10:40:02', emits: [sysd('wiki.service', 'Started Nuri Wiki (사내 위키).'), wiki('INFO wiki-server 1.4.2 listening on 127.0.0.1:8090')] },
    { at: '2026-11-10T10:40:03', emits: [wiki('INFO jobs: 1 failed job(s) kept (attach/8812); requeue_failed=daily 00:00')] },
    { at: '2026-11-10T18:36:12', emits: [wiki('INFO admin: log truncate requested (keep_tail=50M) — 2.1M, nothing to do')] },
    ...loopEvents(),
    ...cronEvents(),
    // nginx: Jihoon's reload (the red herring)
    { at: '2026-11-10T23:12:40', emits: [sysd('nginx.service', 'Reloading A high performance web server and a reverse proxy server...'), sysd('nginx.service', 'Reloaded A high performance web server and a reverse proxy server.')] },
    { at: '2026-11-11T09:10:02', emits: [j('systemd-logind.service', 'New session 431 of user eunjae.', { ident: 'systemd-logind', pid: 640 })] },

    // messenger
    { at: '2026-11-10T10:38:40', emits: [msg('pc-infra', 'seojin', '위키 복구. 미리보기 작업 8812는 실패 처리했어요.')] },
    { at: '2026-11-10T10:39:05', emits: [msg('pc-infra', 'seojin', '재시도 설정은 변경 요청 내고 목요일에.')] },
    { at: '2026-11-10T10:41:30', emits: [msg('pc-infra', 'seojin', '디스크 80% 알림 걸었어요. wiki-01부터.')] },
    { at: '2026-11-10T18:44:10', emits: [msg('me-dm-seojin', 'doyun', '서진님!! 정리 스크립트 은재님 crontab에 걸었습니다. 매시 정각이요. 터미널에서 테스트 완료했습니다 ✓ (메모했습니다)')] },
    { at: '2026-11-10T18:46:02', emits: [msg('me-dm-seojin', 'seojin', '확인. 내일 아침에 로그 봐요.')] },
    { at: '2026-11-10T23:15:20', emits: [msg('pc-infra', 'jihoon', '위키 첨부 용량 살짝 올렸어요 50MB로 ㅋㅋ 회의록 이제 안 잘림!! 👍')] },
    { at: '2026-11-10T23:15:41', emits: [msg('pc-infra', 'jihoon', '서진님이 OK 해 주셨어요 🙏')] },
    { at: '2026-11-11T07:15:05', emits: [msg('pc-infra', 'bot', '[P3] wiki-01 /var 80% 넘음 (81%) · 07:15')] },
    { at: '2026-11-11T08:52:11', emits: [msg('pc-infra', 'seojin', '확인. 도윤님 스크립트 있는 서버예요.')] },
    { at: '2026-11-11T09:05:30', emits: [msg('pc-infra', 'eunjae', '저 오전 반차예요. 제 PC 세션은 도윤님 쓰라고 열어 둘게요 🌱')] },
    { at: '2026-11-11T09:12:40', emits: [msg('me-dm-seojin', 'doyun', '서진님 제 스크립트 로그(~/bin/wiki-clean.log)에 어제 테스트한 줄밖에 없어요 ㅠㅠ 혹시 cron이 아예 안 돈 걸까요? 확인해보겠습니다!')] },
    { at: '2026-11-11T09:14:02', emits: [msg('me-dm-seojin', 'seojin', '추측 말고 기록. 은재 선배 PC로 봐요.')] },
  ],

  generators: [],

  // ------------------------------------------------------------------ messenger, mail, notes
  channels: [
    { id: 'pc-infra', account: 'pc', kind: 'channel', title: '#인프라' },
    { id: 'me-dm-seojin', account: 'me', kind: 'dm', title: '강서진', with: 'seojin' },
    { id: 'me-dm-jihoon', account: 'me', kind: 'dm', title: '박지훈', with: 'jihoon' },
  ],

  mails: [
    {
      id: 'brief', account: 'me', folder: 'inbox', from: 'seojin', to: '한도윤', at: '2026-11-11T09:28',
      subject: '[연습 2] wiki-01 /var 92% — 도윤님 스크립트',
      body: '도윤님.\n\n- 07:15 /var 80% 알림. 지금 92%.\n- wiki.log가 자정부터 다시 늘고 있어요.\n- 도윤님 정리 스크립트는 매시 정각이라고 했죠. 왜 안 지웠는지.\n\n원인, 경위. 12:00까지. 고치는 건 같이 해요.\n은재 선배 PC 세션 열어 뒀어요. 선배는 오전 반차.\n\n강서진',
    },
    {
      id: 'eunjae-cron', account: 'me', folder: 'inbox', from: 'eunjae', to: '한도윤', at: '2026-11-10T18:20',
      subject: 'RE: 정리 스크립트 cron 어디에 걸까요?',
      body: '도윤님,\n제 crontab 써도 돼요. 도윤님 계정은 아직 wiki-01 cron 권한이 없어서요(/etc/cron.allow).\n\n하나만요. 맨 위 주석 두 줄은 꼭 읽고 걸어요.\n터미널에서 되는 거랑 cron에서 되는 건… 음, 그건 직접 보면 더 잘 기억나요 :)\n\n남은재 🌱',
    },
    {
      id: 'closing', account: 'me', folder: 'inbox', from: 'seojin', to: '한도윤', cc: '남은재', at: '2026-11-11T12:01', later: true,
      subject: 'RE: [연습 2] wiki-01 /var 92% — 도윤님 스크립트',
      body: '봤어요.\n- 원인: cron의 PATH. wikictl을 못 찾았어요. 맞아요.\n- 경위: 00:00 실패 작업 자동 재큐. 몰랐어요. 문서에 없어서.\n\nwikictl은 절대 경로로 고쳤어요. crontab 맨 위에 PATH= 줄도.\n출력은 /home/eunjae/log/ 로. 실패하면 #인프라에 한 줄 오게.\nretry_delay_sec 60. 실패 작업 자동 재큐는 껐어요.\nlogrotate 규칙은 오늘 오후에.\n\n터미널에서 된 건 증거가 아니에요. 은재 선배 말.\n\n강서진',
    },
    {
      id: 'wiki-failed', account: 'pc', folder: 'inbox', from: 'wikibot', to: '인프라팀', at: '2026-11-10T10:38',
      subject: '[위키] 실패한 작업 1건 (attach/8812)',
      body: '작업 attach/8812 (주간회의_1109.pdf 미리보기) 가 실패로 표시되었습니다.\n\n- 표시한 사람: 강서진\n- 실패한 작업은 매일 00:00 에 자동으로 다시 시도됩니다. (설정: [jobs] requeue_failed, 기본값 daily 00:00)\n- 다시 시도하지 않으려면: wikictl jobs drop attach/8812\n\n이 메일은 위키 알림 설정에 따라 발송됩니다.',
    },
    {
      id: 'hr', account: 'pc', folder: 'inbox', from: 'hr', to: '남은재', at: '2026-11-02T10:00',
      subject: '[인사] 퇴사 일정 안내 (11/13)',
      body: '남은재님,\n퇴사일(11/13 금) 일정을 안내드립니다.\n\n- 인수인계 회의: 11/10(화) 09:30–10:30, 11/12(목) 14:00\n- 장비 반납: 11/13 17:00\n- 계정 회수: 11/16(월) 보안팀 일정에 따라\n\n인사팀',
    },
  ],

  notes: [
    {
      id: 'today', title: '11/11 (수) 내 스크립트 (!!)',
      lines: ['서진님: 왜 안 지웠는지만. 12시까지.', '어제 테스트: ./wiki-log-clean.sh --force → 됨 ✓', '내 로그(~/bin/wiki-clean.log)에 밤 기록 없음 → cron 안 돈 듯 (?)', '1. 돌았나  2. 어디에 썼나  3. 왜'],
      highlight: 2, reveal: '→ 돌았음. 매시간. 로그는 홈(~)에. cron ≠ 내 터미널.',
    },
    { id: 'calc', title: '11/10 (화) 숙제 계산', lines: ['11G / 11.5시간 ≈ 1G/시간', '→ 매시간 정리하면 500M 넘자마자 잡힘 (?)', 'cron: 분 시 일 월 요일', '0 * * * * = 매시 정각 ✓', '0 9 * * 1 = 월요일 09:00 (은재님 리포트)'] },
    { id: 'tue', title: '11/10 (화) 위키 502 — 연습!!', lines: ['원인: /var 100%, wiki.log 11G', 'df → du → tail → systemctl status → journalctl ✓', '서진님: 임시 정리 스크립트 = 내 숙제. 오늘 밤 cron으로.'] },
  ],

  stickies: [{ text: '도윤님 —\n맨 위 주석 두 줄 🌱', x: 74, y: 70, color: '#C9E4B4' }],

  desktop: {
    icons: [
      { app: 'terminal' },
      { app: 'messenger' },
      { app: 'mail' },
      { app: 'notes' },
      { app: 'board' },
      { app: 'dashboard', after: 'ran' },
      { app: 'report', after: 'pins' },
    ],
  },

  notifications: [
    { id: 'n-alert', at: '2026-11-11T07:15', app: '메신저', title: '알림봇 · #인프라', text: '[P3] wiki-01 /var 80% 넘음 (81%)' },
    { id: 'n-failed', at: '2026-11-10T10:38', app: '메일', title: '위키 알림', text: '[위키] 실패한 작업 1건 (attach/8812)' },
  ],

  terminalTabs: [
    {
      label: 'wiki-01', host: W, cwd: '/home/eunjae',
      scrollback: [
        'Nuri wiki-01 (Ubuntu 22.04 LTS) — 사내 위키',
        '조사 모드 (읽기 전용) — 명령 목록: help',
        'eunjae@wiki-01:~$ # 도윤님, 오늘은 제 crontab 이에요. 맨 위 주석 두 줄부터 🌱',
      ],
    },
  ],

  dashboard: [
    '사내 위키 — /var 사용량 (화 11/10 10:40 ~ 수 11/11 09:30, 어제 추가된 패널)',
    '',
    '/var Use% (%)',
    '100 ┤',
    ' 90 ┤                                                   ▄▆█',
    ' 80 ┤╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌▄▆████ 알림 기준 80%',
    ' 60 ┤                                    ▂▄▆█████████████',
    ' 40 ┤▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▄▆█████████████████',
    '  0 ┼──────────────────────────────────────────────────────',
    '    10:40   (위키 복구)          00:00            07:15  09:30',
    '',
    '위키 응답: 정상 (p50 118ms)   위키 로그 쓰기: 약 1G/시간 (00:00부터)',
  ],

  // ------------------------------------------------------------------ clues (no yellow lines from here on: grep yourself)
  clues: [
    { id: 'c1_crontab', label: 'crontab -l: "0 * * * * ~/bin/wiki-log-clean.sh >> wiki-clean.log 2>&1" (도윤의 줄)', slot: 'cause', key: true, match: [{ output: '^0 \\* \\* \\* \\* ~/bin/wiki-log-clean\\.sh >> wiki-clean\\.log 2>&1$', host: W }] },
    { id: 'c1_notfound', label: '~/wiki-clean.log (홈): "line 15: wikictl: command not found" — 그래도 "정리 끝 ✓"', slot: 'cause', key: true, match: [{ output: 'wiki-log-clean\\.sh: line 15: wikictl: command not found', host: W }] },
    {
      id: 'c1_where', label: '내 터미널의 PATH에는 /opt/wiki/bin (wikictl 이 있는 곳)', slot: 'cause', key: true,
      match: [{ output: '^/opt/wiki/bin/wikictl$', host: W }, { output: '^wikictl is /opt/wiki/bin/wikictl$', host: W }, { output: '^(PATH=)?/usr/local/sbin:.*:/opt/wiki/bin$', host: W }],
    },
    {
      id: 'c1_cronpath', label: 'cron 이 주는 PATH 는 /usr/bin:/bin 뿐 (~/log/cron-env.txt, env -i 시험)', slot: 'cause', key: true,
      match: [{ output: '^PATH=/usr/bin:/bin$', host: W }, { output: '^\\s*env -i\\b.*PATH=/usr/bin:/bin.*\\b(which|type) wikictl', host: W }],
    },
    { id: 'c1_comment', label: '은재 crontab 주석: "cron은 로그인 셸이 아니에요. PATH가 /usr/bin:/bin 뿐"', slot: 'cause', trace: true, match: [{ output: '# cron은 로그인 셸이 아니에요', host: W }] },
    { id: 'c1_envtest', label: '은재 history 2024-03: env -i … /bin/sh -c — "터미널에서 되는 건 증거가 아님"', slot: 'cause', trace: true, match: [{ output: '터미널에서 되는 건 증거가 아님', host: W }, { output: '월요일 리포트가 cron에서만', host: W }] },
    { id: 'c1_absolute', label: '은재 disk-report.sh: 전부 절대 경로 (/opt/wiki/bin/wikictl)', slot: 'cause', trace: true, match: [{ output: '^/opt/wiki/bin/wikictl stats --short$', host: W }] },
    { id: 'c1_testlog', label: '~/bin/wiki-clean.log: 화 18:36 터미널 테스트 한 번뿐 (--force)', slot: 'cause', match: [{ output: 'wikictl: /var/log/wiki/wiki\\.log is 2\\.1M', host: W }] },
    { id: 'c1_bashrc', label: '~/.bashrc: export PATH="$PATH:/opt/wiki/bin" — 로그인 셸만 읽는다', slot: 'cause', match: [{ output: '^export PATH="\\$PATH:/opt/wiki/bin"', host: W }] },

    { id: 'c1_cronran', label: 'journalctl -u cron: 19:00부터 매시 정각 (eunjae) CMD — cron 은 돌았다', slot: 'sequence', key: true, match: [{ output: 'CRON\\[\\d+\\]: \\(eunjae\\) CMD \\(~/bin/wiki-log-clean\\.sh', host: W }] },
    { id: 'c1_requeue', label: '수 00:00:05 위키가 실패 작업 attach/8812 를 다시 큐에 — 재시도 폭주 재개', slot: 'sequence', key: true, match: [{ output: 'maintenance: requeued 1 failed job', host: W }] },
    { id: 'c1_df', label: 'df -h: /var 92% (17G / 20G)', slot: 'sequence', key: true, match: [{ output: '^/dev/sdb1\\s+20G\\s+17G\\s+1\\.6G\\s+92%\\s+/var$', host: W }] },
    { id: 'c1_failed', label: '화 10:38 서진이 작업을 "실패"로 표시 — retry_delay_sec = 0 은 그대로', slot: 'sequence', match: [{ output: 'job attach/8812 marked failed', host: W }, { open: 'mail:wiki-failed' }] },
    { id: 'c1_quiet', label: '~/wiki-clean.log: 00:00까지는 "괜찮음" — 할 일이 생긴 01:00부터 실패', slot: 'sequence', match: [{ output: '^2026-11-11 01:00:01 wiki\\.log \\d+M — 정리 시작$', host: W }] },
    { id: 'c1_nginx', label: '화 23:12 지훈의 nginx 변경 (client_max_body_size 50m) — 로그 폭주보다 48분 앞', slot: 'sequence', match: [{ output: '2026-11-10 jhpark: 첨부 50MB', host: W }, { output: 'Nov 10 23:12:40 .*Reload(ing|ed) A high performance', host: W }] },
  ],

  // ------------------------------------------------------------------ report (two slots, five submissions, one bundled reply)
  accusation: {
    maxSubmissions: 5,
    intro: '서진님께 보낼 원인 보고. 두 칸. 제출은 5번까지 — 틀리면 어느 칸인지는 알려 주지 않는다.',
    reply: { from: '강서진', partial: '{total}칸 중 {n}칸이 로그랑 안 맞아요.', bundled: '어딘가 로그랑 안 맞아요. 다시요.', sign: '강서진' },
    slots: [
      {
        id: 'cause',
        title: '원인 (기술)',
        prompt: '도윤의 정리 스크립트는 왜 밤새 아무것도 지우지 못했나?',
        type: 'single',
        options: [
          { id: 'not-run', text: 'cron 이 스크립트를 아예 실행하지 않았다 (crontab 줄이 틀렸거나 cron 이 멈춰 있었다)' },
          { id: 'perm', text: '은재 계정에는 /var/log/wiki/wiki.log 를 줄일 권한이 없어서 Permission denied 로 실패했다' },
          { id: 'cron-path', correct: true, text: 'cron 은 로그인 셸이 아니다. cron 의 PATH(/usr/bin:/bin)에는 wikictl 이 있는 /opt/wiki/bin 이 없어 매번 "command not found" 였다. 내 터미널에서는 ~/.bashrc 가 PATH 를 늘려 줘서 됐다. 출력은 상대 경로라 홈의 wiki-clean.log 로 가서 아무도 못 봤다' },
          { id: 'nginx', blames: 'jihoon', text: '지훈님이 밤에 바꾼 nginx 설정 때문에 스크립트가 위키에 접속하지 못했다' },
          { id: 'noexec', text: '스크립트 파일에 실행 권한(x)이 없어 cron 이 실행하지 못했다' },
        ],
      },
      {
        id: 'sequence',
        title: '경위 (타임라인)',
        prompt: '화요일 오후부터 수요일 09:30 까지, 무슨 순서로 일어났나?',
        type: 'single',
        options: [
          { id: 'nginx-first', blames: 'jihoon', text: '화 23:12 지훈의 nginx 변경 직후부터 위키 로그가 폭주했고, 정리 스크립트는 cron 에서 한 번도 돌지 않았다' },
          { id: 'true', correct: true, text: '화 10:38 깨진 미리보기 작업을 "실패"로 표시 (재시도 간격 0 은 그대로) → 18:41 정리 스크립트를 매시 정각 cron 에 등록, 터미널에서만 시험 → 19:00~00:00 매시간 돌았지만 로그가 작아 할 일이 없었다 → 수 00:00:05 위키가 실패 작업을 자동으로 다시 큐에 넣어 재시도 폭주 재개 → 01:00 부터 매시간 "wikictl: command not found", 그래도 "정리 끝 ✓" → 07:15 /var 80% 알림 → 09:30 92%' },
          { id: 'leftover', text: 'cron 이 스크립트를 실행하지 않아 화요일 장애 때 남은 로그가 그대로 쌓여 있다 (밤사이 새로 쓰인 로그는 없다)' },
          { id: 'crash', text: '01:00 스크립트가 wiki.log 를 지우다 실패하면서 위키가 다시 멈췄고, 그 오류가 로그를 채웠다' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ hints: rung 1 in the machine; rung 2 after 6 min or on request; rung 3 the 💡 panel
  hints: {
    idleMinutes: 6,
    idle: [
      { id: 'idle-1', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c1_cronran'], text: '음. 돌았는지부터요. cron 도 서비스예요. journalctl -u cron.' },
      { id: 'idle-2', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c1_notfound'], text: '돌았으면 출력이 어딘가 있어요. crontab 줄의 >> 뒤. 그 경로는 어디 기준일까요.' },
      {
        id: 'idle-3', from: 'jihoon', channel: 'me-dm-jihoon', unlessClues: ['c1_where', 'c1_cronpath'],
        text: 'ㅋㅋ 도윤님 아직 보는 중?? 그 명령 터미널에선 되잖아요~ 그럼 터미널이랑 cron이 뭐가 다른지… which 같은 거 한번 쳐 봐요!! 🙏',
        askText: '음 ㅋㅋ 그 명령 터미널에선 되잖아요~ 그럼 터미널이랑 cron이 뭐가 다른지… which 같은 거 한번 쳐 봐요!! 🙏',
      },
      { id: 'idle-4', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c1_requeue'], text: '로그가 왜 다시 늘었는지도. journalctl -u wiki --since "2026-11-11 00:00".' },
    ],
    wrong: {
      jihoon: { id: 'wrong-jihoon', from: 'jihoon', channel: 'me-dm-jihoon', text: '헉 제 nginx요?? 😂 그건 업로드 크기만 바꾼 건데… 스크립트가 남긴 출력에 뭐라고 찍혔는지 먼저 봐 주세요 🙏' },
      default: { id: 'wrong-default', from: 'seojin', channel: 'me-dm-seojin', text: '음. 추측 말고 스크립트가 남긴 출력부터요. 어디에 썼는지.' },
    },
    explicit: [
      { slot: 'cause', cost: 5, unlessClues: ['c1_cronran'], text: 'journalctl -u cron 에서 01:00, 02:00 … 에 "(eunjae) CMD (~/bin/wiki-log-clean.sh" 줄이 있는지 보세요. 있으면 cron 은 돌았어요.' },
      { slot: 'cause', cost: 5, unlessClues: ['c1_notfound'], text: 'crontab 줄의 ">> wiki-clean.log" 는 상대 경로예요. cron 은 홈 디렉터리에서 시작해요: ls -l ~, cat ~/wiki-clean.log' },
      { slot: 'cause', cost: 5, unlessClues: ['c1_where', 'c1_cronpath'], text: '내 터미널: which wikictl, echo $PATH. cron: cat ~/log/cron-env.txt (은재님이 2024년에 남긴 cron 의 환경). 둘의 PATH 를 비교해 보세요.' },
      { slot: 'sequence', cost: 5, unlessClues: ['c1_requeue'], text: 'journalctl -u wiki --since "2026-11-11 00:00" — 자정에 무엇이 다시 시작됐나요? 은재님 메일함의 위키 알림 메일도.' },
      { slot: 'sequence', cost: 5, unlessClues: ['c1_df'], text: 'df -h 로 지금 /var 를. 그리고 ~/wiki-clean.log 의 시각과 크기(M)를 시간순으로 읽어 보세요.' },
      { slot: 'sequence', cost: 5, text: '23:12 nginx 변경과 00:00:05 로그 폭주 사이에는 48분이 있어요. 둘을 잇는 로그 줄이 있나요?' },
    ],
    ask: {
      prompts: ['뭐부터 봐요?', '막혔어요'],
      none: { from: 'seojin', channel: 'me-dm-seojin', text: '찾은 것부터 보고서에. 원인, 경위. 그래도 막히면 💡.' },
    },
  },

  // ------------------------------------------------------------------ live scene
  triggers: [
    {
      id: 'jihoon-nginx',
      when: { afterMin: 3 },
      actions: [
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', text: '도윤님 ㅋㅋ 혹시 위키 또 꽉 찬 거 제 탓이에요?? 😂' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 6, text: '어젯밤에 nginx 살짝 바꿨거든요 업로드 50MB로!! 서진님 OK 받긴 했는데 🙏' } },
      ],
    },
    {
      id: 'doyun-ran',
      when: { clue: 'c1_cronran' },
      actions: [
        { message: { channel: 'me-dm-seojin', from: 'doyun', delaySec: 3, text: '서진님!! cron 돌았어요. 어제 19:00부터 매시간이요. 근데 제 로그엔 아무것도 없어요 (?)' } },
        { message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 16, text: '그럼 어디에 썼는지요.' } },
      ],
    },
    {
      id: 'memo-reveal',
      when: { clue: 'c1_notfound' },
      actions: [{ note: 'today' }, { toast: '메모장이 넘어간다 — "내 로그에 밤 기록 없음 → cron 안 돈 듯 (?)"' }],
    },
    {
      id: 'seojin-report',
      when: { allClues: ['c1_where', 'c1_cronpath'] },
      actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 10, text: '그거예요. 같은 명령, 다른 PATH. 보고서 써요.' } }],
    },
  ],

  // ------------------------------------------------------------------ debrief
  debrief: {
    headline: 'cron 은 로그인 셸이 아니다. 내 터미널에서 된 건 증거가 아니다.',
    story: [
      { at: '2024-03', text: '은재의 월요일 디스크 리포트가 cron 에서만 "wikictl: command not found". 은재는 cron 의 환경을 파일로 떠 보고(~/log/cron-env.txt) 스크립트를 전부 절대 경로로 바꾼 뒤, crontab 맨 위에 주석 두 줄을 남겼다.' },
      { at: '화 10:38', text: '서진이 깨진 미리보기 작업 8812 를 "실패"로 표시하고 위키를 살린다. 재시도 간격(retry_delay_sec = 0)은 변경 요청을 내고 목요일에 바꾸기로 했다. 위키는 실패한 작업을 매일 00:00 에 다시 큐에 넣는다 — 기본값이라 설정 파일에는 없었다.' },
      { at: '화 18:36', text: '도윤이 은재 PC 에서 정리 스크립트를 쓰고 터미널에서 --force 로 시험한다. 됐다. 18:41 은재의 crontab 에 "0 * * * *" (매시 정각) 로 건다. 맨 위 주석 두 줄은 읽었지만 무슨 뜻인지 몰랐다.' },
      { at: '화 19:00 – 수 00:00', text: 'cron 은 매시간 스크립트를 실행했다. 로그가 작아서 "괜찮음" 하고 끝났다. 할 일이 없으니 실패할 일도 없었다.' },
      { at: '수 00:00:05', text: '위키가 실패 작업을 다시 큐에 넣는다. 화요일의 재시도 폭주가 그대로 다시 시작돼 wiki.log 가 시간당 약 1G 씩 늘었다.' },
      { at: '수 01:00 – 09:00', text: '매시간 "wikictl: command not found". cron 의 PATH(/usr/bin:/bin)에는 /opt/wiki/bin 이 없다. 스크립트는 그래도 "정리 끝 ✓" 를 찍었고, 출력은 상대 경로라 홈의 ~/wiki-clean.log 로 갔다. 도윤이 본 ~/bin/wiki-clean.log 에는 화요일 테스트 한 줄뿐이었다.' },
      { at: '수 07:15', text: '서진이 어제 걸어 둔 80% 알림이 처음으로 울린다. 원인을 막을 스크립트의 실패는 아무에게도 알려지지 않았다.' },
      { at: '화 23:12', text: '(같은 밤) 지훈이 nginx 업로드 한도를 50MB 로 올렸다. 서진의 승인을 받은 변경이었고, 위키 로그와는 관계가 없었다.' },
    ],
    systemFactors: [
      '실패가 조용했다 — cron 은 종료 코드를 기록하지 않고, 출력은 아무도 안 보는 파일로 갔다(MAILTO 도 메일 서버도 없음).',
      '스크립트가 실패해도 "정리 끝 ✓" 를 찍었다 — 명령의 성공 여부를 확인하지 않았다(set -e 없음).',
      '"내 터미널에서 됐다" 가 확인 절차였다 — cron 과 같은 환경(env -i, PATH=/usr/bin:/bin)으로 시험하지 않았다.',
      '재시도 간격 0 이 그대로였고, 실패 작업을 자정에 다시 넣는 기본값을 아무도 몰랐다 — 같은 장애가 다시 시작될 조건이 남아 있었다.',
      '정리 스크립트는 임시 안전망이었다 — 근본 대책(logrotate 규칙, 재시도 설정)은 "목요일"과 "오늘 오후"로 미뤄져 있었다.',
    ],
    principle: 'cron 은 로그인 셸이 아니다. ~/.bashrc 를 읽지 않고, PATH 는 /usr/bin:/bin, 작업 디렉터리는 홈이다. 명령과 출력은 절대 경로로 쓰고, cron 과 같은 환경으로 시험하고, 실패가 사람에게 닿게 한다.',
    cards: [
      { title: '무엇이 걸려 있나', cmd: 'crontab -l   ·   ls /etc/cron.d   ·   cat /etc/crontab', explain: '분 시 일 월 요일 명령. "0 * * * *" = 매시 정각, "0 9 * * 1" = 월요일 09:00, "15 3 * * 6" = 토요일 03:15. 사용자 crontab 과 시스템 crontab(사용자 이름 칸이 있음)은 따로 있다.' },
      { title: '정말 돌았나', cmd: 'journalctl -u cron --since "2026-11-11 00:00"', explain: '"(사용자) CMD (명령)" 줄이 있으면 cron 은 실행했다. 성공했는지는 여기 없다 — 종료 코드는 기록되지 않는다.' },
      { title: '내 터미널의 명령은 어디서 오나', cmd: 'which wikictl   ·   type wikictl   ·   echo $PATH', explain: 'PATH 의 디렉터리를 앞에서부터 찾는다. ~/.bashrc 가 PATH 를 늘렸다면 그건 로그인 셸에서만 보인다.' },
      { title: 'cron 처럼 시험하기', cmd: "env -i HOME=$HOME LOGNAME=$USER PATH=/usr/bin:/bin SHELL=/bin/sh /bin/sh -c 'cd && ~/bin/스크립트.sh'", explain: '빈 환경에 cron 이 주는 변수만 넣고, 홈에서 /bin/sh 로. 이게 되면 cron 에서도 된다. 은재가 2024년에 친 바로 그 줄.' },
      { title: '절대 경로, 그리고 PATH= 줄', cmd: 'PATH=/usr/local/bin:/usr/bin:/bin:/opt/wiki/bin   (crontab 맨 위)', explain: 'crontab 안에 PATH= 를 쓰면 그 아래 줄에 적용된다. 아니면 스크립트 안에서 /opt/wiki/bin/wikictl 처럼 절대 경로로.' },
      { title: '출력은 절대 경로로, 실패는 사람에게', cmd: '0 * * * * /home/eunjae/bin/x.sh >> /home/eunjae/log/x.log 2>&1 || logger -t x "failed"', explain: '상대 경로는 cron 의 작업 디렉터리(홈) 기준이다. 스크립트 안에는 set -euo pipefail — 실패하면 거기서 멈추고 0 이 아닌 코드로 끝난다. 끝난 뒤 결과(df, 파일 크기)를 확인해서 찍는다.' },
    ],
    closingMail: 'closing',
    doyunLine: '어제 은재님 주석 두 줄을 읽었는데, 그게 제 스크립트 얘기인 줄 몰랐어요. 다음부터는 "터미널에서 됐다" 대신 "cron 처럼 돌려 봤다" 라고 쓰겠습니다. (메모했습니다)',
    cast: [
      { who: 'doyun', text: '자기 스크립트였다. 잘못 쓴 게 아니라, 시험한 곳이 달랐다. 터미널은 친절했고 cron 은 아무것도 말해 주지 않았다.' },
      { who: 'eunjae', text: '오늘도 한마디도 하지 않았다. 2024년에 같은 데서 넘어졌고, 그 기록을 crontab 맨 위 두 줄과 파일 하나로 남겨 두었다.' },
      { who: 'seojin', text: '"재시도 설정은 목요일에." 문서에 없는 기본값이 같은 장애를 다시 불렀다. 고치는 건 같이 했다.' },
      { who: 'jihoon', text: '업로드 한도를 올렸을 뿐이다. 승인도 받았다. 이번에는 정말 아무 관계가 없었다 — 그래도 먼저 "제 탓이에요??" 하고 물었다.' },
    ],
  },

  // ------------------------------------------------------------------ first minutes
  opening: {
    briefing: {
      lockTime: '09:30',
      lockDate: '11월 11일 수요일',
      caller: 'seojin',
      kind: 'voice',
      voiceCue: 'voice.briefing-case1-seojin',
      lines: [
        { text: '도윤님. wiki-01 /var 92%예요.', pauseMs: 1000 },
        { text: '07:15에 80% 알림. 어제 제가 걸어 둔 거.', pauseMs: 1000 },
        { text: '도윤님 정리 스크립트, 매시 정각에 돈다고 했죠. 그런데 안 지웠어요.', pauseMs: 1200 },
        { text: '왜 안 지웠는지. 그것만 찾아요. 고치는 건 같이 해요.', pauseMs: 1000 },
        { text: '은재 선배는 오전 반차예요. 선배 PC 세션 열어 뒀대요.', pauseMs: 1100 },
        { text: '보고서는 12시까지. 할 일은 화면 오른쪽 위에.', pauseMs: 1400 },
      ],
      mail: 'brief',
      mailPreview: '07:15 /var 80% 알림. 지금 92%. 도윤님 정리 스크립트는 매시 정각이라고 했죠.',
    },
    objectives: {
      title: '오늘 할 일 (Case 1)',
      items: [
        { id: 'crontab', text: '내가 건 cron 줄 보기 — crontab', hint: '터미널을 누르고 crontab 으로 목록을. 맨 위 주석 두 줄도요.', any: [{ clue: 'c1_crontab' }], pulse: 'terminal' },
        { id: 'ran', text: '밤에 정말 돌았나 — journalctl', hint: 'cron 도 서비스예요. -u 로 골라 보세요.', any: [{ clue: 'c1_cronran' }] },
        { id: 'output', text: '그 출력은 어디로 갔나 — ls, cat', hint: 'crontab 줄의 >> 뒤를 보세요. cron 은 어느 디렉터리에서 시작할까요?', any: [{ clue: 'c1_notfound' }] },
        { id: 'pins', text: '증거 3개 보드에 올리기 📌', hint: '증거가 되는 줄에 마우스를 올리면 오른쪽에 📌.', any: [{ pins: 3 }] },
      ],
      after: ['다음: 📝 보고서 — 원인, 경위 두 칸 (제출 5번)', '왜 터미널에선 됐을까: which, echo $PATH, ~/log/cron-env.txt', '막히면: crontab 맨 위 주석, history, 💡'],
    },
  },

  // ------------------------------------------------------------------ the shell: Case 0's twelve plus what cron needs
  shell: {
    allow: ['ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'grep', 'df', 'du', 'history', 'systemctl', 'journalctl', 'crontab', 'id', 'echo', 'which', 'type', 'env', 'printenv', 'man', 'help', 'hint', 'clear'],
    refuse: "조사 세션: '{cmd}' 은(는) 오늘 범위 밖이에요 (읽기 전용 조사 세션).\n  쓸 수 있는 명령은 help 로 볼 수 있어요.",
    help: [
      '누리클라우드 조사 모드 셸 — 읽기 전용 세션 (남은재 계정, wiki-01)',
      'Case 1 에서 쓸 수 있는 명령:',
      '  둘러보기    ls [-l] [-a]  cd  pwd',
      '  파일 보기   cat  head  tail  grep [-r]',
      '  디스크      df -h      du -sh <경로>',
      '  기록        history    journalctl -u <서비스> [--since …]',
      '  서비스      systemctl status|show|cat <서비스>',
      '  예약        crontab -l     ls /etc/cron.d    cat /etc/crontab',
      '  나와 환경   id  echo $PATH  env  printenv  which <명령>  type <명령>',
      '  기타        man <명령>  help  hint (💡 힌트 패널)  clear',
      '바꾸는 명령(rm, vim, crontab -e, 스크립트 실행 …)은 조사 모드에서 막혀 있어요.',
      '팁: man cron, man which. ↑/↓ 이전 명령, Tab 자동완성, 줄 옆 📌 로 증거 보드에 핀.',
    ],
  },

  boot: {
    status: '오전 반차 (~14:00) · 11/13 마지막 출근 🌱',
    unlock: '은재님이 열어 둔 세션으로 들어가기',
    note: '조사 세션 — 읽기 전용이라 아무것도 망가지지 않아요.',
  },
};
