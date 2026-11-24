// Case 1 — 「밤에만 실패하는 스크립트」
// Ladder and framing: docs/campaign-ladder.md. Characters and voices: data/infra-mystery-game/characters.md.
// All people, hosts, companies and logs are fictional. Read docs/case-format.md before editing.
//
// Framing: Wednesday 2026-11-11, the day after Case 0, same host (wiki-01). The wiki's TLS
// certificate comes from the company's internal CA and lasts 30 days; `wikictl cert renew` asks for
// a new one once fewer than 48 hours are left. Until this week a cron job on Eunjae's laptop ran it
// every morning over ssh; she turned it off on Monday evening (the laptop goes back on 11/13). Seojin's
// homework for Doyun after Case 0: move the renewal to a server cron. On Tuesday 18:41 Doyun put his
// script in the departed senior's crontab (his own account is not in /etc/cron.allow), every hour on
// the hour, after a --dry-run in his terminal. The certificate on the server ends at 09:00:04 KST on
// Wednesday. Eunjae is on a half day off and speaks only through old records: the two comment lines
// at the top of the crontab, ~/log/cron-env.txt, an `env -i …` test line in the history, and a mail.
//
// One cause: cron is not a login shell. A user crontab runs with PATH=/usr/bin:/bin, SHELL=/bin/sh
// and the home directory as working directory; it reads neither ~/.bashrc nor ~/.profile. The
// script calls `wikictl`, which lives in /opt/wiki/bin; only Eunjae's ~/.bashrc adds that to PATH.
// (Its `openssl` is in /usr/bin, so the hours-left count it prints works under cron.) Under cron the
// call fails with "command not found" every hour, the script still prints "갱신 끝 ✓", and the
// output goes to ~/wiki-cert.log (the redirect is relative, so it is relative to $HOME), not to
// ~/bin/wiki-cert.log, where Doyun looks. Nobody is told. At 09:00:04 the old certificate's notAfter
// passes: browsers and the HTTPS health check reject it, and the alert Seojin set on Tuesday rings.
// Red herring: Jihoon turned off old TLS versions in nginx (ssl_protocols) at 23:12 the same night.

import type { CaseFile, Emit, TimelineEvent } from '../engine/types.ts';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const W = 'wiki-01';
const HOST = 'wiki.nuricloud.example';

/** The certificate on the server: renewed from Eunjae's laptop on 10/12, never since (UTC). */
export const CERT = {
  subject: `CN = ${HOST}`,
  issuer: 'O = Nuri Cloud, CN = Nuri Internal CA R2',
  notBefore: '2026-10-12T00:00:04',
  notAfter: '2026-11-11T00:00:04',
  serial: '4C2F9A01D7E35B6880A1',
  san: [HOST],
  sha1: 'C8:34:38:11:46:E0:14:F7:41:65:32:7C:A3:1C:01:8A:A4:1B:7B:57',
  text: [
    'Certificate:',
    '    Data:',
    '        Version: 3 (0x2)',
    '        Serial Number:',
    '            4c:2f:9a:01:d7:e3:5b:68:80:a1',
    '        Signature Algorithm: ecdsa-with-SHA256',
    '        Issuer: O = Nuri Cloud, CN = Nuri Internal CA R2',
    '        Validity',
    '            Not Before: Oct 12 00:00:04 2026 GMT',
    '            Not After : Nov 11 00:00:04 2026 GMT',
    `        Subject: CN = ${HOST}`,
    '        Subject Public Key Info:',
    '            Public Key Algorithm: id-ecPublicKey',
    '                Public-Key: (256 bit)',
    '                pub:',
    '                    04:ff:f5:e1:cd:76:81:61:9c:c4:fc:ab:b6:63:5e:',
    '                    9b:a5:e6:68:2f:df:d2:08:d2:2f:91:31:40:e5:52:',
    '                    52:bb:0a:b9:44:47:7f:37:c3:2c:2a:e9:e0:01:a8:',
    '                    6b:ca:f1:d2:a2:22:29:da:98:ae:a3:0a:74:48:33:',
    '                    8c:77:e8:25:0a',
    '                ASN1 OID: prime256v1',
    '                NIST CURVE: P-256',
    '        X509v3 extensions:',
    '            X509v3 Basic Constraints: critical',
    '                CA:FALSE',
    '            X509v3 Key Usage: critical',
    '                Digital Signature',
    '            X509v3 Extended Key Usage: ',
    '                TLS Web Server Authentication',
    '            X509v3 Subject Alternative Name: ',
    `                DNS:${HOST}`,
    '            X509v3 Subject Key Identifier: ',
    '                FA:AD:42:EB:DF:24:78:6E:95:B3:12:A4:90:6D:06:C9:6D:8D:A6:A5',
    '            X509v3 Authority Key Identifier: ',
    '                F1:1E:8A:D1:02:3D:AE:84:0D:45:29:F2:E5:0D:04:4D:6B:D6:52:EA',
    '    Signature Algorithm: ecdsa-with-SHA256',
    '    Signature Value:',
    '        30:45:02:20:14:75:56:1e:6d:0d:fe:c6:4b:53:ee:31:87:5d:',
    '        6c:21:36:2a:5b:81:8a:f7:36:b5:c6:05:ef:2a:44:76:a4:95:',
    '        02:21:00:8a:75:c8:b1:c1:0f:0b:15:39:9a:26:aa:24:4a:fd:',
    '        c3:1e:a7:c2:24:ce:b5:62:40:82:42:44:eb:89:dc:21:38',
  ],
};

/** The same certificate as PEM (a real encoding of the fields above, signed by a throwaway key). */
const CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIB5jCCAYygAwIBAgIKTC+aAdfjW2iAoTAKBggqhkjOPQQDAjAzMRMwEQYDVQQK
DApOdXJpIENsb3VkMRwwGgYDVQQDDBNOdXJpIEludGVybmFsIENBIFIyMB4XDTI2
MTAxMjAwMDAwNFoXDTI2MTExMTAwMDAwNFowITEfMB0GA1UEAwwWd2lraS5udXJp
Y2xvdWQuZXhhbXBsZTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABP/14c12gWGc
xPyrtmNem6XmaC/f0gjSL5ExQOVSUrsKuURHfzfDLCrp4AGoa8rx0qIiKdqYrqMK
dEgzjHfoJQqjgZkwgZYwDAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCB4AwEwYD
VR0lBAwwCgYIKwYBBQUHAwEwIQYDVR0RBBowGIIWd2lraS5udXJpY2xvdWQuZXhh
bXBsZTAdBgNVHQ4EFgQU+q1C698keG6VsxKkkG0GyW2NpqUwHwYDVR0jBBgwFoAU
8R6K0QI9roQNRSny5Q0ETWvWUuowCgYIKoZIzj0EAwIDSAAwRQIgFHVWHm0N/sZL
U+4xh11sITYqW4GK9za1xgXvKkR2pJUCIQCKdcixwQ8LFTmaJqokSv3DHqfCJM61
YkCCQkTridwhOA==
-----END CERTIFICATE-----`;

/** Whole hours left on the certificate at a local (KST) time, as the script's bash arithmetic prints it. */
export const hoursLeft = (localIso: string): number => {
  const ms = Date.parse(`${CERT.notAfter}Z`) - (Date.parse(`${localIso}Z`) - 9 * 3600_000);
  return Math.trunc(ms / 1000 / 3600);
};

/** /var/log/wiki/wiki.log since Seojin emptied it on Tuesday 10:40 (Case 0): quiet, then the certificate. */
function wikiLog(): string {
  return [
    '2026-11-10 10:40:02 INFO wiki-server 1.4.2 started (log_file=/var/log/wiki/wiki.log)',
    '2026-11-10 10:40:02 INFO thumbnail worker ready (retry: off)',
    '2026-11-10 10:41:15 INFO GET /wiki/RB-019 200 (sjkang)',
    '2026-11-10 14:22:40 INFO GET /wiki/Home 200 (dyhan)',
    `2026-11-10 18:36:12 INFO cert: renew requested by eunjae (dry run) — nothing written`,
    '2026-11-10 23:14:51 INFO GET /wiki/결제팀-주간회의 200 (jhpark)',
    `2026-11-11 00:00:05 WARN cert: ${HOST} expires in 8h59m59s (notAfter 2026-11-11 00:00:04 UTC) — inside renew window (renew_before=48h); run: wikictl cert renew`,
    '2026-11-11 03:00:05 INFO nightly search index refreshed (1,286 pages)',
    '2026-11-11 08:51:30 INFO GET /wiki/RB-001 200 (sjkang)',
    '2026-11-11 08:58:12 INFO GET /wiki/Home 200 (mroh)',
    `2026-11-11 09:00:04 ERROR cert: ${HOST} certificate expired at 2026-11-11 00:00:04 UTC — TLS clients will reject it; run: wikictl cert renew`,
  ].join('\n');
}

const SCRIPT = `#!/bin/bash
# 위키 인증서 자동 갱신 — 한도윤 (11/10, 서진님 숙제!!)
# 은재님 노트북에서 돌던 걸 서버 cron 으로. 매시 정각.
# 테스트: cd ~/bin && ./wiki-cert-renew.sh --dry-run >> wiki-cert.log  → 잘 됨 ✓

CRT=/etc/wiki/tls/wiki.crt
END=$(openssl x509 -enddate -noout -in "$CRT" | cut -d= -f2)
LEFT_H=$(( ($(date -d "$END" +%s) - $(date +%s)) / 3600 ))

if [ "$LEFT_H" -gt 48 ] && [ "$1" != "--dry-run" ]; then
  echo "$(date '+%F %T') 인증서 \${LEFT_H}h 남음 — 괜찮음"
  exit 0
fi
echo "$(date '+%F %T') 인증서 \${LEFT_H}h 남음 — 갱신 시작"
wikictl cert renew "$@"
echo "$(date '+%F %T') 갱신 끝 ✓"`;

/** 숙련자 모드: one comment line, the window check in bash's [[ ]]; the wikictl call stays on line 15. */
const EXPERT_SCRIPT = `#!/bin/bash
# 위키 인증서 자동 갱신 — 한도윤 (11/10, 서진님 숙제!!)

CRT=/etc/wiki/tls/wiki.crt
RENEW_BEFORE_H=48
END=$(openssl x509 -enddate -noout -in "$CRT" | cut -d= -f2)
LEFT_H=$(( ($(date -d "$END" +%s) - $(date +%s)) / 3600 ))

if [[ "$LEFT_H" -gt "$RENEW_BEFORE_H" && "$1" != "--dry-run" ]]; then
  echo "$(date '+%F %T') 인증서 \${LEFT_H}h 남음 — 괜찮음"
  exit 0
fi

echo "$(date '+%F %T') 인증서 \${LEFT_H}h 남음 — 갱신 시작"
wikictl cert renew "$@"
echo "$(date '+%F %T') 갱신 끝 ✓"`;

const DISK_REPORT = `#!/bin/bash
# 월요일 09:00 디스크 리포트 (은재, 2024-03)
# cron에서 도니까 전부 절대 경로로.
/usr/bin/date '+%F %T'
/usr/bin/df -h /var
/usr/bin/du -sh /var/log/* 2>/dev/null
/opt/wiki/bin/wikictl stats --short`;

const CRONTAB = `# m h dom mon dow  command
# 여기 거는 줄은 명령도 출력도 전부 절대 경로로. (은재, 2024-03)
# 왜냐고요? 그날 떠 둔 ~/log/cron-env.txt 랑 내 터미널을 나란히 보면 알아요 🌱
0 9 * * 1 /home/eunjae/bin/disk-report.sh > /home/eunjae/log/disk-report.txt 2>&1

# 11/10 한도윤 — 위키 인증서 자동 갱신 (매시 정각) 🙇
0 * * * * ~/bin/wiki-cert-renew.sh >> wiki-cert.log 2>&1`;

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

위키 관리 도구: wikictl (/opt/wiki/bin). 로그 자르기, 작업 큐, 통계, 인증서.
인증서: 사내 CA 에서 받는 30일짜리 (/etc/wiki/tls/wiki.crt). 갱신은 wikictl cert renew —
    만료 48시간 전부터 새로 받아요. 지금은 제 노트북 cron 이 매일 아침 ssh 로 돌려요.
    (노트북 반납 전에 서버로 옮길 것. TODO 2026-11)
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
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name wiki.nuricloud.example;

    ssl_certificate     /etc/wiki/tls/wiki.crt;      # wikictl cert renew 가 바꿔 넣고 reload
    ssl_certificate_key /etc/wiki/tls/wiki.key;
    # 2026-11-10 jhpark: 옛 TLS(1.0/1.1) 끔 — 보안 점검 지적 🙏 서진님 OK
    ssl_protocols TLSv1.2 TLSv1.3;
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

// ------------------------------------------------------------------ the ~/wiki-cert.log cron wrote
/** Doyun's cron runs: Tuesday 19:00 … Wednesday 09:00, on the hour. */
const RUNS: [string, number][] = [...[19, 20, 21, 22, 23].map((h) => ['10', h] as [string, number]), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => ['11', h] as [string, number])];
const hh = (h: number) => String(h).padStart(2, '0');

function homeCertLog(): string {
  const out: string[] = [];
  for (const [d, h] of RUNS) {
    const stamp = `2026-11-${d} ${hh(h)}:00:01`;
    out.push(`${stamp} 인증서 ${hoursLeft(`2026-11-${d}T${hh(h)}:00:01`)}h 남음 — 갱신 시작`);
    out.push('/home/eunjae/bin/wiki-cert-renew.sh: line 15: wikictl: command not found');
    out.push(`${stamp} 갱신 끝 ✓`);
  }
  return out.join('\n');
}

const TEST_LOG = [
  '2026-11-10 18:36:12 인증서 14h 남음 — 갱신 시작',
  `wikictl: cert renew (dry run): ${HOST} expires 2026-11-11 00:00:04 UTC (in 14h23m), inside renew window (48h) — would request a new certificate from ca.nuricloud.example; nothing written`,
  '2026-11-10 18:36:13 갱신 끝 ✓',
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
    run(`2026-11-${d}T${hh(h)}:00:01`, 'eunjae', 1001, '~/bin/wiki-cert-renew.sh >> wiki-cert.log 2>&1');
    if (!(d === '11' && h === 9)) run(`2026-11-${d}T${hh(h)}:17:01`, 'root', 0, 'cd / && run-parts --report /etc/cron.hourly');
  }
  run('2026-11-11T03:10:01', 'root', 0, 'test -e /run/systemd/system || SERVICE_MODE=1 /sbin/e2scrub_all -A -r');
  run('2026-11-11T06:25:01', 'root', 0, 'test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )');
  return out;
}

/** The wiki's certificate check: the last renewal (Eunjae's laptop), the nightly check, the expiry. */
function certEvents(): TimelineEvent[] {
  return [
    { at: '2026-10-12T09:00:05', note: 'Eunjae\'s laptop renews over ssh (30-day certificate)', emits: [j('wiki.service', `INFO cert: renewed ${HOST} — notBefore 2026-10-12 00:00:04 UTC, notAfter 2026-11-11 00:00:04 UTC (ca.nuricloud.example, user eunjae)`, { ident: 'wikictl', pid: 40112 })] },
    { at: '2026-10-12T09:00:06', emits: [sysd('nginx.service', 'Reloading A high performance web server and a reverse proxy server...'), sysd('nginx.service', 'Reloaded A high performance web server and a reverse proxy server.')] },
    { at: '2026-11-09T00:00:05', emits: [wiki(`INFO cert: ${HOST} valid until 2026-11-11 00:00:04 UTC (2d 8h59m59s left)`, 6, 1423)] },
    { at: '2026-11-10T00:00:05', note: 'inside the 48h renew window; the laptop job is already off', emits: [wiki(`WARN cert: ${HOST} expires in 1d 8h59m59s (notAfter 2026-11-11 00:00:04 UTC) — inside renew window (renew_before=48h); run: wikictl cert renew`, 4, 1423)] },
    { at: '2026-11-10T18:36:12', emits: [wiki('INFO cert: renew requested by eunjae (dry run) — nothing written')] },
    { at: '2026-11-11T00:00:05', emits: [wiki(`WARN cert: ${HOST} expires in 8h59m59s (notAfter 2026-11-11 00:00:04 UTC) — inside renew window (renew_before=48h); run: wikictl cert renew`, 4)] },
    { at: '2026-11-11T03:00:05', emits: [wiki('INFO nightly search index refreshed (1,286 pages)')] },
    { at: '2026-11-11T09:00:04', note: 'notAfter passes', emits: [wiki(`ERROR cert: ${HOST} certificate expired at 2026-11-11 00:00:04 UTC — TLS clients will reject it; run: wikictl cert renew`, 3)] },
  ];
}

const MOVED = '<html>\n<head><title>301 Moved Permanently</title></head>\n<body>\n<center><h1>301 Moved Permanently</h1></center>\n<hr><center>nginx/1.18.0 (Ubuntu)</center>\n</body>\n</html>';

const sized = (path: string, size: number, binary: string, owner = 'root', mode = '644') => ({ path, content: '', size, binary, owner, mode });

export const caseOneCron: CaseFile = {
  id: 'case1-cron-env',
  title: '밤에만 실패하는 스크립트',
  subtitle: '수요일 09:00, 위키 인증서 만료 알림. 어젯밤 매시간 돌았어야 할 갱신 스크립트는 — 내 거다.',
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
        '/dev/sdb1        20G  8.2G   11G  43% /var',
        'tmpfs           392M  4.0K  392M   1% /run/user/1001',
      ],
      crontabs: { eunjae: CRONTAB },
      // the server presents the file on disk; curl from this host trusts the internal CA
      tls: { [HOST]: { ip: '10.20.3.21', cert: CERT, body: 'ok' } },
      certs: { '/etc/wiki/tls/wiki.crt': CERT },
      http: { 'localhost:8090/healthz': 'ok', '127.0.0.1:8090/healthz': 'ok', [HOST]: MOVED, [`${HOST}/`]: MOVED, [`${HOST}/healthz`]: MOVED },
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
            '        CPU: 4min 12.380s',
            '     CGroup: /system.slice/wiki.service',
            '             └─52210 /opt/wiki/bin/wiki-server --config /etc/wiki/wiki.conf',
            '',
            `Nov 11 00:00:05 wiki-01 wiki-server[52210]: WARN cert: ${HOST} expires in 8h59m59s (notAfter 2026-11-11 00:00:04 UTC) — inside renew window (renew_before=48h); run: wikictl cert renew`,
            'Nov 11 03:00:05 wiki-01 wiki-server[52210]: INFO nightly search index refreshed (1,286 pages)',
            `Nov 11 09:00:04 wiki-01 wiki-server[52210]: ERROR cert: ${HOST} certificate expired at 2026-11-11 00:00:04 UTC — TLS clients will reject it; run: wikictl cert renew`,
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
            'Nov 11 09:00:01 wiki-01 CRON[58431]: (eunjae) CMD (~/bin/wiki-cert-renew.sh >> wiki-cert.log 2>&1)',
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
        { path: '/home/eunjae/bin/wiki-cert-renew.sh', content: SCRIPT, mode: '755', mtime: '2026-11-10T18:35' },
        { path: '/home/eunjae/bin/wiki-cert.log', content: TEST_LOG, mtime: '2026-11-10T18:36' },
        { path: '/home/eunjae/bin/disk-report.sh', content: DISK_REPORT, mode: '755', mtime: '2024-03-12T10:18' },
        { path: '/home/eunjae/wiki-cert.log', content: homeCertLog(), mtime: '2026-11-11T09:00' },
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
        { path: '/etc/wiki/wiki.conf', content: '# Nuri Wiki — 2023-04 eunjae\nlisten = 127.0.0.1:8090\ndata_dir = /var/lib/wiki\nsession_dir = /var/lib/wiki/sessions\nlog_file = /var/log/wiki/wiki.log\nlog_level = info\n\n[thumbnail]\nenabled = true\nretry = off              # 11/10 sjkang\n\n[tls]\ncert = /etc/wiki/tls/wiki.crt\nkey = /etc/wiki/tls/wiki.key\nca = https://ca.nuricloud.example/acme/directory\n# renew_before = 48h     (기본값)\n', mtime: '2026-11-10T10:37' },
        { path: '/etc/wiki/tls/wiki.crt', content: CERT_PEM, mtime: '2026-10-12T09:00' },
        { path: '/etc/wiki/tls/wiki.key', content: '', binary: '개인 키 (root 만 읽을 수 있어요)', mode: '600', mtime: '2026-10-12T09:00' },
        { path: '/etc/nginx/sites-available/wiki', content: NGINX_SITE, mtime: '2026-11-10T23:12' },
        { path: '/etc/nginx/sites-enabled/wiki', content: NGINX_SITE, mtime: '2026-11-10T23:12' },
        { path: '/etc/logrotate.d/nginx', content: '/var/log/nginx/*.log {\n\tdaily\n\tmissingok\n\trotate 14\n\tcompress\n\tdelaycompress\n\tnotifempty\n\tcreate 0640 www-data adm\n\tsharedscripts\n\tpostrotate\n\t\tinvoke-rc.d nginx rotate >/dev/null 2>&1\n\tendscript\n}', mtime: '2023-04-03T10:05' },
        { path: '/opt/wiki/bin/wiki-server', content: '', binary: '바이너리 파일입니다 (실행 파일)', mode: '755', mtime: '2026-11-02T07:58' },
        { path: '/opt/wiki/bin/wikictl', content: '', binary: '바이너리 파일입니다 (위키 관리 도구 — log truncate / jobs / stats / cert renew)', mode: '755', mtime: '2026-11-02T07:58' },
        { path: '/var/log/wiki/wiki.log', content: wikiLog(), size: Math.round(2.4 * MiB), owner: 'wiki', group: 'adm', mode: '640', mtime: '2026-11-11T09:00' },
        // the last request that got through the handshake is at 08:59; after 09:00:04 clients hang up before HTTP
        { path: '/var/log/nginx/access.log', content: '10.20.5.33 - jhpark [10/Nov/2026:23:14:51 +0900] "GET /wiki/%EA%B2%B0%EC%A0%9C%ED%8C%80-%EC%A3%BC%EA%B0%84%ED%9A%8C%EC%9D%98 HTTP/2.0" 200 7731 "-" "Mozilla/5.0"\n10.20.5.41 - mroh [11/Nov/2026:08:58:12 +0900] "GET /wiki/Home HTTP/2.0" 200 9120 "-" "Mozilla/5.0"\n10.20.9.2 - - [11/Nov/2026:08:59:05 +0900] "GET /healthz HTTP/1.1" 200 2 "-" "nuri-monitor/2.1"', size: 9 * MiB, owner: 'www-data', group: 'adm', mode: '640', mtime: '2026-11-11T09:29' },
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
    { at: '2024-03-12T10:22:10', emits: [hist('# cron 환경은 이게 전부. 내 터미널이랑 한 줄씩 비교.')] },
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
    { at: '2026-11-10T18:32:05', emits: [hist('vim wiki-cert-renew.sh')] },
    { at: '2026-11-10T18:35:50', emits: [hist('chmod +x wiki-cert-renew.sh')] },
    { at: '2026-11-10T18:36:12', emits: [hist('./wiki-cert-renew.sh --dry-run >> wiki-cert.log 2>&1')] },
    { at: '2026-11-10T18:36:20', emits: [hist('cat wiki-cert.log')] },
    { at: '2026-11-10T18:36:41', emits: [hist('# 됨!! ✓ 진짜 갱신은 오늘 밤 cron 이 (도윤)')] },
    { at: '2026-11-10T18:40:02', emits: [hist('crontab -e')] },
    { at: '2026-11-10T18:41:30', emits: [hist('crontab -l')] },
    { at: '2026-11-10T18:41:52', emits: [hist('# 매시 정각. 은재님 crontab 빌림 🙇 (도윤)')] },
    // Wednesday morning, before the half day off
    { at: '2026-11-11T09:11:05', emits: [hist('# 망설여지면 맨 위 주석 두 줄부터요, 도윤님. 오늘은 제 crontab 이에요 🌱')] },

    // wiki journal: Case 0's incident and Seojin's Tuesday fix, then the certificate
    { at: '2026-11-09T21:14:03', emits: [wiki('WARN thumbnail attach/8812 failed: PDF parse error (xref table broken) — retrying (attempt 1)', 4, 1423)] },
    { at: '2026-11-10T08:47:13', emits: [wiki('CRITICAL cannot write /var/log/wiki/wiki.log: [Errno 28] No space left on device — shutting down', 2, 1423)] },
    { at: '2026-11-10T08:47:41', emits: [sysd('wiki.service', "wiki.service: Failed with result 'exit-code'.", 4), sysd('wiki.service', 'Failed to start Nuri Wiki (사내 위키).', 3)] },
    { at: '2026-11-10T10:38:12', emits: [j('wiki.service', 'INFO job attach/8812 dropped; thumbnail retry off (wikictl, user sjkang)', { ident: 'wikictl', pid: 52190 })] },
    { at: '2026-11-10T10:40:02', emits: [sysd('wiki.service', 'Started Nuri Wiki (사내 위키).'), wiki('INFO wiki-server 1.4.2 listening on 127.0.0.1:8090')] },
    ...certEvents(),
    ...cronEvents(),
    // nginx: Jihoon's reload (the red herring)
    { at: '2026-11-10T23:12:40', emits: [sysd('nginx.service', 'Reloading A high performance web server and a reverse proxy server...'), sysd('nginx.service', 'Reloaded A high performance web server and a reverse proxy server.')] },
    { at: '2026-11-11T09:10:02', emits: [j('systemd-logind.service', 'New session 431 of user eunjae.', { ident: 'systemd-logind', pid: 640 })] },

    // messenger
    { at: '2026-11-10T10:38:40', emits: [msg('pc-infra', 'seojin', '위키 복구. 재시도 끄고 로그 비웠어요.')] },
    { at: '2026-11-10T10:41:30', emits: [msg('pc-infra', 'seojin', '위키 https 헬스체크에 알림 걸었어요. 접속이 깨지면 바로 와요.')] },
    { at: '2026-11-10T18:44:10', emits: [msg('me-dm-seojin', 'doyun', '서진님!! 인증서 갱신 스크립트 은재님 crontab에 걸었습니다. 매시 정각이요. 터미널에서 테스트 완료했습니다 ✓ (메모했습니다)')] },
    { at: '2026-11-10T18:46:02', emits: [msg('me-dm-seojin', 'seojin', '확인. 내일 아침에 로그 봐요.')] },
    { at: '2026-11-10T23:15:20', emits: [msg('pc-infra', 'jihoon', '위키 nginx 옛 TLS(1.0/1.1) 껐어요 ㅋㅋ 보안 점검 지적 사항 끝!! 👍')] },
    { at: '2026-11-10T23:15:41', emits: [msg('pc-infra', 'jihoon', '서진님이 OK 해 주셨어요 🙏')] },
    { at: '2026-11-11T09:00:35', emits: [msg('pc-infra', 'bot', `[P2] ${HOST} https 헬스체크 실패 — SSL certificate problem: certificate has expired · 09:00`)] },
    { at: '2026-11-11T09:02:11', emits: [msg('pc-infra', 'seojin', '확인. 도윤님 갱신 스크립트 있는 서버예요.')] },
    { at: '2026-11-11T09:05:30', emits: [msg('pc-infra', 'eunjae', '저 오전 반차예요. 제 PC 세션은 도윤님 쓰라고 열어 둘게요 🌱')] },
    { at: '2026-11-11T09:12:40', emits: [msg('me-dm-seojin', 'doyun', '서진님 제 스크립트 로그(~/bin/wiki-cert.log)에 어제 테스트한 줄밖에 없어요 ㅠㅠ 혹시 cron이 아예 안 돈 걸까요? 확인해보겠습니다!')] },
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
      subject: '[연습 2] 위키 인증서 만료 — 도윤님 갱신 스크립트',
      body: '도윤님.\n\n- 09:00 위키 인증서 만료. https 헬스체크 알림.\n- 브라우저에서 위키가 "연결이 비공개로 설정되어 있지 않습니다".\n- 도윤님 갱신 스크립트는 매시 정각이라고 했죠. 왜 갱신 안 됐는지.\n\n원인, 경위. 12:00까지. 고치는 건 같이 해요.\n은재 선배 PC 세션 열어 뒀어요. 선배는 오전 반차.\n\n강서진',
    },
    {
      id: 'eunjae-cron', account: 'me', folder: 'inbox', from: 'eunjae', to: '한도윤', at: '2026-11-10T18:20',
      subject: 'RE: 인증서 갱신 cron 어디에 걸까요?',
      body: '도윤님,\n제 crontab 써도 돼요. 도윤님 계정은 아직 wiki-01 cron 권한이 없어서요(/etc/cron.allow).\n제 노트북 쪽 갱신은 어제 저녁에 껐어요(반납 준비). 지금 인증서가 수요일 아침까지라 오늘 밤부터 돌면 돼요.\n\n하나만요. 맨 위 주석 두 줄은 꼭 읽고 걸어요.\n터미널에서 되는 거랑 cron에서 되는 건… 음, 그건 직접 보면 더 잘 기억나요 :)\n\n남은재 🌱',
    },
    {
      id: 'closing', account: 'me', folder: 'inbox', from: 'seojin', to: '한도윤', cc: '남은재', at: '2026-11-11T12:01', later: true,
      subject: 'RE: [연습 2] 위키 인증서 만료 — 도윤님 갱신 스크립트',
      body: '봤어요.\n- 원인: cron의 PATH. wikictl을 못 찾았어요. 맞아요.\n- 경위: 어제 19:00부터 매시간 실패. 아무도 몰랐고, 09:00에 지난달 인증서가 끝났어요.\n\n인증서는 방금 손으로 갱신했어요. 위키 정상.\nwikictl은 절대 경로로 고쳤어요. crontab 맨 위에 PATH= 줄도.\n출력은 /home/eunjae/log/ 로. 실패하면 #인프라에 한 줄 오게.\n만료 7일 전 알림도 걸었어요. 끝난 뒤에 울리는 알림은 늦어요.\n\n터미널에서 된 건 증거가 아니에요. 은재 선배 말.\n\n강서진',
    },
    {
      id: 'wiki-cert', account: 'pc', folder: 'inbox', from: 'wikibot', to: '인프라팀', at: '2026-11-10T00:00',
      subject: `[위키] 인증서 만료 33시간 전 (${HOST})`,
      body: `인증서 ${HOST} 이(가) 2026-11-11 09:00 (KST) 에 만료됩니다. (남은 시간 1일 8시간)\n\n- 갱신 창: 만료 48시간 전부터 (설정: [tls] renew_before, 기본값 48h)\n- 갱신: wikictl cert renew\n- 마지막 갱신: 2026-10-12 09:00 (eunjae)\n\n이 메일은 위키 알림 설정에 따라 발송됩니다.`,
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
      lines: ['서진님: 왜 갱신 안 됐는지만. 12시까지.', '어제 테스트: ./wiki-cert-renew.sh --dry-run → 됨 ✓', '내 로그(~/bin/wiki-cert.log)에 밤 기록 없음 → cron 안 돈 듯 (?)', '1. 돌았나  2. 어디에 썼나  3. 왜'],
      highlight: 2, reveal: '→ 돌았음. 매시간. 로그는 홈(~)에. 근데 터미널에선 왜 됐지? (?)',
    },
    { id: 'calc', title: '11/10 (화) 숙제 메모', lines: ['인증서: 사내 CA, 30일짜리', '지금 인증서 끝: 수요일 아침 (은재님)', '→ 오늘 밤부터 매시간 돌리면 여유 있음 (?)', 'cron: 분 시 일 월 요일', '0 * * * * = 매시 정각 ✓', '0 9 * * 1 = 월요일 09:00 (은재님 리포트)'] },
    { id: 'tue', title: '11/10 (화) 위키 502 — 연습!!', lines: ['원인: /var 100%, wiki.log 11G', 'df → du → tail → systemctl status → journalctl ✓', '서진님 숙제: 위키 인증서 자동 갱신을 서버 cron 으로. 은재님 노트북에서 돌던 거. 오늘 밤.'] },
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
    { id: 'n-alert', at: '2026-11-11T09:00', app: '메신저', title: '알림봇 · #인프라', text: `[P2] ${HOST} https 헬스체크 실패 (certificate has expired)` },
    { id: 'n-cert', at: '2026-11-10T00:00', app: '메일', title: '위키 알림', text: `[위키] 인증서 만료 33시간 전 (${HOST})` },
  ],

  terminalTabs: [
    {
      label: 'wiki-01', host: W, cwd: '/home/eunjae',
      scrollback: [
        'Nuri wiki-01 (Ubuntu 22.04 LTS) — 사내 위키',
        '조사 모드 (읽기 전용) — 명령 목록: help',
        'eunjae@wiki-01:~$ # 망설여지면 맨 위 주석 두 줄부터요, 도윤님. 오늘은 제 crontab 이에요 🌱',
      ],
    },
  ],

  dashboard: [
    '사내 위키 — https 상태 (화 11/10 10:40 ~ 수 11/11 09:30, 어제 추가된 패널)',
    '',
    'TLS 핸드셰이크 실패 (분당)',
    ' 40 ┤                                                     ▆█',
    ' 20 ┤                                                     ██',
    '  5 ┤╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌██ 알림 기준 5/분',
    '  0 ┼▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██',
    '    10:40              23:12                   09:00 09:30',
    '',
    '인증서 남은 시간: 0h (만료됨)   위키 앱 응답(내부 http): 정상 (p50 118ms)',
  ],

  // the same snapshot as structured panels (dashboard app; the player's pins become annotations)
  panels: {
    title: '사내 위키 · https',
    from: '2026-11-10T10:40',
    to: '2026-11-11T09:30',
    stepMin: 10,
    live: true,
    marks: ['2026-11-10T23:12', '2026-11-11T09:00'],
    stats: [
      { title: '인증서 남은 시간', value: '만료됨', state: 'crit', note: '모니터가 https 로 받은 인증서' },
      { title: 'TLS 핸드셰이크 실패', value: '분당 약 40', state: 'crit', note: '09:00부터' },
      { title: '위키 앱 (내부 http)', value: '정상', state: 'ok', note: 'p50 118ms' },
      { title: '갱신 스크립트 결과', value: null, note: '수집하지 않습니다 (cron 은 종료 코드를 남기지 않아요)' },
    ],
    timeseries: [
      {
        id: 'tlsfail', title: 'TLS 핸드셰이크 실패 (분당)', unit: '/분', min: 0, max: 60,
        thresholds: [{ value: 5, label: '알림 기준 5/분' }],
        description: '모니터와 사내 브라우저가 wiki.nuricloud.example:443 에 붙다가 TLS 단계에서 끊긴 횟수.',
        series: [{ name: 'TLS 실패', color: 'red', jitter: 0.12, points: [['2026-11-10T10:40', 0], ['2026-11-11T09:00', 41]] }],
      },
      {
        id: 'certleft', title: '인증서 남은 시간 (h)', unit: 'h', min: 0, max: 30, width: 'half',
        description: '모니터가 https 로 받아 본 인증서의 notAfter 까지 남은 시간. 새 인증서(30일)를 받으면 위로 뛴다.',
        series: [{ name: '남은 시간', color: 'yellow', interp: 'linear', points: [['2026-11-10T10:40', 22.3], ['2026-11-11T09:00', 0], ['2026-11-11T09:30', 0]] }],
      },
      {
        id: 'p50', title: '위키 앱 응답 시간 p50 (내부 http)', unit: 'ms', min: 0, max: 200, width: 'half',
        series: [{ name: 'p50', color: 'blue', jitter: 0.08, points: [['2026-11-10T10:40', 118]] }],
      },
    ],
    annotations: [
      { at: '2026-11-10T23:12', label: 'nginx reload', kind: 'deploy' },
      { at: '2026-11-11T09:00', label: 'https 헬스체크 알림', kind: 'alert' },
    ],
  },

  // ------------------------------------------------------------------ clues (no yellow lines from here on: grep yourself)
  clues: [
    { id: 'c1_crontab', label: 'crontab -l: "0 * * * * ~/bin/wiki-cert-renew.sh >> wiki-cert.log 2>&1" (도윤의 줄)', slot: 'cause', key: true, match: [{ output: '^0 \\* \\* \\* \\* ~/bin/wiki-cert-renew\\.sh >> wiki-cert\\.log 2>&1$', host: W }] },
    { id: 'c1_notfound', label: '~/wiki-cert.log (홈): "line 15: wikictl: command not found" — 그래도 "갱신 끝 ✓"', slot: 'cause', key: true, aha: '돌긴 돌았다. 그런데 터미널에선 되던 wikictl 을 못 찾았다.', match: [{ output: 'wiki-cert-renew\\.sh: line 15: wikictl: command not found', host: W }] },
    {
      id: 'c1_where', label: '내 터미널의 PATH에는 /opt/wiki/bin (wikictl 이 있는 곳)', slot: 'cause', key: true,
      match: [{ output: '^/opt/wiki/bin/wikictl$', host: W }, { output: '^wikictl is /opt/wiki/bin/wikictl$', host: W }, { output: '^(PATH=)?/usr/local/sbin:.*:/opt/wiki/bin$', host: W }],
    },
    {
      id: 'c1_cronpath', label: 'cron 이 주는 PATH 는 /usr/bin:/bin 뿐 (~/log/cron-env.txt, env -i 시험)', slot: 'cause', key: true,
      match: [{ output: '^PATH=/usr/bin:/bin$', host: W }, { output: '^\\s*env -i\\b.*PATH=/usr/bin:/bin.*\\b(which|type) wikictl', host: W }],
    },
    { id: 'c1_comment', label: '은재 crontab 주석: "명령도 출력도 전부 절대 경로로" — 왜인지는 ~/log/cron-env.txt', slot: 'cause', trace: true, match: [{ output: '# 여기 거는 줄은 명령도 출력도 전부 절대 경로로', host: W }] },
    { id: 'c1_envtest', label: '은재 history 2024-03: env -i … /bin/sh -c — "터미널에서 되는 건 증거가 아님"', slot: 'cause', trace: true, match: [{ output: '터미널에서 되는 건 증거가 아님', host: W }, { output: '월요일 리포트가 cron에서만', host: W }] },
    { id: 'c1_absolute', label: '은재 disk-report.sh: 전부 절대 경로 (/opt/wiki/bin/wikictl)', slot: 'cause', trace: true, match: [{ output: '^/opt/wiki/bin/wikictl stats --short$', host: W }] },
    { id: 'c1_testlog', label: '~/bin/wiki-cert.log: 화 18:36 터미널 시험 한 번뿐 (--dry-run)', slot: 'cause', match: [{ output: '^wikictl: cert renew \\(dry run\\)', host: W }] },
    { id: 'c1_bashrc', label: '~/.bashrc: export PATH="$PATH:/opt/wiki/bin" — 로그인 셸만 읽는다', slot: 'cause', match: [{ output: '^export PATH="\\$PATH:/opt/wiki/bin"', host: W }] },

    { id: 'c1_cronran', label: 'journalctl -u cron: 19:00부터 매시 정각 (eunjae) CMD — cron 은 돌았다', slot: 'sequence', key: true, match: [{ output: 'CRON\\[\\d+\\]: \\(eunjae\\) CMD \\(~/bin/wiki-cert-renew\\.sh', host: W }] },
    { id: 'c1_expired', label: '수 09:00:04 위키 기록: "certificate expired at 2026-11-11 00:00:04 UTC"', slot: 'sequence', key: true, match: [{ output: `cert: ${HOST.replace(/\./g, '\\.')} certificate expired at`, host: W }] },
    { id: 'c1_enddate', label: 'openssl x509 -enddate: 서버의 인증서 파일 notAfter=Nov 11 00:00:04 2026 GMT (한국 시각 09:00:04)', slot: 'sequence', key: true, match: [{ output: '^notAfter=Nov 11 00:00:04 2026 GMT$', host: W }, { output: '^\\s+Not After : Nov 11 00:00:04 2026 GMT$', host: W }] },
    { id: 'c1_window', label: '화 00:00 위키 알림: 만료 33시간 전, 갱신 창(48h) 안 — 은재 메일함', slot: 'sequence', match: [{ output: 'expires in 1d 8h59m59s .* inside renew window', host: W }, { open: 'mail:wiki-cert' }] },
    { id: 'c1_countdown', label: '~/wiki-cert.log: 매시간 "인증서 Nh 남음" — 19:00 14h … 09:00 0h', slot: 'sequence', match: [{ output: '^2026-11-1[01] \\d\\d:00:01 인증서 \\d+h 남음 — 갱신 시작$', host: W }] },
    { id: 'c1_curl', label: 'curl https://wiki…: 서버가 내보내는 인증서도 만료 ("certificate has expired")', slot: 'sequence', match: [{ output: 'SSL certificate problem: certificate has expired', host: W }, { output: '^\\*  expire date: Nov 11 00:00:04 2026 GMT$', host: W }] },
    { id: 'c1_nginx', label: '화 23:12 지훈의 nginx 변경 (ssl_protocols TLSv1.2 TLSv1.3) — 인증서 오류보다 약 10시간 앞', slot: 'sequence', match: [{ output: '2026-11-10 jhpark: 옛 TLS', host: W }, { output: 'Nov 10 23:12:40 .*Reload(ing|ed) A high performance', host: W }] },
  ],

  // ------------------------------------------------------------------ report (two slots, five submissions, per-field reply)
  accusation: {
    maxSubmissions: 5,
    intro: '서진님께 보낼 원인 보고. 두 칸. 제출은 5번까지 — 틀리면 칸마다 ✓/✗ 와 서진님의 짧은 한마디가 온다.',
    feedback: 'hints',
    reply: { from: '강서진', lines: ['✗ 칸이 로그랑 안 맞아요. 다시요.', '✗ 칸만 다시 봐요.', '아직 ✗ 칸이 있어요. 한 번 더요.'], sign: '강서진' },
    // options are hypotheses of the same length and grain; the pinned evidence decides
    slots: [
      {
        id: 'cause',
        title: '원인 (기술)',
        prompt: '도윤의 갱신 스크립트는 왜 밤새 인증서를 갱신하지 못했나?',
        type: 'single',
        options: [
          { id: 'not-run', text: 'cron 이 그 줄을 한 번도 실행하지 않았다 — 시간 필드가 틀렸거나, cron 서비스가 밤사이 계속 멈춰 있었다' },
          { id: 'perm', text: '스크립트는 매시간 돌았지만 은재 계정에 인증서 파일을 바꿀 권한이 없어서, 매번 권한 오류로 중간에 멈췄다' },
          { id: 'cron-path', correct: true, text: '스크립트는 매시간 돌았지만 cron 의 환경이 내 터미널과 달라, 안에서 부르는 명령을 찾지 못해 매번 실패했다' },
          { id: 'nginx', blames: 'jihoon', needs: ['jihoon-nginx'], text: '어젯밤 지훈님이 바꾼 nginx TLS 설정 때문에 스크립트의 갱신 요청이 TLS 연결에서 막혀서, 갱신이 매번 거절됐다' },
          { id: 'noexec', text: '스크립트 파일에 실행 권한(x)이 빠져 있어서, cron 이 정각마다 시도했지만 실행 자체가 거부됐다' },
        ],
        evidence: [
          { id: 'output', label: '스크립트가 남긴 출력', clues: ['c1_notfound'] },
          { id: 'env', label: '실행 환경 비교 (내 터미널 ↔ 예약 실행)', clues: ['c1_where', 'c1_cronpath', 'c1_bashrc', 'c1_comment', 'c1_envtest', 'c1_absolute', 'c1_testlog'] },
          { id: 'schedule', label: '예약 설정', clues: ['c1_crontab'] },
        ],
      },
      {
        id: 'sequence',
        title: '경위 (타임라인)',
        prompt: '화요일 오후부터 수요일 09:30 까지, 무슨 순서로 일어났나?',
        type: 'single',
        options: [
          { id: 'nginx-first', blames: 'jihoon', needs: ['jihoon-nginx'], text: '밤사이 지훈님의 nginx TLS 설정 변경 직후부터 위키 접속이 깨지기 시작했고, 갱신 스크립트는 그동안 cron 에서 한 번도 돌지 않아 아침 알림까지 갔다' },
          { id: 'true', correct: true, text: '갱신은 저녁부터 매시간 돌았지만 매번 안에서 실패하고도 끝났다고 찍었고, 밤새 새 인증서가 나오지 않아 아침에 지난달 인증서의 기한이 지났다' },
          { id: 'leftover', text: '갱신 스크립트가 밤새 한 번도 돌지 않아, 지난달 노트북에서 받은 인증서가 그대로 있다가 아침에 기한이 지났다 (밤사이 cron 기록은 없다)' },
          { id: 'reload', text: '갱신은 새벽에 한 번 성공해 새 인증서 파일이 생겼지만, nginx 가 그 파일을 다시 읽지 않아 옛 인증서를 계속 내보내다 아침에 기한이 지났다' },
        ],
        evidence: [
          { id: 'runs', label: '실행 기록', clues: ['c1_cronran', 'c1_countdown'] },
          { id: 'wiki', label: '위키 서비스 기록', clues: ['c1_expired', 'c1_window'] },
          { id: 'cert', label: '인증서 상태', clues: ['c1_enddate', 'c1_curl'] },
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
      { id: 'idle-4', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c1_enddate'], text: '인증서가 언제 끝났는지도. openssl 로 날짜요.' },
    ],
    wrong: {
      jihoon: { id: 'wrong-jihoon', from: 'jihoon', channel: 'me-dm-jihoon', text: '헉 제 nginx요?? 😂 그건 TLS 설정만 바꾼 건데… 스크립트가 남긴 출력에 뭐라고 찍혔는지 먼저 봐 주세요 🙏' },
      default: { id: 'wrong-default', from: 'seojin', channel: 'me-dm-seojin', text: '음. 추측 말고 스크립트가 남긴 출력부터요. 어디에 썼는지.' },
    },
    // 💡 정답: the specifics behind the correct option (the options themselves stay hypotheses)
    answers: {
      cause: 'cron 은 로그인 셸이 아니다. cron 의 PATH(/usr/bin:/bin)에는 wikictl 이 있는 /opt/wiki/bin 이 없어 매번 "command not found" 였다. 내 터미널에서는 ~/.bashrc 가 PATH 를 늘려 줘서 됐다. 출력은 상대 경로라 홈의 wiki-cert.log 로 가서 아무도 못 봤다',
      sequence: '월 저녁 은재 노트북의 갱신이 꺼짐 → 화 18:41 갱신 스크립트를 매시 정각 cron 에 등록, 터미널에서 --dry-run 으로만 시험 → 19:00 부터 매시간 cron 이 실행했지만 매번 "wikictl: command not found", 그래도 "갱신 끝 ✓" (남은 시간은 14h … 0h 로 줄기만) → 23:12 지훈의 nginx TLS 변경 (그 뒤로도 헬스체크 정상) → 수 09:00:04 10/12 에 받은 인증서의 notAfter(00:00:04 UTC)가 지남, https 헬스체크 알림',
    },
    explicit: [
      {
        slot: 'cause', cost: 5, unlessClues: ['c1_cronran'],
        text: 'journalctl -u cron 에서 01:00, 02:00 … 에 "(eunjae) CMD (~/bin/wiki-cert-renew.sh" 줄이 있는지 보세요. 있으면 cron 은 돌았어요.',
        compare: '보기 중 "cron 이 한 번도 실행하지 않았다"와 "실행 자체가 거부됐다"는 이 CMD 줄들과 맞나요? 돌았다면 남은 질문은 "돌고 나서 안에서 무엇이 실패했나"예요.',
      },
      {
        slot: 'cause', cost: 5, unlessClues: ['c1_notfound'],
        text: 'crontab 줄의 ">> wiki-cert.log" 는 상대 경로예요. cron 은 홈 디렉터리에서 시작해요: ls -l ~, cat ~/wiki-cert.log → 실패가 찍힌 줄을 📌 (근거: 스크립트가 남긴 출력).',
        compare: '그 줄이 말하는 실패 이유를 보기에 대 보세요: Permission denied 인가요, TLS 오류인가요, 다른 말인가요? 그리고 실패한 줄 바로 다음에 스크립트가 무엇을 찍었나요?',
      },
      {
        slot: 'cause', cost: 5, unlessClues: ['c1_where', 'c1_cronpath'],
        text: '내 터미널: which wikictl, echo $PATH. cron: cat ~/log/cron-env.txt (은재님이 2024년에 떠 둔 cron 의 환경). 둘 중 하나를 📌 (근거: 실행 환경 비교).',
        compare: '두 PATH 를 나란히 놓고, which wikictl 이 알려 준 디렉터리가 양쪽에 다 있는지 보세요. 은재님 disk-report.sh 가 wikictl 을 어떻게 부르는지도요.',
      },
      {
        slot: 'cause', cost: 5, unlessClues: ['c1_crontab'],
        text: 'crontab -l — 도윤님 줄(0 * * * *)과 맨 위 은재님 주석 두 줄을 보고, 도윤님 줄을 📌 (근거: 예약 설정).',
        compare: '도윤님 줄과 은재님 줄(0 9 * * 1)을 나란히: 명령과 >> 출력이 각각 어떻게 적혀 있나요? 시간 필드가 틀렸다면 journalctl -u cron 에 무엇이 남았을까요?',
      },
      {
        slot: 'sequence', cost: 5, unlessClues: ['c1_expired'],
        text: 'journalctl -u wiki --since "2026-11-11 00:00" — 인증서 얘기가 나오는 줄 중 가장 늦은 줄을 📌 (근거: 위키 서비스 기록). 은재님 메일함의 위키 알림 메일도.',
        compare: '위키가 인증서 문제를 말한 시각이 23:12 nginx 변경 직후인가요, 그보다 한참 뒤인가요? 그 사이 위키 기록에 갱신됐다는 줄이 하나라도 있는지 보세요.',
      },
      {
        slot: 'sequence', cost: 5, unlessClues: ['c1_enddate'],
        text: 'openssl x509 -enddate -noout -in /etc/wiki/tls/wiki.crt — 서버에 있는 인증서 파일의 notAfter 줄을 📌 (근거: 인증서 상태). 서버가 지금 내보내는 인증서는 curl -v https://wiki.nuricloud.example 로.',
        compare: 'notAfter 는 GMT 예요. 한국 시각으로 바꿔 대시보드 TLS 그래프가 꺾인 시각과 맞춰 보세요. 새벽에 새 인증서가 파일로 들어왔다면 이 날짜는 어떻게 나와야 할까요?',
      },
      {
        slot: 'sequence', cost: 5, unlessClues: ['c1_cronran', 'c1_countdown'],
        text: 'journalctl -u cron (어제 19:00 부터 매시 정각 CMD 줄)과 cat ~/wiki-cert.log → 하나를 📌 (근거: 실행 기록).',
        compare: '보기 중 "밤새 한 번도 돌지 않았다"는 CMD 줄과 맞나요? 돌았다면 매시간 찍힌 "남은 시간"을 위에서부터 읽어 보세요. 중간에 한 번이라도 갱신됐다면 그다음 숫자는 어땠을까요?',
      },
      { slot: 'sequence', cost: 5, text: '23:12 nginx 변경과 09:00 인증서 오류 사이에는 아홉 시간 넘게 있어요. 그 사이 대시보드의 TLS 실패는 어땠나요?' },
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
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', text: '도윤님 ㅋㅋ 혹시 위키 인증서 오류 제 탓이에요?? 😂' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 6, text: '어젯밤에 nginx 살짝 바꿨거든요 TLS 설정!! 서진님 OK 받긴 했는데 🙏' } },
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
      { at: '10/12', text: '은재의 노트북 cron 이 ssh 로 위키 인증서를 갱신한다. 사내 CA 인증서는 30일짜리 — 새 인증서의 notAfter 는 11/11 00:00:04 UTC, 한국 시각 수요일 09:00:04.' },
      { at: '월 11/09 저녁', text: '은재가 노트북 반납을 앞두고 노트북의 갱신을 끈다. 다음 갱신은 서버로 옮기기로 했다.' },
      { at: '화 00:00', text: '위키가 "만료 33시간 전, 갱신 창 안" 알림 메일을 보낸다. 받는 곳은 은재 PC 의 인프라팀 메일함이었다.' },
      { at: '화 오전', text: '서진이 위키 502(Case 0)를 수습하고 숙제를 낸다: 위키 인증서 자동 갱신을 서버 cron 으로. https 헬스체크 알림도 건다 — 접속이 깨지면 울리는 알림이다.' },
      { at: '화 18:36', text: '도윤이 은재 PC 에서 갱신 스크립트를 쓰고 터미널에서 --dry-run 으로 시험한다. 됐다. 18:41 은재의 crontab 에 "0 * * * *" (매시 정각) 로 건다. 맨 위 주석 두 줄은 읽었지만 무슨 뜻인지 몰랐다.' },
      { at: '화 19:00 – 수 09:00', text: '매시간 "wikictl: command not found". cron 의 PATH(/usr/bin:/bin)에는 /opt/wiki/bin 이 없다. 같은 스크립트의 openssl 은 /usr/bin 에 있어서 남은 시간은 매시간 제대로 찍혔다 — 14h, 13h … 0h. 스크립트는 그래도 "갱신 끝 ✓" 를 찍었고, 출력은 상대 경로라 홈의 ~/wiki-cert.log 로 갔다. 도윤이 본 ~/bin/wiki-cert.log 에는 화요일 시험뿐이었다.' },
      { at: '수 09:00:04', text: '지난달 인증서의 notAfter 가 지난다. 브라우저와 헬스체크가 TLS 핸드셰이크에서 인증서를 거부하고, 서진이 어제 건 알림이 울린다 — 이미 끝난 뒤에.' },
      { at: '화 23:12', text: '(같은 밤) 지훈이 nginx 의 옛 TLS(1.0·1.1)를 껐다. 서진의 승인을 받은 보안 점검 조치였고, 그 뒤로도 헬스체크는 09:00 까지 정상이었다.' },
    ],
    systemFactors: [
      '실패가 조용했다 — cron 은 종료 코드를 기록하지 않고, 출력은 아무도 안 보는 파일로 갔다(MAILTO 도 메일 서버도 없음).',
      '스크립트가 실패해도 "갱신 끝 ✓" 를 찍었다 — 명령의 성공 여부도, 갱신 뒤의 새 만료일도 확인하지 않았다(set -e 없음).',
      '"내 터미널에서 됐다" 가 확인 절차였다 — cron 과 같은 환경(env -i, PATH=/usr/bin:/bin)으로 시험하지 않았다.',
      '알림이 늦었다 — 헬스체크 알림은 인증서가 끝난 뒤에야 울렸고, 위키의 "만료 33시간 전" 메일은 떠나는 사람의 메일함으로 갔다.',
      '갱신을 옮길 여유가 없었다 — 노트북 쪽을 먼저 끄고, 30일짜리 인증서의 마지막 날 밤에 서버 쪽을 처음 돌렸다.',
    ],
    principle: 'cron 은 로그인 셸이 아니다. ~/.bashrc 를 읽지 않고, PATH 는 /usr/bin:/bin, 작업 디렉터리는 홈이다. 명령과 출력은 절대 경로로 쓰고, cron 과 같은 환경으로 시험하고, 실패가 사람에게 닿게 한다.',
    cards: [
      { title: '무엇이 걸려 있나', cmd: 'crontab -l   ·   ls /etc/cron.d   ·   cat /etc/crontab', explain: '분 시 일 월 요일 명령. "0 * * * *" = 매시 정각, "0 9 * * 1" = 월요일 09:00, "15 3 * * 6" = 토요일 03:15. 사용자 crontab 과 시스템 crontab(사용자 이름 칸이 있음)은 따로 있다.' },
      { title: '정말 돌았나', cmd: 'journalctl -u cron --since "2026-11-11 00:00"', explain: '"(사용자) CMD (명령)" 줄이 있으면 cron 은 실행했다. 성공했는지는 여기 없다 — 종료 코드는 기록되지 않는다.' },
      { title: '내 터미널의 명령은 어디서 오나', cmd: 'which wikictl   ·   type wikictl   ·   echo $PATH', explain: 'PATH 의 디렉터리를 앞에서부터 찾는다. ~/.bashrc 가 PATH 를 늘렸다면 그건 로그인 셸에서만 보인다.' },
      { title: 'cron 처럼 시험하기', cmd: "env -i HOME=$HOME LOGNAME=$USER PATH=/usr/bin:/bin SHELL=/bin/sh /bin/sh -c 'cd && ~/bin/스크립트.sh'", explain: '빈 환경에 cron 이 주는 변수만 넣고, 홈에서 /bin/sh 로. 이게 되면 cron 에서도 된다. 은재가 2024년에 친 바로 그 줄.' },
      { title: '인증서는 언제 끝나나', cmd: 'openssl x509 -in /etc/wiki/tls/wiki.crt -noout -dates   ·   curl -v https://wiki.nuricloud.example', explain: 'notAfter 는 GMT(UTC) — 한국 시각은 9시간을 더한다. 파일 속 인증서와 서버가 내보내는 인증서(curl -v 의 expire date)는 다를 수 있다. 갱신 뒤에는 둘 다 다시 본다. -checkend 604800 은 일주일 안에 끝나면 "will expire".' },
      { title: '절대 경로, 그리고 PATH= 줄', cmd: 'PATH=/usr/local/bin:/usr/bin:/bin:/opt/wiki/bin   (crontab 맨 위)', explain: 'crontab 안에 PATH= 를 쓰면 그 아래 줄에 적용된다. 아니면 스크립트 안에서 /opt/wiki/bin/wikictl 처럼 절대 경로로.' },
      { title: '출력은 절대 경로로, 실패는 사람에게', cmd: '0 * * * * /home/eunjae/bin/x.sh >> /home/eunjae/log/x.log 2>&1 || logger -t x "failed"', explain: '상대 경로는 cron 의 작업 디렉터리(홈) 기준이다. 스크립트 안에는 set -euo pipefail — 실패하면 거기서 멈추고 0 이 아닌 코드로 끝난다. 끝난 뒤 결과(새 notAfter)를 확인해서 찍는다.' },
    ],
    closingMail: 'closing',
    doyunLine: '어제 은재님 주석 두 줄을 읽었는데, 그게 제 스크립트 얘기인 줄 몰랐어요. 다음부터는 "터미널에서 됐다" 대신 "cron 처럼 돌려 봤다" 라고 쓰겠습니다. (메모했습니다)',
    cast: [
      { who: 'doyun', text: '자기 스크립트였다. 잘못 쓴 게 아니라, 시험한 곳이 달랐다. 터미널은 친절했고 cron 은 아무것도 말해 주지 않았다.' },
      { who: 'eunjae', text: '오늘도 한마디도 하지 않았다. 2024년에 같은 데서 넘어졌고, 그 기록을 crontab 맨 위 두 줄과 파일 하나로 남겨 두었다.' },
      { who: 'seojin', text: '"알림 걸었어요." 끝난 뒤에 울리는 알림이었다. 만료 7일 전 알림은 오늘 걸었다. 고치는 건 같이 했다.' },
      { who: 'jihoon', text: 'nginx 의 옛 TLS 를 껐을 뿐이다. 승인도 받았다. TLS 를 건드린 다음 날 아침의 인증서 오류 — 이번에는 정말 우연이었다. 그래도 먼저 "제 탓이에요??" 하고 물었다.' },
    ],
  },

  goal: { intro: '서진님께 보낼 원인 보고서를 채우면 사건이 끝나요. 제출은 5번까지 — 틀리면 칸마다 ✓/✗ 로 알려 줘요.' },

  // the tool marks moved to Case 0 (owner feedback 2026-11-20); Case 1 adds no new tool, so only the goal card
  tour: {
    steps: [{ id: 'goal', app: 'goal', title: '🎯 이번 사건에서 밝혀낼 것', text: '최종 목표예요. 보고서 두 칸(원인, 경위)을 채우면 끝. 언제든 여기서 다시 봐요.' }],
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
        { text: '도윤님. 위키 인증서 오류예요.', pauseMs: 1100 },
        { text: '09:00에 만료 알림. 어제 제가 걸어 둔 거.', pauseMs: 1000 },
        { text: '도윤님 갱신 스크립트, 매시 정각에 돈다고 했죠. 그런데 갱신 안 됐어요.', pauseMs: 1200 },
        { text: '왜 안 됐는지. 그것만 찾아요. 고치는 건 같이 해요.', pauseMs: 1000 },
        { text: '은재 선배는 오전 반차예요. 선배 PC 세션 열어 뒀대요.', pauseMs: 1100 },
        { text: '보고서는 12시까지. 할 일은 화면 오른쪽 위에.', pauseMs: 1400 },
      ],
      mail: 'brief',
      mailPreview: '09:00 위키 인증서 만료. https 헬스체크 알림. 도윤님 갱신 스크립트는 매시 정각이라고 했죠.',
    },
    objectives: {
      title: '오늘 할 일 (Case 1)',
      items: [
        { id: 'crontab', text: '내가 건 cron 줄 보기 — crontab', hint: '터미널을 누르고 crontab 으로 목록을. 맨 위 주석 두 줄도요.', any: [{ clue: 'c1_crontab' }], pulse: 'terminal' },
        { id: 'ran', text: '밤에 정말 돌았나 — journalctl', hint: 'cron 도 서비스예요. -u 로 골라 보세요.', any: [{ clue: 'c1_cronran' }] },
        { id: 'output', text: '그 출력은 어디로 갔나 — ls, cat', hint: 'crontab 줄의 >> 뒤를 보세요. cron 은 어느 디렉터리에서 시작할까요?', any: [{ clue: 'c1_notfound' }] },
        { id: 'pins', text: '증거 3개 핀 → 보고서 쓰기 (칸마다 하나 이상) 📌', hint: '증거가 되는 줄에 마우스를 올리면 오른쪽에 📌.', any: [{ pins: 3 }] },
      ],
      after: ['다음: 📝 보고서 — 원인, 경위 두 칸 (제출 5번)', '왜 터미널에선 됐을까: 내 터미널과 cron, 뭐가 다를까', '막히면: crontab 맨 위 주석, history, 💡'],
    },
  },

  // ------------------------------------------------------------------ the shell: Case 0's twelve plus what cron and the certificate need
  shell: {
    allow: ['ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'grep', 'df', 'du', 'history', 'systemctl', 'journalctl', 'crontab', 'id', 'echo', 'which', 'type', 'env', 'printenv', 'date', 'openssl', 'curl', 'man', 'help', 'hint', 'clear'],
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
      '  인증서      openssl x509 -in <파일> -noout -dates     curl -v https://<주소>',
      '  나와 환경   id  date  echo $PATH  env  printenv  which <명령>  type <명령>',
      '  기타        man <명령>  help  hint (💡 힌트 패널)  clear',
      '바꾸는 명령(rm, vim, crontab -e, 스크립트 실행 …)은 조사 모드에서 막혀 있어요.',
      '팁: man cron, man which, man openssl. ↑/↓ 이전 명령, Tab 자동완성, 줄 옆 📌 로 증거 보드에 핀.',
    ],
  },

  boot: {
    status: '오전 반차 (~14:00) · 11/13 마지막 출근 🌱',
    unlock: '은재님이 열어 둔 세션으로 들어가기',
    note: '조사 세션 — 읽기 전용이라 아무것도 망가지지 않아요.',
  },

  // ------------------------------------------------------------------ 숙련자 모드 (docs/campaign-ladder.md §숙련자 모드)
  // Records: Eunjae's 2024-03 cron lesson is gone from the history and the crontab's two comment
  // lines with it; what is left is three `crontab -e` in a row that day and her absolute-path line
  // next to Doyun's relative one. No file names the commands that solve it.
  // Red herring: "cron's /bin/sh chokes on bash syntax". ~/log/cron-env.txt says SHELL=/bin/sh and
  // in this mode the script's window check is written with [[ … ]]. But SHELL only runs the crontab
  // line; the script itself is exec'd by its #!/bin/bash line (`head -1 ~/bin/wiki-cert-renew.sh`),
  // and ~/wiki-cert.log shows it got past that check to line 15 every hour.
  expert: {
    maxSubmissions: 2,
    parMin: 12,
    intro: '서진님께 보낼 원인 보고. 두 칸. 제출은 2번까지 — 틀리면 칸마다 ✓/✗ 만 온다.',
    goalIntro: '서진님께 보낼 원인 보고서를 채우면 사건이 끝나요. 제출은 2번까지 — 틀리면 칸마다 ✓/✗ 만 알려 줘요.',
    after: ['다음: 📝 보고서 — 원인, 경위 두 칸 (제출 2번)', '막히면: crontab, history, 💡 (숙련자 모드: 감점)'],
    stickies: [{ text: '도윤님 —\n제 줄이랑\n비교해 봐요 🌱', x: 74, y: 70, color: '#C9E4B4' }],
    history: [
      {
        host: W,
        user: 'eunjae',
        lines: [
          { at: '2023-04-03T10:31:50', cmd: 'sudo systemctl enable --now wiki' },
          { at: '2023-04-03T10:45:30', cmd: 'wikictl stats --short' },
          { at: '2024-03-12T10:18:40', cmd: 'crontab -e' },
          { at: '2024-03-12T10:20:02', cmd: 'crontab -e' },
          { at: '2024-03-12T10:26:15', cmd: 'crontab -e' },
          { at: '2026-11-10T09:31:02', cmd: 'history' },
          { at: '2026-11-10T09:45:03', cmd: 'journalctl -u wiki' },
          { at: '2026-11-10T18:31:40', cmd: 'cd ~/bin' },
          { at: '2026-11-10T18:36:12', cmd: './wiki-cert-renew.sh --dry-run >> wiki-cert.log 2>&1' },
          { at: '2026-11-10T18:36:41', cmd: '# 됨!! ✓ (도윤)' },
          { at: '2026-11-10T18:40:02', cmd: 'crontab -e' },
          { at: '2026-11-11T09:11:05', cmd: '# 망설여지면 천천히요, 도윤님. 오늘은 제 crontab 이에요 🌱' },
        ],
      },
    ],
    crontabs: [
      {
        host: W,
        user: 'eunjae',
        content: '# m h dom mon dow  command\n0 9 * * 1 /home/eunjae/bin/disk-report.sh > /home/eunjae/log/disk-report.txt 2>&1\n\n# 11/10 한도윤 — 위키 인증서 자동 갱신 (매시 정각) 🙇\n0 * * * * ~/bin/wiki-cert-renew.sh >> wiki-cert.log 2>&1',
      },
    ],
    mails: [
      {
        id: 'eunjae-cron', account: 'me', folder: 'inbox', from: 'eunjae', to: '한도윤', at: '2026-11-10T18:20',
        subject: 'RE: 인증서 갱신 cron 어디에 걸까요?',
        body: '도윤님,\n제 crontab 써도 돼요. 도윤님 계정은 아직 wiki-01 cron 권한이 없어서요(/etc/cron.allow).\n제 노트북 쪽 갱신은 어제 저녁에 껐어요. 지금 인증서가 수요일 아침까지예요.\n\n걸기 전에 제 줄이 왜 그렇게 생겼는지 한 번 보고요 :)\n\n남은재 🌱',
      },
    ],
    terminalTabs: [
      {
        label: 'wiki-01', host: W, cwd: '/home/eunjae',
        scrollback: ['Nuri wiki-01 (Ubuntu 22.04 LTS) — 사내 위키', '조사 모드 (읽기 전용) — 명령 목록: help', 'eunjae@wiki-01:~$ # 망설여지면 천천히요, 도윤님. 오늘은 제 crontab 이에요 🌱'],
      },
    ],
    files: [
      {
        host: W,
        // same script, one comment line, the window check in bash's [[ ]] (line 9); line 15 is still the wikictl call
        file: { path: '/home/eunjae/bin/wiki-cert-renew.sh', content: EXPERT_SCRIPT, mode: '755', mtime: '2026-11-10T18:35' },
      },
      { host: W, file: { path: '/home/eunjae/README.txt', mtime: '2025-06-17T10:35', content: 'wiki-01 — 다음 사람에게 (남은재, 2023-04 / 2025-06 고침)\n\n왜: 사내 위키 서버. 위키가 죽으면 런북도 못 봐요.\n관리 도구: wikictl. 로그 자르기, 작업 큐, 통계, 인증서(사내 CA, 30일).\n조사할 때는 아무것도 지우지 마세요. :)' } },
      { host: W, file: { path: '/home/eunjae/.bashrc', mtime: '2025-06-17T10:40', content: EUNJAE_BASHRC.slice(0, EUNJAE_BASHRC.indexOf('\n\n# 다음 사람')).replace('   # wikictl (2023-04)', '') } },
      { host: W, file: { path: '/home/eunjae/bin/disk-report.sh', mode: '755', mtime: '2024-03-12T10:18', content: DISK_REPORT.replace('# cron에서 도니까 전부 절대 경로로.\n', '') } },
    ],
    clues: [
      { id: 'c1x_shebang', label: '스크립트 첫 줄 #!/bin/bash — 스크립트는 cron 의 /bin/sh 가 아니라 bash 로 돈다', slot: 'cause', match: [{ output: '^#!/bin/bash$', host: W }] },
    ],
    options: [
      { slot: 'cause', at: 3, option: { id: 'sh-syntax', text: '스크립트는 매시간 돌았지만 cron 의 셸(/bin/sh)이 bash 문법을 못 읽어, 매번 첫 조건문에서 멈췄다' } },
    ],
  },
};
