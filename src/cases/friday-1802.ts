// Case 3 (was 1화) — 「금요일 18:02의 작은 변경」. Ladder position: docs/campaign-ladder.md.
// Source of truth: data/infra-mystery-game/characters.md §1 (timeline), §5(i) (traces), §8-2 (E01–E10).
// All people, hosts, companies and logs are fictional. Read docs/case-format.md before editing.
//
// Deviation from characters.md (recorded in the report): the backup cron runs weekly on Saturday
// (`15 3 * * 6`) instead of daily, otherwise Sunday 03:15 would have failed the same way.

import type { CaseFile, TimelineEvent } from '../engine/types.ts';

const ALERT_COUNT = 37;

/** E07: 37 pages to the departed on-call #2, 03:17–05:41. */
function alertEvents(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (let i = 0; i < ALERT_COUNT; i++) {
    const min = 17 + i * 4; // 03:17 .. 05:41
    const h = 3 + Math.floor(min / 60);
    const m = min % 60;
    out.push({
      at: `2026-11-14T0${h}:${String(m).padStart(2, '0')}:05`,
      emits: [{ kind: 'message', id: i === 0 ? 'E07' : `E07-${i + 1}`, channel: 'alerts', from: 'bot', text: `[P1] payment-api 5xx > 20% — 확인 필요 (${i + 1}/${ALERT_COUNT}) · 담당: 온콜 2순위 남은재` }],
    });
  }
  out.push({ at: '2026-11-14T05:44:10', emits: [{ kind: 'message', channel: 'alerts', from: 'bot', text: '[RESOLVED] payment-api 5xx 정상화 (05:40) · 확인한 사람 없음' }] });
  return out;
}

const SHA = {
  timeout: '5b0e9d4c2a7f81e3b6d0f4a9c1e27d58f3a06b12',
  loglevel: '8d41f7a0c3e95b26d1f08e7a4c3b92d65e10f7a3',
  retry: '2c7a9e14f0b3d85c6a1e47f92d0b3c81e5a64f09',
  cachettl: 'e91b4c07d2f85a63c0e1b79d4a26f30c85d1e7b4',
  health: '4f2d8a61c9e03b75d1a8f46e0c92b37d5a1e08c6',
  pool: '9f3c2e17b84d06a5e2c91f7d03b6a48e1c5d2f90',
  revert: '71ad5e93c0f2b84d6e17a05c9f3d2b68e4a01c37',
};

const EUNJAE_BASHRC = `# ~/.bashrc — eunjae
[ -z "$PS1" ] && return
export HISTTIMEFORMAT='%F %T '
export HISTSIZE=100000
export HISTFILESIZE=100000
shopt -s histappend
PS1='\\u@\\h:\\w\\$ '
alias ll='ls -alh'
alias j='journalctl -u'

# 다음 사람: 이 아래는 지워도 돼요
alias 밤='crontab -l; ls /etc/cron.d/'
alias fds='ls /proc/$(pgrep -f payment-api | head -1)/fd | wc -l'
alias 왜='history | grep "  # "'
alias 물주기='echo 🌱'`;

const SJKANG_BASHRC = `# ~/.bashrc — sjkang
[ -z "$PS1" ] && return
# 남은재 선배 설정에서 가져옴 (2020)
export HISTTIMEFORMAT='%F %T '
export HISTSIZE=100000
case "$(hostname)" in pay-*) PS1='\\[\\e[31m\\]\\u@\\h:\\w\\$\\[\\e[0m\\] ';; *) PS1='\\u@\\h:\\w\\$ ';; esac
alias j='journalctl -u'
alias jf='journalctl -fu'
alias fd-count='ls /proc/$(pgrep -f payment-api | head -1)/fd | wc -l'  # 남은재 선배 설정에서 가져옴 (2020)
alias ll='ls -alh'`;

const JHPARK_BASHRC = `# ~/.bashrc — jhpark (팀 dotfiles)
[ -z "$PS1" ] && return
PS1='\\u@\\h:\\w\\$ '
alias shipit='git push origin HEAD && echo 🚀'
alias gm='git merge --no-edit'
alias 괜찮아='git status'
alias 피자='echo "제가 쏩니다 🍕"'`;

const LEDGER_BACKUP = `#!/bin/bash
# 왜: 정산팀 월말 감사용 원장 사본. 임시. 이관되면 삭제. (2022-03)
# 다음 사람에게: 이거 지우기 전에 정산팀 김 과장님께 한 번만 물어보세요. 아마 이제 안 쓸 거예요.
# 참고로… 결제 API 내부 엔드포인트가 원장 세그먼트를 API 프로세스 안에서 한꺼번에 열어요.
set -euo pipefail
OUT=/backup/ledger/$(date +%F)
echo "$(date '+%F %T') start ledger export (since 2022-03-01) -> $OUT"
curl -sf -X POST "http://localhost:8080/internal/ledger/export?since=2022-03-01&out=$OUT" \\
  | while read -r line; do echo "$(date '+%F %T') export: $line"; done
echo "$(date '+%F %T') done (exit $?)"`;

const HANDOVER = `# 인수인계서 v4 — 남은재 (마지막 출근 11/13)

다음 사람에게. 서버별 README.txt 도 같이 보세요.

## 체크리스트 (19/23)
- [x] 결제 API 서버 2대 구성 문서 (pay-api-01, -02)
- [x] 배포 흐름: pay-cfg 저장소 → 매시 5분 pull-config
- [x] bastion 접속 방법
- [x] 리뷰 페이지(review-web) 관리자 계정 이관
- [x] 결제 DB 읽기 전용 계정 정리
- [x] 인증서 갱신 일정 (RB-047 참고)
- [x] 로그 보관 주기
- [x] 장애 연락망 (서진님 1순위)
- [x] 백업 서버 디스크 증설 이력
- [x] 정산팀 연락처
- [x] 모니터링 알림 규칙
- [x] 레거시 cron 정리 (pay-api-02)
- [x] 서버들의_역사.md (못 끝냄. 괜찮음)
- [x] 노트북 반납
- [x] 출입증 반납
- [x] 사내 위키 권한 이관
- [x] 개인 스크립트 목록 (~/bin)
- [x] 공유 드라이브 정리
- [x] 런북에 없는 것들 메모 → 서진님께
- [ ] 결제 서버 개인 crontab 정리 (서진님께 설명)
- [ ] 온콜표에서 내 이름 빼기 (팀장님 요청)
- [ ] 정산팀 원장 백업 이관 확인
- [ ] 화분`;

const SWAP = `b0VIM 9.0\u0000\u0000eunjae\u0000pay-api-01\u0000~eunjae/handover/인수인계서_v4.md
U3210#"! Utp
(저장되지 않은 변경 — 복구할 수 있는 문단)

## 결제 서버 개인 crontab (서진님께)
03:15에 원장 백업이 돌아요. 결제 API 내부 엔드포인트를 불러서
API 프로세스가 파일을 한꺼번에 많이 열어요. 풀이나 워커를 키우면`;

export const caseFriday1802: CaseFile = {
  id: 'friday-1802',
  title: '금요일 18:02의 작은 변경',
  subtitle: '토요일 03:17, 결제 API 5xx 급증. 05:40 자연 복구. 아무도 대응하지 않았다.',
  company: '누리클라우드',
  domain: 'nuricloud.example',
  clock: { start: '2026-11-16T09:00:00', deadline: '2026-11-16T21:00:00', tz: '+09:00' },
  player: 'doyun',
  owner: 'eunjae',

  people: {
    doyun: { name: '한도윤', role: '인프라팀 · 입사 3주차 (나)', initial: '도', color: '#2F3E5C', login: 'dyhan', avatar: 'characters/doyun-avatar.webp', avatarSmall: 'characters/doyun-avatar-64.webp', portrait: 'characters/doyun-full.webp' },
    seojin: { name: '강서진', role: '시니어 SRE · 휴가 중', initial: '서', color: '#3A3D42', login: 'sjkang', avatar: 'characters/seojin-avatar.webp', avatarSmall: 'characters/seojin-avatar-64.webp', portrait: 'characters/seojin-full.webp' },
    jihoon: { name: '박지훈', role: '결제개발팀 리드', initial: '지', color: '#F08A3C', login: 'jhpark', avatar: 'characters/jihun-avatar.webp', avatarSmall: 'characters/jihun-avatar-64.webp', portrait: 'characters/jihun-full.webp' },
    eunjae: { name: '남은재', role: '수석 엔지니어 · 11/13 퇴사', initial: '은', color: '#6B7350', login: 'eunjae', avatar: 'characters/eunjae-avatar.webp', avatarSmall: 'characters/eunjae-avatar-64.webp', portrait: 'characters/eunjae-full.webp' },
    mirae: { name: '오미래', role: 'CTO', initial: '미', color: '#7A4B6B', login: 'mroh' },
    bot: { name: '알림봇', role: '모니터링', initial: '⚠', color: '#9A9A9A' },
    hr: { name: '인사팀', role: '', initial: '인', color: '#8A8580' },
    security: { name: '보안팀', role: '', initial: '보', color: '#5B6770' },
    messenger: { name: '메신저 알림', role: '', initial: '✉', color: '#8A8580' },
    ceo: { name: '대표님', role: '', initial: '대', color: '#8A8580' },
  },

  // ------------------------------------------------------------------ hosts
  hosts: [
    {
      name: 'pay-api-01',
      user: 'eunjae',
      ip: '10.20.1.11',
      motd: ['Welcome to pay-api-01 (결제 API 1호기) — Ubuntu 24.04 LTS', '이 서버에 대해서는 ~/README.txt 를 먼저 보세요. — 은재'],
      uptime: 'up 14 days,  4:48,  2 users,  load average: 0.52, 0.47, 0.44',
      ulimitN: 1024,
      df: [
        'Filesystem      Size  Used Avail Use% Mounted on',
        'tmpfs           794M  1.2M  793M   1% /run',
        '/dev/sda1        98G   39G   55G  42% /',
        '/dev/sdb1       500G  218G  282G  44% /var/lib/ledger',
        'backup:/ledger  2.0T  1.1T  0.9T  55% /backup',
      ],
      ssSummary: ['Total: 2104', 'TCP:   1912 (estab 1890, closed 4, orphaned 0, timewait 3)', '', 'Transport Total     IP        IPv6', 'RAW       0         0         0', 'UDP       4         2         2', 'TCP       1908      1902      6'],
      ssConns: { count: 1890, local: '10.20.1.11', peer: '10.20.2.15:5432', process: 'users:(("payment-api",pid=2817,fd=…))' },
      http: {
        'localhost:8080/metrics': `# HELP process_open_fds Number of open file descriptors.
# TYPE process_open_fds gauge
process_open_fds 1947
# HELP process_max_fds Maximum number of open file descriptors.
# TYPE process_max_fds gauge
process_max_fds 4096
# HELP db_pool_max_connections Configured max connections per worker.
db_pool_max_connections 200
db_pool_workers 4
http_request_duration_seconds{quantile="0.99"} 0.212
http_requests_total{code="2xx"} 91822410
http_requests_total{code="5xx"} 48211`,
        'localhost:8080/healthz': 'ok',
      },
      procs: [
        {
          pid: 2817,
          user: 'payapi',
          cmd: '/opt/payment-api/bin/payment-api --config /etc/payment-api/config.yaml',
          fdCount: 1947,
          limitNofile: 4096,
          fdSample: ['/dev/null', '/dev/null', '/dev/null', '/var/log/payment-api/app.log', 'anon_inode:[eventpoll]', 'socket:[47110]', '/var/lib/ledger/index.db'],
        },
      ],
      units: [
        {
          name: 'payment-api.service',
          pid: 2817,
          unitFile: `[Unit]
Description=Nuri payment API
After=network-online.target

[Service]
User=payapi
ExecStart=/opt/payment-api/bin/payment-api --config /etc/payment-api/config.yaml
Restart=on-failure
# RB-012: 한도 바꿀 땐 인프라팀 리뷰 (강서진)
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target`,
          props: {
            Id: 'payment-api.service',
            Description: 'Nuri payment API',
            MainPID: '2817',
            User: 'payapi',
            LimitNOFILE: '4096',
            LimitNOFILESoft: '4096',
            ActiveState: 'active',
            SubState: 'running',
            NRestarts: '0',
            ExecMainStartTimestamp: 'Mon 2026-11-02 04:12:09 KST',
            FragmentPath: '/etc/systemd/system/payment-api.service',
            DropInPaths: '',
          },
          statusLines: [
            '● payment-api.service - Nuri payment API',
            '     Loaded: loaded (/etc/systemd/system/payment-api.service; enabled; preset: enabled)',
            '     Active: active (running) since Mon 2026-11-02 04:12:09 KST; 2 weeks 0 days ago',
            '   Main PID: 2817 (payment-api)',
            '      Tasks: 64 (limit: 9387)',
            '     Memory: 486.2M (peak: 1.1G)',
            '        CPU: 5h 12min 44.118s',
            '     CGroup: /system.slice/payment-api.service',
            '             └─2817 /opt/payment-api/bin/payment-api --config /etc/payment-api/config.yaml',
            '',
            'Nov 16 07:00:00 pay-api-01 payment-api[2817]: stats: pool_max=200 workers=4 open_fds=1947/4096',
            'Nov 16 08:00:00 pay-api-01 payment-api[2817]: stats: pool_max=200 workers=4 open_fds=1947/4096',
            'Nov 16 09:00:00 pay-api-01 payment-api[2817]: stats: pool_max=200 workers=4 open_fds=1947/4096',
          ],
        },
        {
          name: 'cron.service',
          props: { Id: 'cron.service', Description: 'Regular background program processing daemon', MainPID: '612', ActiveState: 'active', SubState: 'running' },
          unitFile: '[Unit]\nDescription=Regular background program processing daemon\n\n[Service]\nExecStart=/usr/sbin/cron -f -P\n\n[Install]\nWantedBy=multi-user.target',
          statusLines: ['● cron.service - Regular background program processing daemon', '     Loaded: loaded (/usr/lib/systemd/system/cron.service; enabled; preset: enabled)', '     Active: active (running) since Mon 2026-11-02 04:11:58 KST; 2 weeks 0 days ago', '   Main PID: 612 (cron)'],
        },
      ],
      crontabs: {
        eunjae: `# m h dom mon dow  command
# 왜: 정산팀 월말 감사용 원장 사본. 임시. 이관되면 삭제. (2022-03 은재)
15 3 * * 6 /home/eunjae/bin/ledger-backup.sh >> /home/eunjae/log/backup.log 2>&1
# 2026-11-13 은재: 서진님께 넘김. 지우기 전에 정산팀 확인. fd 여유 얇음(LimitNOFILE 4096).`,
        deploy: `# m h dom mon dow  command
5 * * * * /usr/local/bin/pull-config.sh`,
      },
      last: [
        'eunjae   pts/3        10.20.30.77      Fri Nov 13 13:57   still logged in',
        'sjkang   pts/1        10.20.0.5        Thu Nov 12 15:10 - 15:41  (00:31)',
        'eunjae   pts/2        10.20.30.77      Thu Nov 12 10:03 - 18:22  (08:19)',
        'jhpark   pts/1        10.20.0.5        Wed Nov 11 14:20 - 14:26  (00:06)',
      ],
      files: [
        { path: '/home/eunjae/.bashrc', content: EUNJAE_BASHRC, mtime: '2026-05-20T11:02' },
        { path: '/home/eunjae/.profile', content: '# ~/.profile\n[ -f ~/.bashrc ] && . ~/.bashrc', mtime: '2022-03-02T10:00' },
        {
          path: '/home/eunjae/.ssh/config',
          mode: '600',
          mtime: '2025-02-11T14:20',
          content: '# 다음 사람: 접속할 일이 있는 서버들\nHost bastion\n  HostName 10.20.0.5\nHost pay-cfg\n  HostName 10.20.0.8\n  # 결제 설정 저장소 (bare git)\nHost review-web\n  HostName 10.20.0.12\n  # 리뷰 페이지\nHost pay-api-02\n  HostName 10.20.1.12\n  # (조사 모드: 접속 불가 — 01과 같은 구성)',
        },
        {
          path: '/home/eunjae/README.txt',
          mtime: '2025-11-03T16:40',
          content: `# pay-api-01 — 결제 API 1호기
왜: 결제 API. 2018-04 첫 구성 (은재). 02호기와 같은 구성.

- 서비스: systemctl status payment-api   (유닛 파일: /etc/systemd/system/payment-api.service)
- 설정:   /etc/payment-api/config.yaml   ← pay-cfg 저장소에서 매시 5분 pull-config 가 가져옴 (/etc/cron.d/pull-config)
- 로그:   journalctl -u payment-api
- 지표:   curl -s localhost:8080/metrics
- 원장:   /var/lib/ledger (세그먼트 파일 수천 개)
- 개인 스크립트: ~/bin (정리 예정…)

다음 사람에게: 서버들은 생각보다 착해요.`,
        },
        {
          path: '/home/eunjae/README_다음사람에게.txt',
          mtime: '2026-11-13T16:10',
          content: '이 PC를 받는 분께.\n미안해요, 다 못 치웠어요. 화분은 두고 가요.\n서버들은 생각보다 착해요. 밤에만 조금 예민해요.\n\n— 은재 🌱',
        },
        { path: '/home/eunjae/bin/ledger-backup.sh', content: LEDGER_BACKUP, mode: '755', mtime: '2022-03-04T17:20' },
        { path: '/home/eunjae/log/backup.log', content: '', mtime: '2026-11-14T05:39' },
        { path: '/home/eunjae/handover/인수인계서_v4.md', content: HANDOVER, mtime: '2026-11-13T15:39' },
        { path: '/home/eunjae/handover/.인수인계서_v4.md.swp', content: SWAP, mode: '600', mtime: '2026-11-13T17:46' },
        {
          path: '/home/eunjae/notes/TODO.txt',
          mtime: '2026-11-13T14:05',
          content: `[마지막 주]
- [x] 인수인계서 v4
- [x] 서버들의_역사.md (못 끝냄. 괜찮음)
- [ ] 결제 서버 내 crontab → 서진님께 설명 (금 오후)
- [ ] git-admins 그룹 정리 (나, 지훈님) — 대표님께 세 번 말함. 네 번째는 안 함.
- [ ] 온콜표에서 내 이름 빼기 (팀장님)
- [ ] 화분 → 도윤님
- [ ] 마지막으로 탭 닫기`,
        },
        { path: '/home/eunjae/notes/1년.txt', private: true, mtime: '2025-11-20T23:10', content: '남을 이유: 서버들. 서진.\n떠날 이유: 서버들. 서진.' },
        {
          path: '/home/eunjae/notes/서버들의_역사.md',
          mtime: '2026-11-10T19:30',
          content: `# 결제 서버들의 역사 (미완성)
- 2018-04: pay-api-01 첫 구성. 혼자. 밤새 했다.
- 2019-09: 02호기 추가. 처음으로 이중화.
- 2021-06: 설정 저장소에 리뷰 훅. Reviewed-by 없으면 거부. 긴급용으로 git-admins 예외를 뒀다.
- 2022-03: 정산팀 감사용 원장 백업 (임시). 토요일 새벽.
- 2023-11: 서진에게 온콜 넘김. 잘할 거다.`,
        },
        { path: '/home/eunjae/Downloads/목공_기초반_목요일.pdf', content: '%PDF-1.7', binary: 'PDF 문서 — 터미널에서는 볼 수 없어요.', mtime: '2026-05-02T21:14' },
        { path: '/home/eunjae/Downloads/퇴직금_계산.xlsx', content: 'PK', binary: '스프레드시트 — 터미널에서는 볼 수 없어요.', mtime: '2026-10-06T22:41' },
        { path: '/etc/crontab', content: 'SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n# m h dom mon dow user  command\n17 *    * * *   root    cd / && run-parts --report /etc/cron.hourly\n25 6    * * *   root    test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily' },
        { path: '/etc/cron.d/pull-config', content: '# 설정 배포: pay-cfg 저장소 main → /etc/payment-api (매시 5분)\n5 * * * * deploy /usr/local/bin/pull-config.sh' },
        { path: '/etc/cron.d/logrotate', content: '0 0 * * * root /usr/sbin/logrotate /etc/logrotate.conf' },
        { path: '/etc/payment-api/config.yaml', mtime: '2026-11-13T18:05', content: '# 이 파일은 pay-cfg 저장소에서 자동 배포됩니다. 직접 고치지 마세요.\nhttp:\n  listen: ":8080"\n  timeout: 5s\ndb:\n  host: 10.20.2.15:5432\n  workers: 4\n  max_connections: 200\n  idle_timeout: 30s\nledger:\n  dir: /var/lib/ledger\n  export_endpoint: /internal/ledger/export' },
        { path: '/usr/local/bin/pull-config.sh', mode: '755', content: '#!/bin/sh\n# 왜: 설정은 저장소가 기준. 사람이 서버에서 직접 고치지 않게. (2021-06 은재)\nset -e\ncd /srv/pay-config && git pull -q origin main\nrsync -a config/ /etc/payment-api/ && systemctl reload payment-api' },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
    {
      name: 'bastion',
      user: 'eunjae',
      ip: '10.20.0.5',
      sudoRead: true,
      motd: ['bastion — 모든 서버 접속은 여기를 거칩니다.', '접속 기록은 last 로 볼 수 있어요. VPN 주소는 vpn-10.8.x.x 로 보입니다.'],
      last: [
        'jhpark   pts/4        10.20.30.61      Mon Nov 16 08:31 - 08:39  (00:08)',
        'sjkang   pts/1        vpn-10.8.3.41    Sat Nov 14 02:05 - 02:14  (00:09)',
        'jhpark   pts/4        10.20.30.61      Fri Nov 13 17:58 - 18:03  (00:05)',
        'eunjae   pts/2        10.20.30.77      Fri Nov 13 13:55   still logged in',
        'sjkang   pts/1        10.20.30.52      Thu Nov 12 10:02 - 18:40  (08:38)',
        'eunjae   pts/2        10.20.30.77      Thu Nov 12 10:01 - 18:24  (08:23)',
        'jhpark   pts/3        10.20.30.61      Wed Nov 11 14:18 - 14:31  (00:13)',
        'sjkang   pts/1        10.20.30.52      Wed Nov 11 09:58 - 19:02  (09:04)',
      ],
      files: [
        { path: '/home/eunjae/README.txt', content: '# bastion\n왜: 모든 서버 접속을 한 곳으로. 기록이 남게. (은재)\n- 접속 기록: last  (VPN으로 들어오면 출발지가 vpn-10.8.x.x)\n- 인증 기록: /var/log/auth.log\n- 사람들 홈: /home/<이름> (남의 홈은 sudo 로만, 그것도 기록됨)\n- 휴가·인수인계 메모는 각자 홈에 남겨요. 서진님 홈에도 있음 (sudo ls /home/sjkang).' },
        { path: '/home/eunjae/.bashrc', content: EUNJAE_BASHRC },
        { path: '/home/sjkang/.bashrc', content: SJKANG_BASHRC, mode: '644' },
        { path: '/home/sjkang/휴가_인수인계_2026-11-13.md', content: '- 결제 변경은 월요일까지 동결 부탁.\n- 리뷰 대기 1건(지훈님 풀 설정). 월요일에 봄.\n- 온콜 2순위 수정: 11/17 반영 예정 (은재 선배 → 지훈님)', mtime: '2026-11-13T11:20' },
        { path: '/home/sjkang/2026-11-13_결제변경검토_대기.md', content: '', mtime: '2026-11-13T11:21' },
        { path: '/home/sjkang/src/pay-config/.git/HEAD', content: 'ref: refs/heads/revert-pool-bump', mtime: '2026-11-14T02:11' },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
    {
      name: 'pay-cfg',
      user: 'eunjae',
      ip: '10.20.0.8',
      sudoRead: true,
      motd: ['pay-cfg — 결제 설정 저장소 서버', '저장소: /srv/git/pay-config.git (bare).  기록 보기: cd /srv/git/pay-config.git && git log'],
      groups: {
        'git-admins': { gid: 1050, members: ['eunjae', 'jhpark'] },
        'pay-config': { gid: 1060, members: ['eunjae', 'jhpark', 'sjkang', 'dyhan'] },
      },
      last: [
        'jhpark   pts/1        10.20.0.5        Mon Nov 16 08:33 - 08:38  (00:05)',
        'eunjae   pts/0        10.20.0.5        Fri Nov 13 14:20   still logged in',
        'sjkang   pts/1        10.20.0.5        Thu Nov 12 16:02 - 16:20  (00:18)',
      ],
      repos: [
        {
          path: '/srv/git/pay-config.git',
          branch: 'main',
          refs: { main: SHA.pool, 'revert-pool-bump': SHA.revert },
          commits: [
            {
              sha: SHA.timeout,
              author: 'eunjae',
              authorDate: '2026-09-02T14:21:40',
              subject: '[변경] 결제 타임아웃 3s→5s (리뷰: 강서진)',
              body: 'PG사 응답 지연 대응. RB-019 참고.\n\nReviewed-by: 강서진 <sjkang@nuricloud.example>',
              diff: 'diff --git a/config/http.yaml b/config/http.yaml\n--- a/config/http.yaml\n+++ b/config/http.yaml\n@@ -1,3 +1,3 @@\n http:\n   listen: ":8080"\n-  timeout: 3s\n+  timeout: 5s',
            },
            {
              sha: SHA.loglevel,
              parent: SHA.timeout,
              author: 'jihoon',
              authorDate: '2026-09-18T19:44:02',
              subject: '로그 레벨 info로 (급해서 먼저 올림)',
              diff: 'diff --git a/config/log.yaml b/config/log.yaml\n--- a/config/log.yaml\n+++ b/config/log.yaml\n@@ -1,2 +1,2 @@\n log:\n-  level: debug\n+  level: info',
            },
            {
              sha: SHA.retry,
              parent: SHA.loglevel,
              author: 'jihoon',
              authorDate: '2026-10-08T11:05:51',
              commitDate: '2026-10-09T15:30:12',
              subject: '[변경] PG 재시도 2→3 (리뷰: 강서진)',
              body: 'Reviewed-by: 강서진 <sjkang@nuricloud.example>',
              diff: 'diff --git a/config/pg.yaml b/config/pg.yaml\n--- a/config/pg.yaml\n+++ b/config/pg.yaml\n@@ -1,2 +1,2 @@\n pg:\n-  retries: 2\n+  retries: 3',
            },
            {
              sha: SHA.cachettl,
              parent: SHA.retry,
              author: 'jihoon',
              authorDate: '2026-10-22T18:47:30',
              subject: '[변경] 캐시 TTL 60→120 (리뷰: 강서진)',
              diff: 'diff --git a/config/cache.yaml b/config/cache.yaml\n--- a/config/cache.yaml\n+++ b/config/cache.yaml\n@@ -1,2 +1,2 @@\n cache:\n-  ttl: 60s\n+  ttl: 120s',
            },
            {
              sha: SHA.health,
              parent: SHA.cachettl,
              author: 'seojin',
              authorDate: '2026-11-05T10:12:08',
              commitDate: '2026-11-05T16:40:51',
              subject: '[변경] 헬스체크 경로 /healthz 로 통일 (리뷰: 박지훈)',
              body: 'RB-031 7번 단계와 맞춤.\n\nReviewed-by: 박지훈 <jhpark@nuricloud.example>',
              diff: 'diff --git a/config/http.yaml b/config/http.yaml\n--- a/config/http.yaml\n+++ b/config/http.yaml\n@@ -2,3 +2,4 @@\n   listen: ":8080"\n   timeout: 5s\n+  health: /healthz',
            },
            {
              sha: SHA.pool,
              parent: SHA.health,
              author: 'jihoon',
              authorDate: '2026-11-13T18:02:11',
              subject: '커넥션 풀 상향(리뷰: 강서진)',
              diff: 'diff --git a/config/pool.yaml b/config/pool.yaml\nindex 3b18e51..a9c04d2 100644\n--- a/config/pool.yaml\n+++ b/config/pool.yaml\n@@ -1,4 +1,4 @@\n db:\n   workers: 4\n-  max_connections: 50\n+  max_connections: 200\n   idle_timeout: 30s',
            },
            {
              sha: SHA.revert,
              parent: SHA.pool,
              author: 'seojin',
              authorDate: '2026-11-14T02:11:09',
              subject: 'Revert "커넥션 풀 상향(리뷰: 강서진)"',
              body: `This reverts commit ${SHA.pool}.`,
              diff: 'diff --git a/config/pool.yaml b/config/pool.yaml\nindex a9c04d2..3b18e51 100644\n--- a/config/pool.yaml\n+++ b/config/pool.yaml\n@@ -1,4 +1,4 @@\n db:\n   workers: 4\n-  max_connections: 200\n+  max_connections: 50\n   idle_timeout: 30s',
            },
          ],
        },
      ],
      files: [
        { path: '/home/eunjae/README.txt', content: '# pay-cfg — 결제 설정 저장소\n왜: 결제 설정은 두 사람 눈을 거쳐야 해서. (2021-06 은재)\n- 저장소: /srv/git/pay-config.git (bare). cd 해서 git log, git show, git branch -a\n- 리뷰 검사: /srv/git/pay-config.git/hooks/pre-receive\n- 그룹: getent group pay-config / git-admins' },
        { path: '/home/eunjae/.bashrc', content: EUNJAE_BASHRC },
        { path: '/srv/git/pay-config.git/HEAD', owner: 'git', group: 'pay-config', content: 'ref: refs/heads/main' },
        { path: '/srv/git/pay-config.git/config', owner: 'git', group: 'pay-config', content: '[core]\n\trepositoryformatversion = 0\n\tbare = true\n[receive]\n\tdenyNonFastforwards = true' },
        { path: '/srv/git/pay-config.git/description', owner: 'git', group: 'pay-config', content: '결제 서비스 설정 (pay-api-01/02 가 매시 5분 pull)' },
        {
          path: '/srv/git/pay-config.git/hooks/pre-receive',
          owner: 'git',
          group: 'pay-config',
          mode: '755',
          mtime: '2021-06-14T17:02',
          content: `#!/bin/sh
# 왜: 결제 설정은 두 사람 눈을 거쳐야 해서. 커밋마다 Reviewed-by: 트레일러 확인. (2021-06 은재)
id -nG "$USER" | grep -qw git-admins && exit 0  # 긴급 시에만 — 은재
while read old new ref; do
  for c in $(git rev-list "$old..$new"); do
    git log -1 --format=%B "$c" | grep -q '^Reviewed-by: ' || {
      echo "거부: $c 에 Reviewed-by: 트레일러가 없습니다. 리뷰 후 다시 푸시하세요." >&2
      exit 1
    }
  done
done`,
        },
        { path: '/home/jhpark/.bashrc', content: JHPARK_BASHRC, mode: '644' },
        { path: '/home/jhpark/.gitconfig', content: '[user]\n\tname = 박지훈\n\temail = jhpark@nuricloud.example\n[commit]\n\ttemplate = ~/.gitmessage', mtime: '2025-12-01T10:00' },
        { path: '/home/jhpark/.gitmessage', content: '[변경] ___ (리뷰: ___)' },
        { path: '/home/jhpark/p99_개선안_목요일.md', mtime: '2026-11-12T17:10', content: '## p99 개선 (월 10시 데모 전!!)\n- 커넥션 풀 50 → 200 : p99 30% 개선 예상 ㅋㅋ\n- 리스크: 없음(?)\n- TODO: nofile? 이거 뭐였지 → 검색해보기' },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
    {
      name: 'review-web',
      user: 'eunjae',
      ip: '10.20.0.12',
      motd: ['review-web — 사내 리뷰 페이지 (작은 내부 도구)', '접근 기록: /var/log/nginx/access.log  (세 번째 칸이 로그인한 사용자)'],
      files: [
        { path: '/home/eunjae/README.txt', content: '# review-web\n왜: 설정 변경 리뷰를 웹에서 하려고 만든 작은 도구. (2021 은재)\n- 접근 기록: /var/log/nginx/access.log  (세 번째 칸 = 사용자)\n- 리뷰 흐름: GET /review/<번호> → POST …/comment → POST …/approve' },
        { path: '/home/eunjae/.bashrc', content: EUNJAE_BASHRC },
        { path: '/var/log/nginx/access.log', group: 'adm', mode: '640', content: '' },
        { path: '/var/log/nginx/error.log', group: 'adm', mode: '640', content: '' },
      ],
    },
  ],

  // ------------------------------------------------------------------ timeline (characters.md §1)
  timeline: [
    // Old DMs / channel life
    { at: '2023-08-17T21:12:00', emits: [{ kind: 'message', channel: 'pc-dm-seojin', from: 'eunjae', text: '서진님 런북 좋네요. 제 머릿속보다 낫다 :)' }] },
    { at: '2023-08-17T21:14:30', emits: [{ kind: 'message', channel: 'pc-dm-seojin', from: 'seojin', text: 'ㅎ' }] },
    { at: '2025-03-04T10:22:00', emits: [{ kind: 'message', channel: 'pc-dm-jihoon', from: 'jihoon', text: '선배님 bastion 거쳐서 들어가는 거 또 까먹었어요 ㅋㅋ 🙏' }] },
    { at: '2025-03-04T10:25:00', emits: [{ kind: 'message', channel: 'pc-dm-jihoon', from: 'eunjae', text: '~/.ssh/config 에 적어 둘게요. 다음 사람도 헷갈리겠네요 🌱' }] },
    {
      at: '2026-10-21T14:02:00',
      note: 'Foreshadow: Seojin asked for the fd check on the earlier pool proposal.',
      emits: [{ kind: 'message', channel: 'pc-payment-change', from: 'jihoon', text: '풀 50→100 올려 봐도 될까요~? p99 살짝만 내리면 됨 ㅋㅋ 🙏' }],
    },
    { at: '2026-10-21T16:40:00', emits: [{ kind: 'message', channel: 'pc-payment-change', from: 'seojin', text: '음. 풀 크기 올리면 fd도 같이 봐야 해요. LimitNOFILE 확인 부탁해요.' }] },
    { at: '2026-10-21T16:41:00', emits: [{ kind: 'message', channel: 'pc-payment-change', from: 'jihoon', text: '넵넵~ 👍 다음에 다시 올릴게요!!' }] },
    { at: '2026-11-05T16:41:00', emits: [{ kind: 'message', channel: 'pc-payment-change', from: 'seojin', text: '헬스체크 경로 통일 반영했어요. RB-031 7번 단계 순서 바뀜.' }] },
    { at: '2026-11-12T09:31:00', emits: [{ kind: 'message', channel: 'pc-all', from: 'jihoon', text: '금요일 은재 선배님 송별회 19시 정든집입니다!! 오늘은 무조건 제가 쏩니다 🍕' }] },

    // Thu: the pressure (mail in data.mails)
    {
      at: '2026-11-07T03:15:01',
      note: 'Previous Saturday backup: margin was already thin (3,712 / 4,096).',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'cron.service', ident: 'CRON', pid: 40913, msg: '(eunjae) CMD (/home/eunjae/bin/ledger-backup.sh >> /home/eunjae/log/backup.log 2>&1)' },
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'export: started by eunjae (POST /internal/ledger/export since=2022-03-01)' },
        { kind: 'log', host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso', line: '{ts} start ledger export (since 2022-03-01) -> /backup/ledger/2026-11-07' },
      ],
    },
    { at: '2026-11-07T03:00:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'stats: pool_max=50 workers=4 open_fds=1398/4096' }] },
    {
      at: '2026-11-07T03:15:03',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'export: opened 2,288 segment files' },
        { kind: 'log', host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso', line: '{ts} export: opened 2,288 segment files' },
      ],
    },
    { at: '2026-11-07T04:00:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'stats: pool_max=50 workers=4 open_fds=3712/4096' }] },
    { at: '2026-11-07T05:00:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'stats: pool_max=50 workers=4 open_fds=3694/4096' }] },
    {
      at: '2026-11-07T05:31:40',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'export: finished, closed 2,288 segment files' },
        { kind: 'log', host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso', line: '{ts} done (exit 0)' },
      ],
    },

    // Fri 11/13 — last day
    { at: '2026-11-13T11:05:00', emits: [{ kind: 'journal', host: 'bastion', unit: 'ssh.service', ident: 'sshd', pid: 88410, msg: 'Accepted publickey for sjkang from 10.20.30.52 port 51822 ssh2' }] },
    { at: '2026-11-13T13:55:12', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: '{ts} bastion sshd[90122]: Accepted publickey for eunjae from 10.20.30.77 port 52114 ssh2' }] },
    { at: '2026-11-13T13:57:40', emits: [{ kind: 'log', host: 'pay-api-01', path: '/var/log/auth.log', format: 'syslog', line: '{ts} pay-api-01 sshd[71002]: Accepted publickey for eunjae from 10.20.30.77 port 52130 ssh2' }] },
    { at: '2026-11-13T13:58:02', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4979, cmd: '# 마지막 날. 인수인계서부터.' }] },
    { at: '2026-11-13T13:58:10', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4980, cmd: 'cd ~/hadnover' }] },
    { at: '2026-11-13T13:58:13', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4981, cmd: 'cd ~/handover' }] },
    { at: '2026-11-13T13:58:20', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4982, cmd: 'vim 인수인계서_v4.md' }] },
    { at: '2026-11-13T15:40:30', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4983, cmd: 'crontba -l' }] },
    { at: '2026-11-13T15:40:33', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4984, cmd: 'crontab -l' }] },
    { at: '2026-11-13T15:41:12', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4985, cmd: 'head -5 ~/bin/ledger-backup.sh' }] },
    { at: '2026-11-13T15:42:01', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4986, cmd: 'fds' }] },
    { at: '2026-11-13T15:42:40', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4987, cmd: 'systemctl show payment-api -p LimitNOFILE' }] },
    { at: '2026-11-13T15:43:05', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4988, cmd: 'tail -3 ~/log/backup.log' }] },
    {
      at: '2026-11-13T15:44:20',
      emits: [
        { kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4989, cmd: 'sudo systemctl edit payment-api' },
        { kind: 'log', host: 'pay-api-01', path: '/var/log/auth.log', format: 'syslog', line: '{ts} pay-api-01 sudo:   eunjae : TTY=pts/3 ; PWD=/home/eunjae ; USER=root ; COMMAND=/usr/bin/systemctl edit payment-api' },
      ],
    },
    { at: '2026-11-13T15:46:58', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4990, cmd: '# LimitNOFILE은 내 맘대로 올리면 안 됨. 서진님이랑. 정산팀 확인도.' }] },
    { at: '2026-11-13T15:47:30', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4991, cmd: 'crontab -e' }] },
    { at: '2026-11-13T15:49:02', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4992, cmd: 'crontab -l | tail -3' }] },
    { at: '2026-11-13T15:50:40', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4993, cmd: '# 지우는 건 다음 사람이. 나는 이제 다음 사람이 아님.' }] },
    { at: '2026-11-13T17:30:00', emits: [{ kind: 'message', id: 'E01', channel: 'pc-all', from: 'eunjae', text: '8년 동안 고마웠습니다. 서버들 잘 부탁드려요. 다들 물 잘 주세요 🌱' }] },
    { at: '2026-11-13T17:31:00', emits: [{ kind: 'message', channel: 'pc-all', from: 'jihoon', text: '선배님 ㅠㅠ 8년 고생 많으셨어요!! 🙏🙏' }] },
    { at: '2026-11-13T17:33:00', emits: [{ kind: 'message', channel: 'pc-all', from: 'doyun', text: '은재님 3주 동안 정말 감사했습니다!! 🙇🙇' }] },
    { at: '2026-11-13T17:44:10', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4994, cmd: '밤' }] },
    { at: '2026-11-13T17:47:02', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4995, cmd: '# 서진님께 메일. 지금.' }] },
    { at: '2026-11-13T17:52:00', emits: [{ kind: 'message', id: 'E02', channel: 'pc-dm-jihoon', from: 'jihoon', text: '선배님 가시죠 ㅋㅋ 자리 잡았어요!! 오늘은 무조건 제가 쏩니다' }] },
    { at: '2026-11-13T17:52:31', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4996, cmd: '# 갔다 와서 마저.' }] },
    { at: '2026-11-13T17:58:20', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: '{ts} bastion sshd[90877]: Accepted publickey for jhpark from 10.20.30.61 port 50442 ssh2' }] },
    { at: '2026-11-13T17:59:00', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 877, cmd: 'vim config/pool.yaml' }] },
    { at: '2026-11-13T18:00:10', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 878, cmd: 'git diff' }] },
    { at: '2026-11-13T18:01:30', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 879, cmd: "git commit -am '커넥션 풀 상향(리뷰: 강서진)'" }] },
    { at: '2026-11-13T18:01:52', emits: [{ kind: 'log', host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx', line: '10.20.30.61 - jhpark [{ts}] "POST /review/new HTTP/1.1" 303 0 "https://review-web/review/new" "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/131.0"' }] },
    { at: '2026-11-13T18:01:53', emits: [{ kind: 'log', host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx', line: '10.20.30.61 - jhpark [{ts}] "GET /review/412 HTTP/1.1" 200 4890 "https://review-web/review/new" "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/131.0"' }] },
    { at: '2026-11-13T18:02:11', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 880, cmd: 'shipit' }] },
    { at: '2026-11-13T18:02:20', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 881, cmd: '괜찮아' }] },
    { at: '2026-11-13T18:03:05', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 882, cmd: 'curl -s localhost:8080/metrics | grep p99' }] },
    { at: '2026-11-13T18:04:00', emits: [{ kind: 'message', id: 'E03', channel: 'pc-payment-change', from: 'jihoon', text: '작은 설정 하나만 올렸어요~ 서진님 휴가 끝나고 보셔도 돼요 🙏' }] },
    {
      at: '2026-11-13T18:05:00',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'pull-config.service', ident: 'pull-config', pid: 51120, msg: `pay-config main ${SHA.health.slice(0, 7)} -> ${SHA.pool.slice(0, 7)}, syncing /etc/payment-api` },
      ],
    },
    {
      at: '2026-11-13T18:05:02',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'systemd', pid: 1, msg: 'Reloading payment-api.service - Nuri payment API...' },
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'config reloaded: db.max_connections 50 -> 200 (workers=4)' },
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'systemd', pid: 1, msg: 'Reloaded payment-api.service - Nuri payment API.' },
      ],
    },
    { at: '2026-11-13T22:14:00', emits: [{ kind: 'message', id: 'E04', channel: 'pc-dm-doyun', from: 'doyun', text: '은재님 오늘 정말 감사했습니다!! 조심히 들어가세요 🙇🙇' }] },
    { at: '2026-11-13T22:15:00', emits: [{ kind: 'message', id: 'E05', channel: 'pc-dm-doyun', from: 'eunjae', text: '도윤님도요. 아 그리고 월요일에 서진님께 그거 꼭요. 밤에 도는 거.' }] },
    { at: '2026-11-13T22:16:00', emits: [{ kind: 'message', channel: 'pc-dm-doyun', from: 'doyun', text: '넵!! 메모했습니다' }] },

    // Sat 11/14 — the night
    { at: '2026-11-14T02:01:00', emits: [{ kind: 'message', id: 'E06', channel: 'pc-payment-change', from: 'seojin', text: '급한 거 아니면 월요일에 봐도 될까요', deletedAt: '2026-11-14T02:12:00' }] },
    {
      at: '2026-11-14T02:05:31',
      emits: [
        { kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: '{ts} bastion sshd[91544]: Accepted publickey for sjkang from 10.8.3.41 port 40118 ssh2: ED25519 SHA256:q2Vd…sjkang@home' },
        { kind: 'journal', host: 'bastion', unit: 'ssh.service', ident: 'sshd', pid: 91544, msg: 'Accepted publickey for sjkang from 10.8.3.41 port 40118 ssh2' },
      ],
    },
    { at: '2026-11-14T02:05:58', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2211, cmd: 'cd ~/src/pay-config' }] },
    { at: '2026-11-14T02:06:03', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2212, cmd: 'git fetch -q' }] },
    { at: '2026-11-14T02:06:11', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2213, cmd: 'git log --format=fuller -1 origin/main' }] },
    { at: '2026-11-14T02:06:40', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2214, cmd: 'getent group git-admins' }] },
    { at: '2026-11-14T02:06:52', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2215, cmd: '# 왜 아직 여기 있지. 월요일에.' }] },
    { at: '2026-11-14T02:10:03', emits: [{ kind: 'log', host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx', line: '10.8.3.41 - sjkang [{ts}] "GET /review/412 HTTP/1.1" 200 4890 "-" "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0"' }] },
    { at: '2026-11-14T02:10:07', emits: [{ kind: 'log', host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx', line: '10.8.3.41 - sjkang [{ts}] "POST /review/412/approve HTTP/1.1" 303 0 "https://review-web/review/412" "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0"' }] },
    { at: '2026-11-14T02:10:08', emits: [{ kind: 'log', host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx', line: '10.8.3.41 - sjkang [{ts}] "GET /review/412 HTTP/1.1" 200 5011 "https://review-web/review/412" "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0"' }] },
    { at: '2026-11-14T02:11:02', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2216, cmd: 'git switch -c revert-pool-bump origin/main' }] },
    { at: '2026-11-14T02:11:09', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2217, cmd: 'git revert --no-edit HEAD' }] },
    { at: '2026-11-14T02:11:30', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2218, cmd: 'git push -u origin revert-pool-bump' }] },
    { at: '2026-11-14T02:13:47', emits: [{ kind: 'history', host: 'bastion', user: 'sjkang', n: 2219, cmd: "ssh pay-api-01 'systemctl show payment-api -p LimitNOFILE'" }] },
    {
      at: '2026-11-14T02:14:20',
      emits: [
        { kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: '{ts} bastion sshd[91544]: Timeout, client not responding from user sjkang 10.8.3.41 port 40118' },
        { kind: 'journal', host: 'bastion', unit: 'ssh.service', ident: 'sshd', pid: 91544, msg: 'Timeout, client not responding from user sjkang 10.8.3.41 port 40118' },
      ],
    },
    { at: '2026-11-14T03:00:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'stats: pool_max=200 workers=4 open_fds=1947/4096' }] },
    {
      at: '2026-11-14T03:15:01',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'cron.service', ident: 'CRON', pid: 44012, msg: '(eunjae) CMD (/home/eunjae/bin/ledger-backup.sh >> /home/eunjae/log/backup.log 2>&1)' },
        { kind: 'log', host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso', line: '{ts} start ledger export (since 2022-03-01) -> /backup/ledger/2026-11-14' },
      ],
    },
    { at: '2026-11-14T03:15:02', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'export: started by eunjae (POST /internal/ledger/export since=2022-03-01)' }] },
    {
      at: '2026-11-14T03:15:03',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'export: opened 2,314 segment files' },
        { kind: 'log', host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso', line: '{ts} export: opened 2,314 segment files' },
      ],
    },
    {
      at: '2026-11-14T03:15:40',
      emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, priority: 3, msg: 'http: Accept error: accept tcp [::]:8080: accept4: too many open files; retrying in 1s', repeat: { count: 6, everySec: 1 } }],
    },
    { at: '2026-11-14T03:15:47', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, priority: 3, msg: 'db: dial tcp 10.20.2.15:5432: socket: too many open files' }] },
    { at: '2026-11-14T03:16:10', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'systemd-journald.service', ident: 'systemd-journald', pid: 412, msg: 'Suppressed 18214 messages from payment-api.service' }] },
    { at: '2026-11-14T03:17:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, priority: 3, msg: 'http: 5xx ratio 41.7% over last 60s (503 Service Unavailable)' }] },
    { at: '2026-11-14T03:30:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, priority: 3, msg: 'http: Accept error: accept tcp [::]:8080: accept4: too many open files; retrying in 1s' }] },
    { at: '2026-11-14T03:46:10', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'systemd-journald.service', ident: 'systemd-journald', pid: 412, msg: 'Suppressed 52990 messages from payment-api.service' }] },
    { at: '2026-11-14T04:00:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'stats: pool_max=200 workers=4 open_fds=4096/4096' }] },
    { at: '2026-11-14T04:30:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, priority: 3, msg: 'http: Accept error: accept tcp [::]:8080: accept4: too many open files; retrying in 1s' }] },
    { at: '2026-11-14T05:00:00', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'stats: pool_max=200 workers=4 open_fds=4096/4096' }] },
    { at: '2026-11-14T05:16:10', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'systemd-journald.service', ident: 'systemd-journald', pid: 412, msg: 'Suppressed 49377 messages from payment-api.service' }] },
    {
      at: '2026-11-14T05:39:52',
      emits: [
        { kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'export: finished, closed 2,314 segment files' },
        { kind: 'log', host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso', line: '{ts} done (exit 0)' },
      ],
    },
    { at: '2026-11-14T05:40:03', emits: [{ kind: 'journal', host: 'pay-api-01', unit: 'payment-api.service', ident: 'payment-api', pid: 2817, msg: 'http: accept resumed; 5xx ratio 0.2% over last 60s' }] },
    ...alertEvents(),
    { at: '2026-11-14T06:20:00', emits: [{ kind: 'message', id: 'E08', channel: 'pc-payment-change', from: 'jihoon', text: '새벽에 5xx 났었네요?? 설마 제 풀 설정은 아니겠죠 ㅋㅋㅋ', deletedAt: '2026-11-16T08:40:00' }] },
    { at: '2026-11-14T06:22:00', emits: [{ kind: 'message', id: 'E09', channel: 'pc-payment-change', from: 'jihoon', text: '아 서진님이 승인해주셨으니 괜찮겠네요!! 👍', deletedAt: '2026-11-16T08:40:00' }] },

    // Mon 11/16 morning
    { at: '2026-11-16T08:31:10', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: '{ts} bastion sshd[99102]: Accepted publickey for jhpark from 10.20.30.61 port 50990 ssh2' }] },
    { at: '2026-11-16T08:33:40', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 883, cmd: 'git log --format=fuller -1' }] },
    { at: '2026-11-16T08:35:02', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 884, cmd: 'getent group git-admins' }] },
    { at: '2026-11-16T08:35:30', emits: [{ kind: 'history', host: 'pay-cfg', user: 'jhpark', n: 885, cmd: '# 아...' }] },
    { at: '2026-11-16T08:37:12', emits: [{ kind: 'log', host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx', line: '10.20.30.61 - jhpark [{ts}] "GET /review/412 HTTP/1.1" 200 5011 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/131.0"' }] },
    { at: '2026-11-16T08:59:30', emits: [{ kind: 'log', host: 'pay-api-01', path: '/var/log/auth.log', format: 'syslog', line: '{ts} pay-api-01 security-session: investigation mode enabled for session of eunjae (pts/3) — read-only, approved by 보안팀 (ticket SEC-2211)' }] },

    // Eunjae's older history lines (characters.md §5(i))
    { at: '2026-05-08T02:41:17', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4612, cmd: 'journalctl -u payment-api --since "02:30" | grep -i error' }] },
    { at: '2026-05-08T02:44:50', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4613, cmd: '# 또 새벽. 이번 달 네 번째.' }] },
    { at: '2026-10-28T10:12:03', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4790, cmd: '# 정산팀 김 과장님 답장 없음. 백업 아직 쓰시는지 모름.' }] },
  ],

  generators: [
    {
      kind: 'historyFill',
      host: 'pay-api-01',
      user: 'eunjae',
      from: '2026-05-08T10:00',
      to: '2026-11-13T12:00',
      seed: 4612,
      pool: [
        'systemctl status payment-api', 'journalctl -u payment-api -n 50', 'df -h', 'free -h', 'cd ~', 'ls -al', 'cd /etc/payment-api', 'cat config.yaml',
        'curl -s localhost:8080/metrics | grep p99', 'tail -3 ~/log/backup.log', 'uptime', 'ss -s', 'ls /var/lib/ledger | wc -l', 'journalctl -p err --since today',
        'git -C /srv/pay-config log --oneline -3', 'cat ~/README.txt', 'last -n 5', 'ps aux | grep payment', 'cd ~/handover', 'ls', 'vim 인수인계서_v3.md', 'fds',
      ],
    },
    {
      kind: 'periodic',
      host: 'pay-api-01',
      journal: { unit: 'payment-api.service', ident: 'payment-api', pid: 2817 },
      from: '2026-11-06T00:00',
      to: '2026-11-16T09:00',
      everyMin: 60,
      line: 'stats: {v}',
      steps: [
        { from: '2026-11-06T00:00', v: 'pool_max=50 workers=4 open_fds=1398/4096' },
        { from: '2026-11-13T18:05', v: 'pool_max=200 workers=4 open_fds=1947/4096' },
      ],
      skip: [
        ['2026-11-07T03:00', '2026-11-07T05:59'],
        ['2026-11-14T03:00', '2026-11-14T05:59'],
      ],
    },
    {
      kind: 'periodic',
      host: 'pay-api-01',
      journal: { unit: 'cron.service', ident: 'CRON' },
      from: '2026-11-06T00:05',
      to: '2026-11-16T09:00',
      everyMin: 60,
      line: '(deploy) CMD (/usr/local/bin/pull-config.sh)',
      steps: [],
    },
    {
      kind: 'sequence',
      target: { host: 'pay-api-01', path: '/home/eunjae/log/backup.log', format: 'iso' },
      count: 9,
      start: '2026-09-05T03:15:01',
      gapMin: [10080, 10080],
      steps: [
        { afterSec: [0, 0], line: '{ts} start ledger export (since 2022-03-01)' },
        { afterSec: [2, 3], line: '{ts} export: opened 2,2{r2} segment files' },
        { afterSec: [7900, 8500], line: '{ts} done (exit 0)' },
      ],
      seed: 22,
    },
    {
      kind: 'sequence',
      target: { host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx' },
      count: 20,
      start: '2026-10-12T10:20:00',
      gapMin: [900, 2300],
      daytimeOnly: true,
      idBase: 380,
      steps: [
        { afterSec: [0, 0], line: '10.20.30.52 - sjkang [{ts}] "GET /review/{id} HTTP/1.1" 200 4{r3} "-" "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0"' },
        { afterSec: [60, 420], line: '10.20.30.52 - sjkang [{ts}] "POST /review/{id}/comment HTTP/1.1" 303 0 "https://review-web/review/{id}" "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0"' },
        { afterSec: [60, 600], line: '10.20.30.52 - sjkang [{ts}] "POST /review/{id}/comment HTTP/1.1" 303 0 "https://review-web/review/{id}" "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0"' },
        { afterSec: [30, 300], line: '10.20.30.52 - sjkang [{ts}] "POST /review/{id}/approve HTTP/1.1" 303 0 "https://review-web/review/{id}" "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0"' },
      ],
      seed: 412,
    },
    {
      kind: 'sequence',
      target: { host: 'review-web', path: '/var/log/nginx/access.log', format: 'nginx' },
      count: 34,
      start: '2026-10-12T11:00:00',
      gapMin: [600, 1500],
      daytimeOnly: true,
      steps: [
        { afterSec: [0, 0], line: '10.20.30.61 - jhpark [{ts}] "GET /reviews?assignee=me HTTP/1.1" 200 2{r3} "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/131.0"' },
        { afterSec: [5, 40], line: '10.20.30.90 - dyhan [{ts}] "GET /reviews HTTP/1.1" 200 3{r3} "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/131.0"' },
      ],
      seed: 77,
    },
  ],

  // ------------------------------------------------------------------ messenger
  channels: [
    { id: 'pc-all', account: 'pc', kind: 'channel', title: '#전체' },
    { id: 'pc-payment-change', account: 'pc', kind: 'channel', title: '#결제-변경' },
    { id: 'alerts', account: 'pc', kind: 'channel', title: '#장애-알림', collapseFrom: 'bot' },
    { id: 'pc-dm-doyun', account: 'pc', kind: 'dm', title: '한도윤', with: 'doyun' },
    { id: 'pc-dm-jihoon', account: 'pc', kind: 'dm', title: '박지훈', with: 'jihoon' },
    { id: 'pc-dm-seojin', account: 'pc', kind: 'dm', title: '강서진', with: 'seojin', draft: '서진님, 그동안 런북 써 줘서 고마웠어요. 사실 나는' },
    { id: 'me-dm-jihoon', account: 'me', kind: 'dm', title: '박지훈', with: 'jihoon' },
    { id: 'me-dm-seojin', account: 'me', kind: 'dm', title: '강서진', with: 'seojin' },
  ],

  mails: [
    {
      id: 'brief', account: 'me', folder: 'inbox', from: 'mirae', to: '한도윤', cc: '박지훈', at: '2026-11-16T09:00',
      subject: '[긴급] 토요일 결제 장애 원인 보고',
      body: '도윤님,\n주말 잘 보내셨을 텐데 죄송합니다.\n\n- 은재님 PC 반납 정리와 함께 원인 보고서를 오늘 21:00까지 부탁드립니다.\n- 은재님 계정 세션은 보안팀 승인하에 조사 목적으로만 사용해 주세요.\n- 원인, 경위, 책임 소재를 명확히 해 주십시오.\n\n오미래 드림 / CTO',
    },
    {
      id: 'security', account: 'me', folder: 'inbox', from: 'security', to: '한도윤', at: '2026-11-16T08:59',
      subject: '[안내] 남은재님 계정 조사 모드 세션 (SEC-2211)',
      body: '한도윤님,\n남은재님 PC 세션을 조사 모드로 열어 두었습니다.\n\n- 읽기 전용입니다. 파일 수정, 서비스 재시작, crontab 편집은 막혀 있습니다.\n- 터미널에서 help 를 입력하면 이 세션에 허용된 도구 목록이 나옵니다. man <명령> 으로 예시도 볼 수 있습니다.\n- 남의 홈 디렉터리는 sudo 로만 읽을 수 있고, 모든 sudo 사용은 auth.log에 기록됩니다.\n- 열려 있던 터미널 탭(pay-api-01, bastion, pay-cfg, review-web)은 그대로 두었습니다.\n- 찾은 증거는 📌 로 증거 보드에 모아 두면 보고서 작성(제출 3회 제한)에 도움이 됩니다.\n\n계정은 오늘 조사 종료 후 회수합니다.\n보안팀',
    },
    {
      id: 'pressure', account: 'me', folder: 'inbox', from: 'mirae', to: '한도윤', at: '2026-11-16T17:00', later: true,
      subject: 'RE: [긴급] 토요일 결제 장애 원인 보고',
      body: '도윤님,\n진행 상황 공유 부탁드립니다. 파트너사에 내일 오전 설명이 필요합니다.\n\n- 원인 칸만이라도 먼저 정리되면 회신 부탁드립니다.\n- 마감은 그대로 21:00입니다.\n\n오미래 드림 / CTO',
    },
    {
      id: 'closing', account: 'me', folder: 'inbox', from: 'mirae', to: '한도윤', at: '2026-11-16T21:10', later: true,
      subject: 'RE: [긴급] 토요일 결제 장애 원인 보고',
      body: '보고서 잘 읽었습니다. 책임자가 아니라 원인을 찾아 주셔서 고맙습니다. git-admins 그룹 정리, 온콜표 갱신, 퇴사자 계정 회수 절차를 이번 주 안에 정하겠습니다. 그리고… 은재님이 예전에 같은 이야기를 했었다는 것도 기억합니다.\n\n오미래 드림 / CTO',
    },
    {
      id: 'sec-done', account: 'me', folder: 'inbox', from: 'security', to: '한도윤', at: '2026-11-16T21:30', later: true,
      subject: '[보안] 퇴사자 계정 회수 완료 — 남은재',
      body: '한도윤님,\n남은재님 계정 회수를 마쳤습니다 (11/16 21:00).\n\n- 사내 계정(LDAP): 완료\n- 메신저: 대상 아님\n- 서버 키: 해당 없음\n\n조사 모드 세션(SEC-2211)도 종료했습니다. 수고 많으셨습니다.\n보안팀',
    },
    {
      id: 'thu', account: 'pc', folder: 'inbox', from: 'mirae', to: '박지훈', cc: '인프라팀 (남은재 외)', at: '2026-11-12T16:40',
      subject: '[중요] 월요일 파트너 데모 전 결제 지연(p99) 개선 요청',
      body: '지훈님,\n바쁘신 와중에 죄송합니다.\n\n- 월요일 10시 데모 전까지 p99 개선 부탁드립니다.\n- 방법은 맡기겠습니다. 다만 일정은 맡길 수 없습니다.\n- 진행 상황은 금요일 18:00까지 공유해 주십시오.\n\n오미래 드림 / CTO',
    },
    {
      id: 'hr', account: 'pc', folder: 'inbox', from: 'hr', to: '남은재', at: '2026-11-13T18:00',
      subject: '[인사] 퇴사 처리 완료 안내',
      body: '남은재님,\n11/13자로 퇴사 처리가 완료되었습니다. 그동안 수고 많으셨습니다.\n\n- 사내 계정·서버 계정 회수: 11/16(월) 보안팀 일정에 따라 진행\n- 장비 반납: 완료\n\n인사팀',
    },
    {
      id: 'summary', account: 'pc', folder: 'inbox', from: 'messenger', to: '남은재', at: '2026-11-15T07:00',
      subject: '[메신저] 읽지 않은 메시지 요약 (11/14 토)',
      body: '남은재님, 읽지 않은 메시지가 41개 있습니다.\n\n#장애-알림 — 알림봇 (03:17): [P1] payment-api 5xx > 20% — 확인 필요 (1/37) 외 37건\n#결제-변경 — 박지훈 (06:20): 새벽에 5xx 났었네요?? 설마 제 풀 설정은 아니겠죠 ㅋㅋㅋ\n#결제-변경 — 박지훈 (06:22): 아 서진님이 승인해주셨으니 괜찮겠네요!! 👍\n#전체 — 박지훈 (금 17:31): 선배님 ㅠㅠ 8년 고생 많으셨어요!! 🙏🙏\n\n이 메일은 알림 설정에 따라 매일 07:00에 발송됩니다. 수신 거부: 설정 > 알림',
    },
    {
      id: 'draft-seojin', account: 'pc', folder: 'drafts', from: 'eunjae', to: '강서진', at: '2026-11-13T17:48',
      subject: '서진님께',
      body: '서진님, 인수인계서에 못 쓴 게 하나 있어요. 결제 서버에 제 계정으로 도는 백업이…',
    },
    { id: 'draft-ceo', account: 'pc', folder: 'drafts', from: 'eunjae', to: '대표님', at: '2026-11-10T23:02', subject: '대표님께 — 퇴사 사유에 대해', body: '솔직히 말씀드리면' },
    ...['강서진', '강서진', '오미래', '나에게', '강서진', '오미래', '나에게', '나에게', '강서진'].map((to, i) => ({
      id: `draft-locked-${i + 1}`, account: 'pc' as const, folder: 'drafts' as const, from: 'eunjae', to, at: `2026-${String(5 + Math.floor(i / 2)).padStart(2, '0')}-${String(3 + i * 2).padStart(2, '0')}T23:${String(10 + i * 4)}`,
      subject: '(잠김)', body: '', locked: '비밀번호: 처음 맡았던 서버 이름',
    })),
  ],

  notes: [
    { id: 'today', title: '11/16 (월) 은재님 PC 정리', lines: ['미래님 메일: 오늘 21시까지 원인 보고서', '1. 무슨 일', '2. 언제', '3. 왜', '4. 누가(?)', '', '할 일: 은재님 PC 정리 / 몬스테라 물 주기 (포스트잇!)', '은재님 자리: 이번 주는 나 혼자 (11/23까지)'] },
    { id: 'farewell', title: '11/13 (금) 송별회', lines: ['은재님 송별회. 정든집 19시. 지훈님이 쏘심 🍕', '은재님: 밤에 도는 거 서진님께 꼭. (뭐였지)'], highlight: 1, reveal: '→ 알았음. 늦었음.' },
    { id: 'lunch', title: '11/10 (화) 지훈님 점심', lines: ["지훈님 아이 두 살. 강아지 이름 '버그' ㅋㅋ"] },
    { id: 'runbook', title: '11/05 (목) 서진님 런북 투어', lines: ['런북은 서진님이 다 씀. RB-001부터.', "서진님 말: '문서에 없는 건 없는 거예요.'"] },
    { id: 'ot', title: '11/02 (월) 입사 OT', lines: ['온콜 = 밤에 전화 받는 사람(?)', 'fd = 에프디(?) → 회사 이름 아님'] },
  ],

  stickies: [
    { text: '다음 분께 —\n밤에 도는 것들을\n먼저 보세요.', x: 74, y: 38, color: '#F2D94E' },
    { text: '요 몬스테라는\n월요일에 물 주세요 🌱\n— 도윤님께', x: 74, y: 57, color: '#C9E4B4' },
    { text: '보안팀: 조사 모드 (읽기 전용)\n명령 목록은 터미널에서 help', x: 74, y: 75, color: '#E8E6E1' },
  ],

  notifications: [
    { id: 'E06', at: '2026-11-14T02:01', app: '메신저', title: '강서진 · #결제-변경', text: '급한 거 아니면 월요일에 봐도 될까요' },
    { id: 'n-alert', at: '2026-11-14T03:17', app: '메신저', title: '알림봇 · #장애-알림', text: '[P1] payment-api 5xx > 20% — 확인 필요 (1/37)' },
    { id: 'n-summary', at: '2026-11-15T07:00', app: '메일', title: '메신저 알림', text: '[메신저] 읽지 않은 메시지 요약 (11/14 토)' },
  ],

  terminalTabs: [
    {
      label: 'pay-api-01', host: 'pay-api-01', cwd: '/home/eunjae', prefill: 'crontab -',
      scrollback: ['eunjae@pay-api-01:~$ 밤', '→ crontab -l; ls /etc/cron.d/', '(…)', 'eunjae@pay-api-01:~$ # 서진님께 메일. 지금.', 'eunjae@pay-api-01:~$ # 갔다 와서 마저.'],
    },
    { label: 'handover', host: 'pay-api-01', cwd: '/home/eunjae/handover', scrollback: ['[vim: 인수인계서_v4.md — 저장하지 않은 채 세션이 잠김. 스왑 파일 .인수인계서_v4.md.swp 남음]'] },
    { label: 'bastion', host: 'bastion', cwd: '/home/eunjae' },
    { label: 'pay-cfg', host: 'pay-cfg', cwd: '/home/eunjae' },
    { label: 'review-web', host: 'review-web', cwd: '/home/eunjae' },
  ],

  // the departed senior left 14 tabs open; these remote sessions are gone
  deadTabs: ['pay-api-02', 'backup?', 'logs', 'db-ro', 'wiki', 'tmp', 'scratch', 'old', 'memo'],

  dashboard: [
    '결제 API — 대시보드 스냅샷 (토 11/14 02:00 ~ 07:00, 1분 간격, 보안팀 보관본)',
    '',
    '5xx 비율 (%)',
    ' 50 ┤',
    ' 40 ┤              ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' 30 ┤             █████████████████████████████████████▌',
    ' 20 ┤╌╌╌╌╌╌╌╌╌╌╌╌╌█████████████████████████████████████▌╌╌╌╌╌ 알림 기준 20%',
    ' 10 ┤             █████████████████████████████████████▌',
    '  0 ┼▁▁▁▁▁▁▁▁▁▁▁▁▁█████████████████████████████████████▌▁▁▁▁▁▁▁▁',
    '    02:00     03:15                                05:40     07:00',
    '',
    '열린 파일 수 (open_fds / 한도 4096)',
    '4096 ┤             ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '3000 ┤             █',
    '1947 ┤▆▆▆▆▆▆▆▆▆▆▆▆▆█                                      ▆▆▆▆▆▆▆▆',
    '   0 ┼──────────────────────────────────────────────────────────',
    '     02:00     03:15                                05:40     07:00',
    '',
    '디스크 /: 42%   메모리: 2.1/7.7 GiB   CPU: 18%   재시작 횟수: 0',
    '온콜 호출: 37건 → 수신자 남은재 (2순위)   확인(ack): 0건',
  ],

  // the same snapshot as structured panels (drawn by the dashboard app; pins appear as annotations)
  panels: {
    title: '결제 API · pay-api-01',
    from: '2026-11-14T02:00',
    to: '2026-11-14T07:00',
    stepMin: 1,
    live: true,
    marks: ['2026-11-14T03:15', '2026-11-14T05:40'],
    stats: [
      { title: '디스크 /', value: '42%', state: 'ok' },
      { title: '메모리', value: '2.1 / 7.7 GiB', state: 'ok' },
      { title: 'CPU', value: '18%', state: 'ok' },
      { title: '재시작 횟수', value: '0', state: 'ok' },
      { title: '온콜 호출', value: '37건', state: 'crit', note: '수신자 남은재 (2순위)' },
      { title: '확인 (ack)', value: '0건', state: 'crit' },
    ],
    timeseries: [
      {
        id: 'err', title: '5xx 비율 (%)', unit: '%', min: 0, max: 50,
        thresholds: [{ value: 20, label: '알림 기준 20%' }],
        series: [{ name: '5xx', color: 'yellow', jitter: 0.05, points: [['2026-11-14T02:00', 0.3], ['2026-11-14T03:15', 8], ['2026-11-14T03:16', 41.7], ['2026-11-14T05:40', 0.2]] }],
      },
      {
        id: 'fds', title: '열린 파일 수 (open_fds / 한도 4096)', min: 0, max: 4400,
        thresholds: [{ value: 4096, label: '한도 4096' }],
        series: [{ name: 'open_fds', color: 'blue', points: [['2026-11-14T02:00', 1947], ['2026-11-14T03:15', 3000], ['2026-11-14T03:16', 4096], ['2026-11-14T05:40', 1947]] }],
      },
    ],
  },

  // ------------------------------------------------------------------ clues
  clues: [
    { id: 'c_emfile', label: 'journalctl: 03:15:40 "too many open files"', slot: 'cause', key: true, match: [{ output: 'too many open files', host: 'pay-api-01' }] },
    { id: 'c_disk_ok', label: 'df -h: 디스크는 정상(42%)', slot: 'cause', match: [{ output: '/dev/sda1\\s+98G.*42%' }] },
    { id: 'c_cron_journal', label: 'journalctl -u cron: 매주 토 03:15 eunjae의 백업', slot: 'cause', match: [{ output: 'CRON\\[\\d+\\]: \\(eunjae\\) CMD' }] },
    { id: 'c_export', label: '저널: 03:15:02 export 시작, 2,314 파일 열림', slot: 'cause', match: [{ output: 'export: (started by eunjae|opened 2,314)' }] },
    { id: 'c_cron', label: 'crontab -l: 15 3 * * 6 ledger-backup.sh (+ 은재의 주석)', slot: 'cause', key: true, trace: true, aha: '15 3 * * 6 — 밤에 도는 것. 토요일 03:15.', match: [{ output: '15 3 \\* \\* 6 /home/eunjae/bin/ledger-backup\\.sh' }] },
    { id: 'c_limit', label: 'LimitNOFILE=4096 (서비스의 열린 파일 한도)', slot: 'cause', key: true, match: [{ output: '^LimitNOFILE=4096|Max open files\\s+4096|process_max_fds 4096' }] },
    { id: 'c_fds', label: '지금 열린 fd 1,947개 (풀 상향 뒤)', slot: 'cause', key: true, match: [{ output: '^\\s*1947\\s*$|process_open_fds 1947|open_fds=1947/4096' }] },
    { id: 'c_backup_files', label: 'backup.log: 백업이 원장 파일 2,3xx개를 연다', slot: 'cause', key: true, match: [{ output: 'opened 2,3\\d\\d segment files|opened 2,2\\d\\d segment files' }] },
    { id: 'c_thin_margin', label: '11/07 백업 때도 3,712/4,096 — 원래 여유가 얇았다', slot: 'cause', match: [{ output: 'open_fds=3712/4096' }] },
    { id: 'c_history', label: '은재 history 4984–4990: 퇴사일 오후의 확인 다섯 줄', slot: 'cause', trace: true, match: [{ output: '^\\s*4990\\s.*LimitNOFILE은 내 맘대로' }, { output: '^\\s*4986\\s.*fds\\s*$' }] },
    { id: 'c_aliases', label: '~/.bashrc 별칭: 밤, fds', slot: 'cause', trace: true, match: [{ output: "alias 밤='crontab -l" }] },
    { id: 'c_swap', label: 'vim 스왑 파일: "03:15에 원장 백업이 돌아요…"', slot: 'cause', trace: true, match: [{ output: '03:15에 원장 백업이 돌아요' }] },
    { id: 'c_todo', label: 'TODO: 결제 서버 내 crontab → 서진님께 설명', slot: 'cause', trace: true, match: [{ output: '결제 서버 내 crontab → 서진님께' }, { output: '결제 서버 개인 crontab 정리' }] },
    { id: 'c_e05', label: 'DM 22:15 은재: "밤에 도는 거."', slot: 'cause', trace: true, match: [{ open: 'msg:E05' }] },
    { id: 'c_memo', label: '도윤 메모: "밤에 도는 거 서진님께 꼭. (뭐였지)"', slot: 'cause', trace: true, match: [{ open: 'note:farewell' }] },
    { id: 'c_draft', label: '메일 초안 17:48: "제 계정으로 도는 백업이…"', slot: 'cause', trace: true, match: [{ open: 'mail:draft-seojin' }] },

    { id: 's_commit', label: 'git: 금 18:02:11 jhpark "커넥션 풀 상향(리뷰: 강서진)", 트레일러 없음', slot: 'sequence', key: true, match: [{ output: 'Date:\\s+Fri Nov 13 18:02:11 2026' }, { output: '9f3c2e1.*커넥션 풀 상향' }] },
    { id: 's_deploy', label: '저널: 18:05 설정 반영 db.max_connections 50 -> 200', slot: 'sequence', match: [{ output: 'max_connections 50 -> 200' }, { output: '-\\s+max_connections: 50' }] },
    { id: 's_last', label: 'bastion last: sjkang vpn 토 02:05–02:14', slot: 'sequence', key: true, match: [{ output: 'sjkang\\s+pts/1\\s+vpn-10\\.8\\.3\\.41\\s+Sat Nov 14 02:05' }, { output: 'Accepted publickey for sjkang from 10\\.8\\.3\\.41' }] },
    { id: 's_approve', label: 'access.log: 02:10:03 GET → 02:10:07 approve (코멘트 없이 4초)', slot: 'sequence', key: true, match: [{ output: '14/Nov/2026:02:10:07.*POST /review/412/approve' }] },
    { id: 's_revert', label: 'git: 02:11 revert-pool-bump 브랜치 (되돌리려 했다)', slot: 'sequence', key: true, match: [{ output: 'revert-pool-bump' }] },
    { id: 's_sj_history', label: '서진 history 2213–2219: 되돌리기 → LimitNOFILE 직전에 끊김', slot: 'sequence', trace: true, match: [{ output: "ssh pay-api-01 'systemctl show payment-api -p LimitNOFILE'" }] },
    { id: 's_notif', label: '알림 센터: 02:01 서진 "급한 거 아니면 월요일에…" (02:12 삭제)', slot: 'sequence', key: true, match: [{ open: 'notif:E06' }] },
    { id: 's_summary', label: '요약 메일: 지워진 06:20·06:22 지훈 메시지 원문', slot: 'sequence', key: true, match: [{ open: 'mail:summary' }] },
    { id: 's_alerts', label: '#장애-알림: 알림 37건이 퇴사자(온콜 2순위)에게', slot: 'sequence', match: [{ open: 'channel:alerts' }] },
    { id: 's_vacation', label: '서진 메모: "온콜 2순위 수정: 11/17 반영 예정"', slot: 'sequence', trace: true, match: [{ output: '온콜 2순위 수정: 11/17 반영 예정' }] },

    { id: 'r_group', label: 'getent: git-admins:x:1050:eunjae,jhpark', slot: 'responsibility', key: true, match: [{ output: 'git-admins:x:1050:eunjae,jhpark' }] },
    { id: 'r_hook', label: 'pre-receive: git-admins는 리뷰 검사를 건너뛴다', slot: 'responsibility', key: true, match: [{ output: 'grep -qw git-admins && exit 0' }] },
    { id: 'r_jh_history', label: '지훈 history 879–885: 트레일러 없는 커밋, 월요일의 "# 아..."', slot: 'responsibility', trace: true, match: [{ output: "^git commit -am '커넥션 풀 상향" }, { output: '^# 아\\.\\.\\.$' }] },
    { id: 'r_todo_ceo', label: '은재 TODO: git-admins 정리 — "대표님께 세 번 말함"', slot: 'responsibility', trace: true, match: [{ output: '대표님께 세 번 말함' }] },
    { id: 'r_account', label: '인사 메일: 퇴사자 계정 회수는 월요일 예정', slot: 'responsibility', match: [{ open: 'mail:hr' }] },
    { id: 'r_p99', label: '지훈 메모: "리스크: 없음(?) / nofile? 이거 뭐였지"', slot: 'responsibility', match: [{ output: 'nofile\\? 이거 뭐였지' }] },
  ],

  // ------------------------------------------------------------------ accusation
  accusation: {
    maxSubmissions: 3,
    // options are hypotheses of the same length and grain; the pinned evidence decides.
    // Red herrings that name a found fact (the 18:02 commit, the 02:10 approval) wait for it.
    slots: [
      {
        id: 'cause',
        title: '원인 (기술)',
        prompt: '토요일 03:15~05:40, 결제 API는 왜 5xx를 냈나?',
        type: 'single',
        options: [
          { id: 'disk', text: '토요일 새벽 결제 API 서버의 디스크가 가득 차서, 요청을 처리하며 쓰는 임시 파일과 로그를 만들지 못했다' },
          { id: 'pool-only', blames: 'jihoon', needs: ['s_commit'], text: '금요일 18:02 커넥션 풀을 키운 변경 하나만으로 DB 가 받을 수 있는 연결 수를 넘어, 새 연결이 모두 거절됐다' },
          { id: 'fd', correct: true, text: '금요일 변경으로 늘어난 연결과 새벽 작업이 같은 프로세스에서 연 파일이 겹쳐, 열 수 있는 파일 수 한도를 넘었다' },
          { id: 'approve', blames: 'seojin', needs: ['s_approve'], text: '토요일 새벽 강서진의 승인이 잘못된 설정을 새로 배포했고, 그 설정이 03:15 부터 결제 요청을 실패시켰다' },
          { id: 'db-limit', text: 'DB 서버의 연결 한도가 낮게 잡혀 있어서, 새벽 트래픽이 몰리자 결제 API 가 여는 새 DB 연결이 모두 거절됐다' },
          { id: 'oom', text: '메모리가 서서히 새다가 새벽에 바닥나서, 커널이 결제 API 를 강제로 종료하고 재시작이 계속 반복됐다' },
        ],
        evidence: [
          { id: 'limits', label: '자원 한도 · 사용량 수치', clues: ['c_limit', 'c_fds', 'c_thin_margin'] },
          { id: 'errors', label: '장애 시각의 오류 로그', clues: ['c_emfile'] },
          { id: 'jobs', label: '예약 · 작업 기록', clues: ['c_cron', 'c_cron_journal', 'c_export', 'c_backup_files'] },
        ],
      },
      {
        id: 'sequence',
        title: '경위 (타임라인)',
        prompt: '금요일 저녁부터 토요일 새벽까지, 무슨 순서로 일어났나?',
        type: 'single',
        options: [
          { id: 'true', correct: true, text: '금요일 18:02 변경이 리뷰 없이 반영됐고, 토요일 03:15 시작된 작업이 그 위에 겹쳐 장애가 났다가 05:40 작업이 끝나며 복구됐다' },
          { id: 'from-1805', text: '금요일 18:02 변경이 반영된 직후부터 5xx 가 조금씩 나기 시작했고, 밤새 점점 늘어나다가 05:40 누군가 설정을 되돌리면서 겨우 복구됐다' },
          { id: 'sneaky', blames: 'seojin', needs: ['s_approve'], text: '토요일 새벽 강서진이 승인하면서 다른 설정까지 몰래 배포했고, 03:15 부터 그 설정 때문에 장애가 났다가 05:40 에 되돌려졌다' },
          { id: 'cron-only', text: '토요일 03:15 시작된 작업 하나가 금요일 변경과는 전혀 상관없이 단독으로 장애를 냈고, 05:40 온콜이 그 작업을 멈춰서 복구됐다' },
        ],
        evidence: [
          { id: 'changes', label: '변경 기록 (커밋 · 배포)', clues: ['s_commit', 's_deploy', 's_revert'] },
          { id: 'access', label: '접속 · 승인 기록', clues: ['s_last', 's_approve', 's_sj_history'] },
          { id: 'messages', label: '메시지 · 알림 기록', clues: ['s_notif', 's_summary', 's_alerts'] },
          { id: 'jobs', label: '예약 · 작업 기록', clues: ['c_cron', 'c_cron_journal', 'c_export', 'c_emfile'] },
        ],
      },
      {
        id: 'responsibility',
        title: '책임·은폐 (무엇이 가능하게 했나)',
        prompt: '보고서의 이 칸에 무엇을 쓸까? 가장 크게 작용한 4개를 고르세요.',
        type: 'multi',
        // exactly four (docs/case-format.md §8): any four factors pass, the best four (70) make 100
        picks: 4,
        options: [
          { id: 'git-admins', weight: 20, text: '긴급 대응 때 준 리뷰 우회 권한이 그 뒤로 회수되지 않아, 리뷰 없는 반영을 아무것도 막지 못했다' },
          { id: 'cron', weight: 20, text: '문서 · 런북에 없는 개인 예약 작업이 결제 서버에서 몇 년째 돌고 있었고, 아무도 그걸 몰랐다' },
          { id: 'oncall', weight: 15, text: '온콜 연락 순서가 사람이 바뀐 뒤에도 갱신되지 않아, 장애 알림이 받을 사람에게 닿지 않았다' },
          { id: 'account', weight: 15, text: '퇴사자 계정이 퇴사 뒤에도 회수되지 않아, 그 계정으로 걸어 둔 작업이 그대로 계속 돌았다' },
          { id: 'bottleneck', weight: 10, text: '리뷰가 한 사람에게 몰린 병목과 일정 압박 때문에, 리뷰보다 반영이 먼저 되는 일이 생겼다' },
          { id: 'cover-seojin', weight: 10, text: '은폐: 강서진이 토요일 새벽에 보낸 자기 메시지를 나중에 지워, 그 시각의 일이 가려졌다' },
          { id: 'cover-jihoon', weight: 10, text: '은폐: 박지훈이 토요일 아침 보낸 자기 메시지 두 개를 월요일에 지워, 그 내용이 가려졌다' },
          { id: 'blame-jihoon', weight: -40, blames: 'jihoon', needs: ['s_commit'], text: '박지훈이 범인이다 — 금요일 18:02 변경을 직접 올린 사람이니, 운영 권한을 회수하고 징계해야 한다' },
          { id: 'blame-seojin', weight: -40, blames: 'seojin', needs: ['s_approve'], text: '강서진이 범인이다 — 휴가 중 새벽에 확인도 없이 승인했으니, 승인 권한을 회수하고 징계해야 한다' },
          { id: 'blame-eunjae', weight: -40, blames: 'eunjae', text: '남은재가 범인이다 — 퇴사하면서 자기 계정에 걸린 작업을 정리하지 않고 떠났으니, 책임을 물어야 한다' },
        ],
        evidence: [
          { id: 'perms', label: '권한 · 그룹 설정', clues: ['r_group', 'r_hook'] },
          { id: 'notes', label: '사람이 남긴 메모 · 기록', clues: ['r_jh_history', 'r_todo_ceo', 'r_p99', 'r_account', 's_vacation', 'c_todo'] },
          { id: 'jobs', label: '예약 · 작업 기록', clues: ['c_cron', 'c_cron_journal'] },
          { id: 'messages', label: '메시지 · 알림 기록', clues: ['s_alerts', 's_notif', 's_summary'] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ hints (rung 2 voices: characters.md §5(i) "2단계 넛지")
  hints: {
    idleMinutes: 6,
    idle: [
      { id: 'idle-1', from: 'jihoon', channel: 'me-dm-jihoon', unlessClues: ['c_cron'], text: '도윤님 ㅋㅋ 아직 보고서 중?? 은재 선배는 뭐든 자기 홈에 넣어 두는 스타일이었어요~ history 같은 거 한번 봐요!! 🙏', askText: '음 ㅋㅋ 은재 선배는 뭐든 자기 홈에 넣어 두는 스타일이었어요~ history 같은 거 한번 봐요!! 🙏' },
      { id: 'idle-2', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c_cron'], text: '로그 봤어요. 03:15부터. 그 시각에 뭐가 시작됐는지 보세요.' },
      { id: 'idle-3', from: 'jihoon', channel: 'me-dm-jihoon', unlessClues: ['c_cron'], text: '아 근데 은재 선배 금요일에 터미널 탭 그대로 두고 가셨잖아요 ㅋㅋ 마지막 탭 한번 봐요~ 뭐 치다 마신 거 같던데!!', askText: '아 은재 선배 금요일에 터미널 탭 그대로 두고 가셨잖아요 ㅋㅋ 마지막 탭 한번 봐요~ 뭐 치다 마신 거 같던데!!' },
      { id: 'idle-4', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['c_limit', 'c_fds'], text: '음. 풀 크기 올리면 fd도 같이 봐야 해요. LimitNOFILE 확인 부탁해요.' },
    ],
    wrong: {
      seojin: { id: 'wrong-seojin', from: 'seojin', channel: 'me-dm-seojin', text: '음. 사람 말고 시간부터요. 03:15에 뭐가 시작됐는지.' },
      jihoon: { id: 'wrong-jihoon', from: 'jihoon', channel: 'me-dm-jihoon', text: '제 설정이 문제였으면 18:05부터 났어야 하지 않아요?? 03:15에 뭐가 있었는지 봐 주세요.' },
      eunjae: { id: 'wrong-eunjae', from: 'seojin', channel: 'me-dm-seojin', text: '선배는 퇴사했어요. 그 cron이 왜 아직 돌 수 있었는지가 질문이에요.' },
      default: { id: 'wrong-default', from: 'jihoon', channel: 'me-dm-jihoon', text: '도윤님 ㅋㅋ 미래님 메일은 무섭지만… 사람 이름보다 로그 시각부터 맞춰 보는 거 어때요~? 🙏' },
    },
    // 💡 정답: the specifics behind the correct option (the options themselves stay hypotheses)
    answers: {
      cause: '풀 상향으로 늘어난 소켓 + 토 03:15 백업 cron이 API 안에서 연 원장 파일이 합쳐져, 프로세스의 열린 파일 한도(LimitNOFILE 4096)를 넘었다',
      sequence: '금 18:02 리뷰 없이 푸시(18:05 반영) → 토 02:05 서진 VPN, 02:10 코멘트 없는 승인, 02:11 되돌리기 브랜치, 02:14 끊김 → 03:15 백업 cron, 03:15:40 fd 한도 초과 → 알림 37건이 퇴사자(2순위)에게 → 05:40 백업이 끝나며 자연 복구',
      responsibility: 'git-admins 그룹(eunjae, jhpark)은 pre-receive 의 리뷰 검사를 건너뛴다 · 은재의 개인 crontab 15 3 * * 6 ledger-backup.sh 가 4년째 · 온콜 2순위가 퇴사자로 남아 알림 37건이 닿지 않음 (11/17 수정 예정) · 퇴사자 계정 회수는 월요일 예정 · 리뷰어 한 명(강서진)과 월요일 데모 압박 · 서진의 02:01 메시지는 02:12 삭제, 지훈의 06:20·06:22 메시지는 월요일 08:40 삭제',
    },
    // 💡 panel "방향" lines: the first one whose clues are not all found is offered next.
    // 요약 is generated from found clues; 정답 defaults to the correct option(s). Costs apply in senior mode only.
    explicit: [
      {
        slot: 'cause', cost: 10, unlessClues: ['c_cron'],
        text: '03:15에 무엇이 시작됐는지 보세요: pay-api-01 탭에서 journalctl -u cron, 그리고 crontab -l → 03:15 에 도는 줄을 📌 (근거: 예약 · 작업 기록).',
        compare: '그 줄의 시간 필드(분 시 일 월 요일)를 읽어, 5xx 가 시작된 시각과 끝난 시각(대시보드 5xx 패널)과 나란히 놓으세요.',
      },
      {
        slot: 'cause', cost: 10, unlessClues: ['c_history'],
        text: '은재님 history의 4984~4990, 퇴사일 오후 다섯 줄을 그대로 다시 쳐 보세요.',
        compare: '은재님이 그 다섯 줄로 확인하던 숫자 두 개를 적고, 서로 비교해 보세요. 마지막 # 줄이 무엇을 걱정하나요?',
      },
      {
        slot: 'cause', cost: 10, unlessClues: ['c_emfile'],
        text: 'pay-api-01 에서 journalctl -u payment-api --since "2026-11-14 03:10" — 03:15 이후 첫 오류 줄을 📌 (근거: 장애 시각의 오류 로그).',
        compare: '오류 줄 끝의 문구를 보기 여섯 개에 대 보세요. 디스크가 찼다면, 메모리가 바닥났다면, DB 가 연결을 거절했다면 각각 어떤 문구가 찍혔을까요? (df -h 와 대시보드 메모리 숫자도 같이)',
      },
      {
        slot: 'cause', cost: 10, unlessClues: ['c_fds', 'c_limit', 'c_backup_files'],
        text: '자원 한도: systemctl show payment-api -p LimitNOFILE, 지금 열린 fd 수(별칭 fds), 백업이 여는 파일 수(tail ~/log/backup.log) → 📌 (근거: 자원 한도 · 사용량 수치).',
        compare: '지금 열린 fd 수 + 백업이 여는 파일 수를 더해 LimitNOFILE 4096과 비교해 보세요. 금요일 변경 전 fd 수였다면 넘었을까요? 대시보드의 열린 파일 수 패널도 같은 이야기예요.',
      },
      {
        slot: 'sequence', cost: 10, unlessClues: ['s_commit', 's_revert'],
        text: 'pay-cfg 탭에서 cd /srv/git/pay-config.git 후 git log --format=fuller, git branch -a → 금요일 커밋 줄을 📌 (근거: 변경 기록).',
        compare: '커밋 시각(금 18:02)과 5xx 가 처음 난 시각을 나란히 놓으세요. 변경 직후부터 났나요, 몇 시간 뒤에 났나요? 그 사이에 시작된 다른 것이 있나요?',
      },
      {
        slot: 'sequence', cost: 10, unlessClues: ['s_last', 's_approve'],
        text: 'bastion 탭에서 last, review-web 탭에서 grep sjkang /var/log/nginx/access.log | tail → 승인 줄을 📌 (근거: 접속 · 승인 기록).',
        compare: '승인 시각과 접속 시각, 그리고 5xx 가 시작된 03:15 를 나란히: 승인이 새 배포를 했다면 저널에 배포 줄이 있어야 해요. 있나요?',
      },
      {
        slot: 'sequence', cost: 10, unlessClues: ['s_notif', 's_summary'],
        text: '지워진 메시지 원문은 알림 센터(작업 표시줄 🔔)와 은재님 메일함의 "읽지 않은 메시지 요약"에 남아 있어요. 각각 📌 (근거: 메시지 · 알림 기록).',
        compare: '지워진 메시지가 쓰인 시각과 지워진 시각을 적어, 장애 시각(03:15~05:40)의 앞인지 뒤인지 보세요.',
      },
      {
        slot: 'responsibility', cost: 10, unlessClues: ['r_group', 'r_hook'],
        text: 'pay-cfg에서 getent group git-admins 와 cat /srv/git/pay-config.git/hooks/pre-receive 를 같이 보세요. 둘 다 📌 (근거: 권한 · 그룹 설정).',
        compare: '그룹 명단과 훅의 "건너뛰기" 줄을 나란히: 누가 리뷰 없이 반영할 수 있었나요? 그 권한은 언제, 왜 생겼나요? (은재님 TODO)',
      },
      {
        slot: 'responsibility', cost: 10, unlessClues: ['s_vacation'],
        text: '알림 37건은 왜 퇴사자에게 갔을까요? bastion 탭에서 sudo ls /home/sjkang → 서진님 휴가 인수인계 메모를 sudo cat 으로 열어 📌 (근거: 사람이 남긴 메모 · 기록).',
        compare: '#장애-알림의 수신자와 메모의 "온콜 2순위 수정" 날짜를 나란히 놓으세요. 장애 날짜보다 앞인가요, 뒤인가요?',
      },
      { slot: 'responsibility', cost: 10, text: '이 칸은 "누가"가 아니라 "무엇이 그걸 가능하게 했나"입니다. 사람을 범인으로 고르면 틀린 칸이 돼요.' },
    ],
    // "뭐부터 봐요?" / "막혔어요": the next idle nudge right away, from whoever sends it
    ask: {
      prompts: ['뭐부터 봐요?', '막혔어요'],
      none: { from: 'jihoon', channel: 'me-dm-jihoon', text: 'ㅋㅋ 저도 이제 아는 게 없어요… 💡 힌트 패널 한번 봐요!! 🙏' },
    },
  },

  // ------------------------------------------------------------------ live events
  triggers: [
    {
      id: 'E10',
      when: { clue: 'c_emfile' },
      actions: [
        { message: { channel: 'me-dm-seojin', from: 'doyun', delaySec: 4, text: '서진님 휴가 중에 죄송해요. 미래님이 토요일 장애 보고서를 요청하셔서요. 혹시 03:15쯤 결제 서버에서 도는 게 있는지 아실까요?' } },
        { message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 20, text: '없어요. 런북에 없으면 없는 거예요.' } },
      ],
    },
    {
      id: 'memo-reveal',
      when: { clue: 'c_cron' },
      actions: [{ note: 'farewell' }, { toast: '메모장이 저절로 넘어간다 — 11/13 (금) 송별회: "밤에 도는 거 서진님께 꼭. (뭐였지)"' }],
    },
    {
      id: 'jihoon-confess',
      when: { allClues: ['r_group', 'r_hook'] },
      actions: [
        { message: { channel: 'me-dm-jihoon', from: 'doyun', delaySec: 2, text: '지훈님 혹시… 금요일 18시쯤 올리신 설정 말인데요, 리뷰는 언제 받으셨는지 여쭤봐도 될까요? git-admins 그룹이랑 pre-receive 훅도 봤어요.' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 14, text: '확인했습니다.' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 17, text: '리뷰 오기 전에 푸시했습니다. git-admins라서 훅이 안 막습니다. 몇 달 됐습니다. 죄송합니다.' } },
      ],
    },
    {
      id: 'seojin-confess',
      when: { allClues: ['s_approve', 's_revert'] },
      actions: [
        { message: { channel: 'me-dm-seojin', from: 'doyun', delaySec: 2, text: '서진님, 혼내시려는 거 아니에요. 02:11에 revert 브랜치 만드신 거 봤어요. 되돌리려고 하셨던 거죠?' } },
        { message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 18, text: '맞아요. 접속했어요. 정리해서 말할게요.\n- 01:58 알림 확인\n- 02:03 머지 확인\n- 02:05 VPN\n- 02:10 승인 — 의도 아님\n- 02:14 끊김\n휴가 중에 일한 건 제 약속 위반이에요.' } },
      ],
    },
    {
      id: 'seojin-runbook',
      when: { allClues: ['c_cron', 's_revert'] },
      actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 25, text: '그 cron은 몰랐어요. 런북에 없었으니까. …제가 쓴 런북에.' } }],
    },
    {
      // written, then deleted (characters.md §8-1: under pressure he laughs "ㅋㅋ 설마", then deletes)
      id: 'jihoon-unsend',
      when: { clue: 's_commit' },
      actions: [
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 6, deleteAfterSec: 3, text: 'ㅋㅋ 설마 제 커밋 보시는 거예요??' } },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 13, text: '아 아니에요 ㅋㅋ 도윤님 화이팅!! 👍' } },
      ],
    },
    { id: 'pressure-mail', when: { afterMin: 30 }, actions: [{ mail: 'pressure' }, { toast: '새 메일: RE: [긴급] 토요일 결제 장애 원인 보고' }] },
  ],

  // ------------------------------------------------------------------ debrief
  // ------------------------------------------------------------------ last scene (docs/case-format.md §15)
  // the farewell memo first ("→ 알았음. 늦었음."), 오미래's reply, 서진's thanks, 도윤 waters the plant (물주기, the
  // alias 은재 left), and the security team's mail that seeds Case 4: "서버 키: 해당 없음"
  ending: {
    beats: [
      { wait: 0, note: 'farewell' },
      { wait: 3, mail: 'closing' },
      { wait: 6, message: { channel: 'me-dm-seojin', from: 'seojin', text: '도윤님. 오늘 고마웠어요.' } },
      { wait: 3, act: { tab: 0, prefill: '물주기', until: '^물주기$', timeoutSec: 25, sticky: 1, note: { id: 'today', line: '{hm} 몬스테라 물 줌 🌱' } } },
      { wait: 3, mail: 'sec-done' },
    ],
  },

  debrief: {
    headline: '범인은 한 사람이 아니었다. 시스템이었다.',
    story: [
      { at: '목 16:40', text: '오미래의 메일 "월요일 데모 전까지 p99 개선". 방법은 맡기지만 일정은 맡길 수 없다.' },
      { at: '금 17:48', text: '남은재가 서진에게 메일을 쓰다 멈춘다. "결제 서버에 제 계정으로 도는 백업이…" 17:52, 지훈이 송별회로 데려간다.' },
      { at: '금 18:02', text: '박지훈이 커넥션 풀 50→200을 푸시. "(리뷰: 강서진)"은 미리 써 둔 말이었고, git-admins 그룹이라 pre-receive 훅이 막지 않았다. 18:05 반영.' },
      { at: '금 22:15', text: '은재가 도윤에게: "월요일에 서진님께 그거 꼭요. 밤에 도는 거." 도윤은 메모했지만 그게 cron인지 몰랐다.' },
      { at: '토 02:01–02:14', text: '휴가 중인 서진이 알림을 보고 VPN 접속. 좁은 창에서 되돌리려다 4초 만에 "승인"을 눌렀다. 02:11 revert 브랜치를 만들고, LimitNOFILE을 확인하려던 순간 VPN이 끊겼다. 02:12 메시지를 지웠다.' },
      { at: '토 03:15', text: '은재 계정의 crontab(15 3 * * 6)이 백업을 시작. 결제 API가 원장 파일 2,314개를 프로세스 안에서 연다. 1,947 + 2,314 > 4,096.' },
      { at: '토 03:15:40', text: '"accept4: too many open files". 새 연결도, DB 소켓도 열 수 없다. 03:17부터 5xx 41%.' },
      { at: '토 03:17–05:41', text: '알림 37건이 온콜 2순위 "남은재"에게 갔다. 퇴사 다음 날이었다. 확인한 사람은 없었다.' },
      { at: '토 05:40', text: '백업이 끝나 파일을 닫자 저절로 복구. 풀 상향 전에도 3,712/4,096 — 여유는 원래 얇았다.' },
      { at: '월 08:40', text: '지훈이 06:20·06:22 메시지를 지웠다. 승인(02:10)이 자기 푸시(18:02)보다 8시간 늦다는 걸 깨달은 뒤였다.' },
    ],
    systemFactors: [
      '리뷰 검사를 건너뛰는 git-admins 그룹 — 긴급 대응 뒤 회수되지 않음 (만든 사람도 은재, 세 번 회수를 건의함)',
      '문서·런북에 없는 개인 crontab — 퇴사자 계정으로 결제 서버에서 계속 실행',
      '갱신되지 않은 온콜표 — 2순위가 퇴사자',
      '회수되지 않은 퇴사자 계정 — 그래서 cron도 돌았고, 그래서 증거도 남았다',
      '리뷰어 한 명 병목 + 데모 일정 압박 + 휴가 중에도 꺼지지 않는 "결제" 알림 예외',
      '인수인계가 송별회 술자리에서 신입에게 구두로 이뤄졌다',
    ],
    principle: '프로세스마다 열 수 있는 파일 수에는 한도가 있고, 네트워크 소켓도 파일이다. 한도 근처에서 도는 시스템은 "작은 변경" 하나와 "밤에 도는 것" 하나가 겹칠 때 무너진다.',
    cards: [
      { title: '서비스의 fd 한도 확인', cmd: 'systemctl show payment-api -p LimitNOFILE', explain: 'systemd가 서비스에 준 한도(여기선 4096, cat /proc/<PID>/limits 의 Max open files 와 같다). 터미널에서 ulimit -n 을 치면 나오는 셸의 한도(여기선 1024)와는 다르다 — 서비스 한도는 유닛 파일이 정한다.' },
      { title: '실제 프로세스가 받은 한도', cmd: "cat /proc/$(pgrep -f payment-api)/limits | grep 'open files'", explain: '설정 파일이 아니라 지금 떠 있는 프로세스가 실제로 받은 값. 재시작 전 설정 변경은 반영 안 됐을 수 있다.' },
      { title: '지금 몇 개 열려 있나', cmd: 'ls /proc/<PID>/fd | wc -l   # 또는 lsof -p <PID> | wc -l', explain: '한도 대비 현재 사용량. 평소 값과 피크 값을 둘 다 알아야 "여유"가 보인다.' },
      { title: '소켓도 파일이다', cmd: 'ss -s   ·   sudo ss -tanp | grep payment', explain: 'DB 커넥션 풀을 키우면 열린 파일도 그만큼 는다. 풀 변경 리뷰에는 fd 계산이 같이 가야 한다.' },
      { title: '밤에 도는 것 전부 찾기', cmd: 'for u in $(cut -d: -f1 /etc/passwd); do sudo crontab -l -u "$u" 2>/dev/null | sed "s/^/$u: /"; done; ls /etc/cron.d; systemctl list-timers', explain: '사용자별 crontab, /etc/cron.d, systemd 타이머 — 세 군데를 다 봐야 한다. 퇴사자 계정도 포함.' },
      { title: '로그는 시각부터', cmd: 'journalctl -u payment-api --since "2026-11-14 03:00" --until "2026-11-14 03:30" -p err', explain: '사람보다 시간. 장애 시작 시각에 "무엇이 시작됐나"를 cron 로그(journalctl -u cron)와 나란히 본다.' },
      { title: '변경의 진짜 시각과 리뷰', cmd: 'git log --format=fuller -1   ·   getent group git-admins   ·   cat hooks/pre-receive', explain: '작성 시각, 반영 시각, 리뷰 트레일러, 그리고 검사를 건너뛸 수 있는 사람이 누구인지.' },
    ],
    closingMail: 'closing',
    doyunLine: "보고서에 '누가'는 안 쓰기로 했어요. 대신 '무엇이 그걸 가능하게 했나'를 다섯 줄 썼어요.",
    cast: [
      { who: 'doyun', text: '송별회 밤의 부탁을 메모만 해 두고 잊었다. 답은 처음부터 자기 메모장에 있었다. 3주차가 "밤에 도는 것"에서 crontab을 떠올릴 수는 없다.' },
      { who: 'seojin', text: '되돌리려고 접속했다가 좁은 창에서 승인을 눌렀다. 휴가 중 접속 약속을 어긴 것과 함께 메시지를 지웠다. "그 cron은 몰랐어요. …제가 쓴 런북에."' },
      { who: 'jihoon', text: '데모 압박 속에서 몇 달째 git-admins로 리뷰를 건너뛰었다. 악의가 아니라 부끄러움과 겁으로 메시지를 지웠다. "확인했습니다." "죄송합니다."' },
      { who: 'eunjae', text: '아무것도 숨기지 않았다. 말하려던 것을 끝내 보내지 못했을 뿐이다. 17:48의 초안은 아직 임시보관함에 있다.' },
    ],
  },

  goal: { intro: '오미래 CTO 에게 오늘 21:00까지 보낼 원인 보고서. 세 칸을 채우면 사건이 끝나요. 제출은 3번까지, 틀리면 칸마다 ✓/✗ 로 알려 줘요.' },

  // ------------------------------------------------------------------ opening (first 3 minutes)
  // Briefing = 지훈's Monday-morning voice message (voice: characters.md §4(d) / §8-1: short bursts,
  // 해요체 + 물결, ㅋㅋ, no full stops; under pressure he laughs: "설마"). 오미래 appears by mail only.
  opening: {
    briefing: {
      lockTime: '09:00',
      lockDate: '11월 16일 월요일',
      caller: 'jihoon',
      kind: 'voice',
      voiceCue: 'voice.briefing-jihun',
      lines: [
        { text: '도윤님~ 굿모닝요!! 지훈이에요 ㅋㅋ', pauseMs: 1000 },
        { text: '은재 선배님 금요일에 퇴사하셨잖아요… 그 PC 오늘부터 도윤님이 받아요', pauseMs: 1300 },
        { text: '근데 결제 API가 금요일부터 좀 이상해요 토요일 새벽엔 5xx도 났었고요 ㅋㅋ 설마 큰 건 아니겠죠', pauseMs: 1500 },
        { text: '미래님이 오늘 21시까지 원인 보고서 달래요!! 메일 곧 갈 거예요', pauseMs: 1300 },
        { text: '보안팀이 선배님 세션 그대로 열어 뒀대요 터미널부터 한번 봐요~ 🙏', pauseMs: 1500 },
      ],
      mail: 'brief',
      mailPreview: '도윤님, 은재님 PC 반납 정리와 함께 원인 보고서를 오늘 21:00까지 부탁드립니다.',
    },
    objectives: {
      title: '오늘 할 일',
      items: [
        {
          id: 'terminal',
          text: '열린 터미널 확인',
          hint: '선배가 치다 만 crontab - 가 아직 깜빡여요. 터미널 창을 눌러 보세요.',
          any: [{ interact: 'terminal' }],
          pulse: 'terminal',
        },
        {
          id: 'last-command',
          text: '선배가 마지막에 친 명령 찾기',
          hint: '터미널에 history 를 쳐 보세요. 맨 아래가 가장 최근이에요.',
          any: [{ clue: 'c_history' }, { output: '갔다 와서 마저', host: 'pay-api-01' }],
        },
        {
          id: 'pins',
          text: '증거 3개 핀 → 보고서 쓰기 (칸마다 하나 이상)',
          hint: '수상한 줄에 마우스를 올리면 오른쪽에 📌 가 보여요. 누르면 증거 보드로 가요.',
          any: [{ pins: 3 }],
        },
      ],
      after: [
        '다음: 증거 보드에서 시각을 맞춰 보고, 원인 보고서 세 칸(원인 / 경위 / 책임)을 채우기.',
        '막히면: 은재 선배의 history, 메모, crontab 주석부터. 그래도 막히면 💡',
      ],
    },
  },
};
