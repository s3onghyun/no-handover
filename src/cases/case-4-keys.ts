// Case 4 — 「남아 있는 열쇠」 (the season finale). Ladder position: docs/campaign-ladder.md.
// Design: data/nh-ending-research/report.md §4-0b, §4-3D, §4-6 (the ★ ending 「도망쳐요」).
// All people, hosts, companies, keys and logs are fictional. Read docs/case-format.md before editing.
//
// 11/23 (Mon), ten days after 은재 left. The security team's check finds her account alive on the
// oldest server and her key in a shared account. Principle: an account revoked is not a key revoked.
// Answer to "who came in with that key?": nobody. What 은재 changed 40 minutes before leaving was a
// comment: the key to a sign she had been leaving 도윤 all season (도·망·쳐·요).

import { sshFingerprint } from '../engine/shell.ts';
import type { CaseFile, TimelineEvent } from '../engine/types.ts';

// public keys (fictional blobs); auth.log prints their fingerprints as ssh-keygen -l does
const KEY = {
  eunjae: 'AAAAC3NzaC1lZDI1NTE5AAAAIK7q2nRmb3Jlc3RuYW11MjAxOXNlcnZlcnNhcmVraW5k',
  jhpark: 'AAAAC3NzaC1lZDI1NTE5AAAAIJh9bWJwMjAyNGRlcGxveXBpenphZmlyc3RzZXJ2ZQ',
  ci: 'AAAAC3NzaC1lZDI1NTE5AAAAIC1idWlsZDAxZGVwbG95a2V5MjAyM2NpcGlwZWxpbmU',
  secscan: 'AAAAC3NzaC1lZDI1NTE5AAAAIGzZc2Vjc2Nhbm5pZ2h0bHlyZWFkb25seWtleXM',
  dyhan: 'AAAAC3NzaC1lZDI1NTE5AAAAIE0kZHloYW5udXJpcGMyMDI2dGhyZWV3ZWVrc2lu',
  sjkang: 'AAAAC3NzaC1lZDI1NTE5AAAAIOs2c2prYW5naG9tZTIwMjBydW5ib29rc2FyZWdvb2Q',
};
const FP = Object.fromEntries(Object.entries(KEY).map(([k, v]) => [k, sshFingerprint(v)])) as Record<keyof typeof KEY, string>;
const accept = (host: string, pid: number, user: string, from: string, port: number, key: keyof typeof KEY) =>
  `{ts} ${host} sshd[${pid}]: Accepted publickey for ${user} from ${from} port ${port} ssh2: ED25519 SHA256:${FP[key]}`;

/** 11/16 09:14–20:52: the investigation sessions (SEC-2211, 도윤's Case 3) through bastion, 41 times. */
function investigation(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const start = 9 * 60 + 14;
  const end = 20 * 60 + 52;
  for (let i = 0; i < 41; i++) {
    const m = Math.round(start + ((end - start) * i) / 40);
    const at = `2026-11-16T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(7 + ((i * 13) % 50)).padStart(2, '0')}`;
    out.push({ at, emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: accept('bastion', 96100 + i * 7, 'eunjae', '10.20.4.17', 50100 + i * 11, 'eunjae') }] });
  }
  return out;
}

/** Every night 02:00 the security scanner reads each server's authorized_keys (read only). */
function scanner(host: string, pid: number): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (let d = 14; d <= 23; d++) {
    const day = String(d).padStart(2, '0');
    out.push({
      at: `2026-11-${day}T02:00:0${d % 7}`,
      emits: [
        { kind: 'log', host, path: '/var/log/auth.log', format: 'syslog', line: accept(host, pid + d * 3, 'secscan', '10.20.0.40', 41000 + d, 'secscan') },
        { kind: 'log', host, path: '/var/log/auth.log', format: 'syslog', line: `{ts} ${host} sudo:  secscan : TTY=unknown ; PWD=/home/secscan ; USER=root ; COMMAND=/usr/bin/cat /home/*/.ssh/authorized_keys` },
      ],
    });
  }
  return out;
}

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

const LEDGER_CRONTAB = `# m h dom mon dow  command
# 도는 건 백업 하나뿐. 나머지는 손대지 마세요.        (2018-02 1호)
# 망가지면 재부팅. 그래도 안 되면 그냥 두세요.
# 쳐다보지 말고 퇴근하세요.
# 30 2 * * * /opt/ledger/bin/backup.sh   ← 2021-01 root crontab으로 옮김 (은재)
# 안 도망침. (2018-03 은재)
# 2026-11-13 은재: 도윤님한테도 남겼어요. 날마다 한 줄, 마지막 날은 화분에. 첫 글자만 :)`;

const NAMU_README = `# namu — 지금 이름은 ledger-01 (2021-01 이름 규칙 바꿀 때 바뀜)
2018-03. 제가 이 회사에서 처음 맡은 서버예요.
1호 엔지니어님이 남기고 간 서버였어요. 인수인계서는 없었어요.
그래서 저는 서버마다 이 파일을 써요.

- 정산 원장: /var/lib/ledger  (백업은 root crontab, 매일 02:30)
- 이 서버는 사내 디렉터리(LDAP)가 생기기 전에 세웠어요. 계정은 이 서버 안에만 있어요.

다음 사람에게: 이 서버는 느려요. 그래도 안 쓰러져요. 나무처럼. 🌱`;

const PASSWD_LDAP = (extra: string[]) =>
  ['root:x:0:0:root:/root:/bin/bash', 'syslog:x:104:110::/home/syslog:/usr/sbin/nologin', 'secscan:x:990:990:security scanner:/home/secscan:/usr/sbin/nologin', ...extra, 'dyhan:x:20117:20117:Han Doyun:/home/dyhan:/bin/bash', 'sjkang:x:20033:20033:Kang Seojin:/home/sjkang:/bin/bash', 'jhpark:x:20041:20041:Park Jihoon:/home/jhpark:/bin/bash'].join('\n');
const NSS_LDAP = '# /etc/nsswitch.conf\npasswd:         files ldap\ngroup:          files ldap\nshadow:         files ldap\nhosts:          files dns';
const NSS_FILES = '# /etc/nsswitch.conf  (2018 namu)\npasswd:         files\ngroup:          files\nshadow:         files\nhosts:          files dns';

/** 은재's nine locked drafts (Case 3's 임시 보관함), password: the first server she took on. report.md §4-0b (1). */
const DRAFTS: { to: string; subject: string; body: string }[] = [
  { to: '강서진', subject: '어젯밤', body: '서진님, 어젯밤 2시 알림 왔는데 저 안 일어났어요. 8년 만에 처음이에요. 아침에 보니 서진님이 다 해 놨더라고요. 롤백, 원인 메모, RB 링크까지. 이상하게 서운하고, 이상하게 좋았어요. 이제 새벽엔' },
  { to: '강서진', subject: 'RB-031', body: '서진님, RB-031 읽었어요. 3년 전에 "제 머릿속보다 낫다"고 한 거, 농담 아니었어요. 제 머릿속에만 있던 걸 서진님이 다 꺼내 놨네요. 그럼 제 머릿속은 이제 어디에 쓰면 될까요… 이건 안 보낼게요 :)' },
  { to: '오미래', subject: '대표님께 — git-admins 정리 (세 번째)', body: '대표님, git-admins 그룹 정리 건 세 번째로 말씀드려요. 1년 전 장애 때 급하게 넣은 사람이 아직 그대로예요. 저도 그중 하나예요. 지난번엔 "다음 분기에"라고 하셨어요. 그 전에도요. 이번엔 날짜를' },
  { to: '나에게', subject: '목요일', body: '목공 수업 5주째. 대패질하면 결이 보인다. 서버는 로그를 봐야 보이는데. 목요일 아침엔 알림을 꺼 둔다. 아무 일도 안 났다. 아무 일도 안 났다는 게' },
  { to: '강서진', subject: '2년 전 회고', body: '서진님, 2년 전 포스트모템 기억해요? 원인란에 제 이름이 적혔을 때 서진님이 "구조도 같이 적자"고 했던 거. 그날 고맙다고 못 했어요. 그 뒤로 저는 회고에서 말을 줄였고, 서진님은 런북을 늘렸죠. 둘 다' },
  { to: '오미래', subject: '대표님께', body: '대표님, 지난 회고 때 말씀드린 관리자 권한 회수 건, 다시 말씀드리려다 그만둡니다. 제가 계속 말하는 사람이 되는 게…' },
  { to: '나에게', subject: '남을 이유 / 떠날 이유', body: '1년.txt 다시 열어 봄. 두 칸에 같은 말. 서버들. 서진. 내가 기억하는 동안은 아무도 적지 않는다. 내가 없으면 적겠지. 그게 떠날 이유인지 남을 이유인지 아직' },
  { to: '나에게', subject: '작업실', body: '작업실 매물. 군 단위 소도시, 볕이 잘 든다. 목요일 아침 말고 매일 아침이면. 의자 하나를 끝까지 만들어 보고 싶다. 다리 넷이 다 같은 길이인 의자.' },
  { to: '강서진', subject: '서진님께', body: '서진님, 저 그만두려고요. 서진님한테 제일 먼저 말하고 싶었는데, 아마 제일 나중에 말하게 될 것 같아요. 서진님은 이제 제가 없어도' },
];

/** The 24th handover line the finale pre-types in the handover tab (report.md §4-0b (3), D). */
export const HANDOVER_LINE = 'echo "- [x] 서버 키 회수 (공용 계정·LDAP 밖 로컬 계정 포함) — 한도윤 11/23" >> ~/handover/인수인계서_v4.md';

/** The notebook page that holds 은재's four lines (Cases 0–3), as 도윤 copied them. */
export const SIGN_LINES = [
  '도윤님, 여기서 시작해요. Enter 를 누르면 제가 장애 때 친 순서가 나와요 🌱  (11/10 화, 터미널)',
  '망설여지면 맨 위 주석 두 줄부터요, 도윤님. 오늘은 제 crontab 이에요 🌱  (11/11 수, 터미널)',
  '쳐 보기 전에 README 먼저요, 도윤님. 오늘은 logs-01 🌱  (11/12 목, 터미널)',
  '요 몬스테라는 / 월요일에 물 주세요 🌱 / — 도윤님께  (11/13 금, 화분 포스트잇)',
];

export const caseFourKeys: CaseFile = {
  id: 'case4-keys',
  title: '남아 있는 열쇠',
  subtitle: '퇴사 열흘 뒤, 보안팀 경보: 은재의 계정이 아직 살아 있다. 퇴사 40분 전, 가장 오래된 서버의 crontab을 고쳤다.',
  company: '누리클라우드',
  domain: 'nuricloud.example',
  clock: { start: '2026-11-23T09:00:00', deadline: '2026-11-23T17:00:00', tz: '+09:00', rate: 12 },
  player: 'doyun',
  owner: 'eunjae',

  people: {
    doyun: { name: '한도윤', role: '인프라팀 · 입사 4주차 (나)', initial: '도', color: '#2F3E5C', login: 'dyhan', avatar: 'characters/doyun-avatar.webp', avatarSmall: 'characters/doyun-avatar-64.webp', portrait: 'characters/doyun-full.webp' },
    seojin: { name: '강서진', role: '시니어 SRE · 도윤의 사수', initial: '서', color: '#3A3D42', login: 'sjkang', avatar: 'characters/seojin-avatar.webp', avatarSmall: 'characters/seojin-avatar-64.webp', portrait: 'characters/seojin-full.webp' },
    jihoon: { name: '박지훈', role: '결제개발팀 리드', initial: '지', color: '#F08A3C', login: 'jhpark', avatar: 'characters/jihun-avatar.webp', avatarSmall: 'characters/jihun-avatar-64.webp', portrait: 'characters/jihun-full.webp' },
    eunjae: { name: '남은재', role: '수석 엔지니어 · 11/13 퇴사', initial: '은', color: '#6B7350', login: 'eunjae', avatar: 'characters/eunjae-avatar.webp', avatarSmall: 'characters/eunjae-avatar-64.webp', portrait: 'characters/eunjae-full.webp' },
    // the finale's one live mail comes from 은재's own address, not the company's
    eunjaeHome: { name: '남은재 (개인 메일)', role: '', initial: '은', color: '#6B7350' },
    mirae: { name: '오미래', role: 'CTO', initial: '미', color: '#7A4B6B', login: 'mroh' },
    security: { name: '보안팀', role: '', initial: '보', color: '#5B6770' },
    hr: { name: '인사팀', role: '', initial: '인', color: '#8A8580' },
    bot: { name: '알림봇', role: '모니터링', initial: '⚠', color: '#9A9A9A' },
  },

  // ------------------------------------------------------------------ hosts
  hosts: [
    {
      // 도윤's PC (은재's until 11/13): the only machine here that is not read-only
      name: 'nuri-pc',
      user: 'dyhan',
      ip: '10.20.4.17',
      own: true,
      appendable: ['/home/dyhan/handover/'],
      motd: ['nuri-pc — 한도윤 (11/20–11/23 임시. 전 사용자: 남은재)', '이 PC는 오늘까지 도윤님 계정이에요. 서버들은 보안팀 감사 세션으로 봐요 (다른 탭).'],
      files: [
        { path: '/home/dyhan/README_다음사람에게.txt', owner: 'dyhan', mtime: '2026-11-13T16:10', content: '이 PC를 받는 분께.\n미안해요, 다 못 치웠어요. 화분은 두고 가요.\n서버들은 생각보다 착해요. 밤에만 조금 예민해요.\n\n— 은재 🌱' },
        { path: '/home/dyhan/handover/인수인계서_v4.md', owner: 'dyhan', mtime: '2026-11-13T15:39', content: HANDOVER },
        { path: '/home/dyhan/handover/README.txt', owner: 'dyhan', mtime: '2026-11-20T10:02', content: '(11/20 IT) 남은재님 PC 이관 (한도윤님 임시 사용, ~11/23): ~/handover 는 그대로 옮겼습니다. 예약 작업(crontab)도 그대로 옮겼습니다.' },
        { path: '/home/dyhan/.ssh/id_ed25519.pub', owner: 'dyhan', mtime: '2026-11-02T10:31', content: `ssh-ed25519 ${KEY.dyhan} dyhan@nuri-pc` },
        { path: '/home/dyhan/.ssh/id_ed25519', owner: 'dyhan', mode: '600', mtime: '2026-11-02T10:31', binary: '개인 키 — 열어 보지 않아요.', content: '-----BEGIN OPENSSH PRIVATE KEY-----' },
        { path: '/home/dyhan/.bashrc', owner: 'dyhan', content: "# ~/.bashrc — dyhan\n[ -z \"$PS1\" ] && return\nexport HISTTIMEFORMAT='%F %T '\nPS1='\\u@\\h:\\w\\$ '\nalias ll='ls -alh'\n# 은재님 .bashrc 에서 옮김 (11/20)\nalias 물주기='echo 🌱'\nalias 왜='history | grep \"  # \"'" },
        {
          path: '/var/spool/cron/crontabs/dyhan', owner: 'dyhan', group: 'crontab', mode: '600', mtime: '2026-11-20T10:02',
          content: '# m h dom mon dow  command\n# (11/20 IT: 남은재 → 한도윤 PC 이관. 예약 작업 그대로 옮김)\n0 9 * * 1   notify-send "🌱 월요일: 몬스테라"   # 왜: 화분은 말을 못 해서. 다음 사람도요. (은재)',
        },
      ],
    },
    {
      name: 'bastion',
      user: 'dyhan',
      ip: '10.20.0.5',
      sudoRead: true,
      motd: ['bastion — 모든 서버 접속은 여기를 거칩니다.', '보안팀 감사 세션 (SEC-2240): 읽기 전용 sudo. 다른 서버로: ssh pay-api-01, ssh logs-01'],
      last: [
        'dyhan    pts/2        10.20.4.17       Mon Nov 23 08:52   still logged in',
        'jhpark   pts/4        10.20.30.61      Fri Nov 20 22:38 - 22:50  (00:12)',
        'sjkang   pts/1        10.20.30.52      Fri Nov 20 10:04 - 18:31  (08:27)',
        'eunjae   pts/3        10.20.4.17       Mon Nov 16 20:52 - 21:00  (00:08)',
        'eunjae   pts/3        10.20.4.17       Mon Nov 16 09:14 - 20:51  (11:37)',
        'eunjae   pts/2        10.20.30.77      Fri Nov 13 13:55 - 18:01  (04:06)',
      ],
      files: [
        { path: '/etc/passwd', content: PASSWD_LDAP([]) },
        { path: '/etc/nsswitch.conf', content: NSS_LDAP },
        { path: '/home/dyhan/.bashrc', owner: 'dyhan', content: "# ~/.bashrc — dyhan\nPS1='\\u@\\h:\\w\\$ '\nalias ll='ls -alh'" },
        { path: '/home/eunjae/README.txt', owner: '2041', group: '2041', mtime: '2025-02-11T14:20', content: '# bastion\n왜: 모든 서버 접속을 한 곳으로. 기록이 남게. (은재)\n- 접속 기록: last, /var/log/auth.log (줄 끝에 키 지문)\n- 다른 서버: ssh pay-api-01 / logs-01 / pay-api-02\n- ledger-01 은 여기서 안 들어가져요. 따로 (README 참고, 그 서버에).' },
        { path: '/home/eunjae/.ssh/authorized_keys', owner: '2041', group: '2041', mode: '600', mtime: '2026-11-13T14:36', content: '# 11/13 은재: 정리함' },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
    {
      name: 'pay-api-01',
      user: 'dyhan',
      ip: '10.20.1.11',
      sudoRead: true,
      motd: ['Welcome to pay-api-01 (결제 API 1호기) — Ubuntu 24.04 LTS', '보안팀 감사 세션 (SEC-2240): 읽기 전용'],
      last: ['dyhan    pts/1        10.20.0.5        Mon Nov 23 09:10   still logged in', 'eunjae   pts/3        10.20.30.77      Fri Nov 13 13:57 - 18:01  (04:04)'],
      files: [
        { path: '/etc/passwd', content: PASSWD_LDAP(['payapi:x:998:998::/opt/payment-api:/usr/sbin/nologin']) },
        { path: '/etc/nsswitch.conf', content: NSS_LDAP },
        { path: '/home/eunjae/.ssh/authorized_keys', owner: '2041', group: '2041', mode: '600', mtime: '2026-11-13T14:33', content: '# 11/13 은재: 정리함' },
        { path: '/home/eunjae/README.txt', owner: '2041', group: '2041', mtime: '2025-11-03T16:40', content: '# pay-api-01 — 결제 API 1호기\n왜: 결제 API. 2018-04 첫 구성 (은재). 02호기와 같은 구성.\n\n다음 사람에게: 서버들은 생각보다 착해요.' },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
    {
      name: 'logs-01',
      user: 'dyhan',
      ip: '10.20.3.21',
      sudoRead: true,
      motd: ['Nuri logs-01 (Ubuntu 22.04 LTS) — 로그 수집 서버', '보안팀 감사 세션 (SEC-2240): 읽기 전용'],
      last: ['dyhan    pts/1        10.20.0.5        Mon Nov 23 09:12   still logged in', 'eunjae   pts/2        10.20.0.5        Fri Nov 13 14:37 - 14:39  (00:02)'],
      files: [
        { path: '/etc/passwd', content: PASSWD_LDAP(['logship:x:997:997::/var/lib/logship:/usr/sbin/nologin']) },
        { path: '/etc/nsswitch.conf', content: NSS_LDAP },
        { path: '/home/eunjae/.ssh/authorized_keys', owner: '2041', group: '2041', mode: '600', mtime: '2026-11-13T14:38', content: '# 11/13 은재: 정리함' },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
    {
      name: 'pay-api-02',
      user: 'dyhan',
      ip: '10.20.1.12',
      sudoRead: true,
      motd: ['Welcome to pay-api-02 (결제 API 2호기) — Ubuntu 24.04 LTS', '보안팀 감사 세션 (SEC-2240): 읽기 전용. 배포는 공용 계정 deploy 로 (sudo cat /home/deploy/...)'],
      sudoers: {
        deploy: ['(root) NOPASSWD: /usr/bin/systemctl restart payment-api   # 배포 후 재시작 (2019 은재)'],
        jhpark: ['(ALL : ALL) ALL   # 2023-07 장애 때 임시로 (박지훈) — 회수 안 됨'],
        eunjae: [],
      },
      last: [
        'dyhan    pts/1        10.20.0.5        Mon Nov 23 09:05   still logged in',
        'deploy   pts/0        10.20.30.61      Fri Nov 20 22:41 - 22:49  (00:08)',
        'deploy   pts/0        10.20.2.40       Thu Nov 19 15:02 - 15:03  (00:01)',
        'deploy   pts/0        10.20.30.77      Fri Oct  2 14:10 - 14:21  (00:11)',
      ],
      files: [
        { path: '/etc/passwd', content: PASSWD_LDAP(['payapi:x:998:998::/opt/payment-api:/usr/sbin/nologin', 'deploy:x:1500:1500:shared deploy:/home/deploy:/bin/bash']) },
        { path: '/etc/nsswitch.conf', content: NSS_LDAP },
        {
          path: '/home/deploy/.ssh/authorized_keys', owner: 'deploy', group: 'deploy', mode: '600', mtime: '2024-03-18T11:02',
          content: `# deploy 공용 계정 — 배포하는 사람은 각자 키 한 줄 (2019 은재)\nssh-ed25519 ${KEY.eunjae} eunjae@nuri-pc\nssh-ed25519 ${KEY.ci} ci-deploy@build-01\nssh-ed25519 ${KEY.jhpark} jhpark@mbp-2024`,
        },
        { path: '/home/deploy/README.txt', owner: 'deploy', group: 'deploy', mtime: '2019-09-03T10:20', content: '# deploy — 공용 배포 계정 (2019-09 은재)\n왜: 02호기 추가하면서 배포를 한 계정으로. 사람마다 키 한 줄씩 넣어요.\n- 키 추가: ~/.ssh/authorized_keys 에 한 줄 (주석에 이름)\n- 나갈 때: 자기 줄은 자기가 지우기' },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
    {
      // 2018: older than the company directory (LDAP); accounts live on this box only
      name: 'ledger-01',
      user: 'sec-audit',
      ip: '10.20.0.21',
      sudoRead: true,
      motd: ['ledger-01 — 정산 원장 서버 (Ubuntu 16.04 LTS, 2018)', '보안팀 감사용 로컬 계정 sec-audit (SEC-2240) — 읽기 전용 sudo'],
      uptime: 'up 412 days,  3:11,  1 user,  load average: 0.08, 0.04, 0.01',
      last: [
        'sec-audit pts/0       10.20.0.40       Mon Nov 23 08:41   still logged in',
        'eunjae   pts/0        10.20.0.5        Fri Nov 13 17:18 - 17:22  (00:03)',
        'eunjae   pts/0        10.20.0.5        Tue Sep 22 10:40 - 10:52  (00:12)',
        'eunjae   pts/0        10.20.0.5        Mon Jun  1 14:03 - 14:09  (00:06)',
      ],
      files: [
        { path: '/etc/passwd', content: ['root:x:0:0:root:/root:/bin/bash', 'syslog:x:104:110::/home/syslog:/usr/sbin/nologin', 'eunjae:x:1001:1001:Nam Eunjae,,,:/home/eunjae:/bin/bash', 'ledger:x:1002:1002:ledger app:/var/lib/ledger:/usr/sbin/nologin', 'secscan:x:990:990:security scanner:/home/secscan:/usr/sbin/nologin', 'sec-audit:x:1003:1003:SEC-2240 audit (11/23):/home/sec-audit:/bin/bash'].join('\n') },
        { path: '/etc/nsswitch.conf', content: NSS_FILES },
        { path: '/etc/hosts', content: '127.0.0.1   localhost\n10.20.0.21  ledger-01  namu   # 2021-01 이름 규칙 바꿀 때 ledger-01 로 (옛 이름 namu)' },
        { path: '/home/eunjae/README.txt', owner: 'eunjae', mtime: '2018-03-12T19:40', content: NAMU_README },
        { path: '/home/eunjae/.ssh/authorized_keys', owner: 'eunjae', mode: '600', mtime: '2019-05-07T09:12', content: `ssh-ed25519 ${KEY.eunjae} eunjae@nuri-pc` },
        { path: '/var/spool/cron/crontabs/eunjae', owner: 'eunjae', group: 'crontab', mode: '600', mtime: '2026-11-13T17:20', content: LEDGER_CRONTAB },
        { path: '/var/spool/cron/crontabs/root', owner: 'root', group: 'crontab', mode: '600', mtime: '2021-01-18T11:30', content: '# m h dom mon dow  command\n30 2 * * * /opt/ledger/bin/backup.sh   # 2021-01 은재: eunjae crontab 에서 옮김' },
        { path: '/home/sec-audit/.bashrc', owner: 'sec-audit', content: "# SEC-2240 감사용 (11/23 보안팀)\nPS1='\\u@\\h:\\w\\$ '" },
        { path: '/var/log/auth.log', group: 'adm', mode: '640', content: '' },
      ],
    },
  ],

  // ------------------------------------------------------------------ timeline
  timeline: [
    // 은재's last afternoon: three of five servers, then the oldest one
    { at: '2026-11-13T14:30:12', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4975, cmd: '# 키 정리 (퇴사 체크리스트에는 없음. 그래도.)' }] },
    { at: '2026-11-13T14:31:40', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4976, cmd: "for h in bastion logs-01 pay-api-02; do ssh $h 'grep -l eunjae ~/.ssh/authorized_keys /home/*/.ssh/authorized_keys'; done" }] },
    { at: '2026-11-13T14:33:02', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4977, cmd: "echo '# 11/13 은재: 정리함' > ~/.ssh/authorized_keys" }] },
    { at: '2026-11-13T14:36:20', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4978, cmd: "ssh bastion \"echo '# 11/13 은재: 정리함' > ~/.ssh/authorized_keys\"" }] },
    { at: '2026-11-13T14:38:31', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4979, cmd: "ssh logs-01 \"echo '# 11/13 은재: 정리함' > ~/.ssh/authorized_keys\"" }] },
    { at: '2026-11-13T14:39:50', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4980, cmd: '# 키 정리: 5대 중 3대 함. 나머지 둘은 서진님이랑 (deploy 공용, 정산팀 확인)' }] },
    { at: '2026-11-13T14:40:05', emits: [{ kind: 'history', host: 'pay-api-01', user: 'eunjae', n: 4981, cmd: '# 서진님 오늘 오후부터 휴가. 다음 주에.' }] },
    { at: '2026-11-13T14:33:02', emits: [{ kind: 'log', host: 'pay-api-01', path: '/var/log/auth.log', format: 'syslog', line: '{ts} pay-api-01 sshd[71290]: Received disconnect from 10.20.30.77 port 52130:11: disconnected by user' }] },
    { at: '2026-11-13T14:37:01', emits: [{ kind: 'log', host: 'logs-01', path: '/var/log/auth.log', format: 'syslog', line: accept('logs-01', 55102, 'eunjae', '10.20.0.5', 52210, 'eunjae') }] },
    { at: '2026-11-13T13:55:12', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: accept('bastion', 90122, 'eunjae', '10.20.30.77', 52114, 'eunjae') }] },
    { at: '2026-11-13T13:57:40', emits: [{ kind: 'log', host: 'pay-api-01', path: '/var/log/auth.log', format: 'syslog', line: accept('pay-api-01', 71002, 'eunjae', '10.20.30.77', 52130, 'eunjae') }] },
    { at: '2026-11-13T17:18:40', emits: [{ kind: 'log', host: 'ledger-01', path: '/var/log/auth.log', format: 'syslog', line: accept('ledger-01', 30411, 'eunjae', '10.20.0.5', 53318, 'eunjae') }] },
    {
      at: '2026-11-13T17:20:31',
      note: 'the only change: one comment line in her own crontab (D-2)',
      emits: [
        { kind: 'journal', host: 'ledger-01', unit: 'cron.service', ident: 'crontab', pid: 30470, msg: '(eunjae) BEGIN EDIT (eunjae)' },
        { kind: 'journal', host: 'ledger-01', unit: 'cron.service', ident: 'crontab', pid: 30470, msg: '(eunjae) REPLACE (eunjae)' },
        { kind: 'journal', host: 'ledger-01', unit: 'cron.service', ident: 'crontab', pid: 30470, msg: '(eunjae) END EDIT (eunjae)' },
      ],
    },
    { at: '2026-11-13T17:21:01', emits: [{ kind: 'journal', host: 'ledger-01', unit: 'cron.service', ident: 'cron', pid: 811, msg: '(eunjae) RELOAD (crontabs/eunjae)' }] },
    { at: '2026-11-13T17:22:10', emits: [{ kind: 'log', host: 'ledger-01', path: '/var/log/auth.log', format: 'syslog', line: '{ts} ledger-01 sshd[30411]: pam_unix(sshd:session): session closed for user eunjae' }] },
    { at: '2026-10-02T14:10:22', emits: [{ kind: 'log', host: 'pay-api-02', path: '/var/log/auth.log', format: 'syslog', line: accept('pay-api-02', 61220, 'deploy', '10.20.30.77', 50331, 'eunjae') }] },
    { at: '2026-11-19T15:02:44', emits: [{ kind: 'log', host: 'pay-api-02', path: '/var/log/auth.log', format: 'syslog', line: accept('pay-api-02', 64502, 'deploy', '10.20.2.40', 47110, 'ci') }] },

    // 11/16: the approved investigation (SEC-2211), then the directory account goes
    { at: '2026-11-16T08:59:30', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: '{ts} bastion security-session: investigation mode enabled for session of eunjae (pts/3) from 10.20.4.17 — read-only, approved by 보안팀 (ticket SEC-2211)' }] },
    ...investigation(),
    { at: '2026-11-16T21:00:04', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: '{ts} bastion security-session: SEC-2211 closed; LDAP account eunjae disabled (uid 2041) — 사내 디렉터리 계정 회수' }] },

    // 11/20: 지훈's hotfix through the shared account, with his own key
    { at: '2026-11-20T22:38:12', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: accept('bastion', 99810, 'jhpark', '10.20.30.61', 50990, 'jhpark') }] },
    { at: '2026-11-20T22:41:07', emits: [{ kind: 'log', host: 'pay-api-02', path: '/var/log/auth.log', format: 'syslog', line: accept('pay-api-02', 66711, 'deploy', '10.20.30.61', 52211, 'jhpark') }] },
    { at: '2026-11-20T22:43:30', emits: [{ kind: 'log', host: 'pay-api-02', path: '/var/log/auth.log', format: 'syslog', line: '{ts} pay-api-02 sudo:   deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/systemctl restart payment-api' }] },
    { at: '2026-11-20T22:49:02', emits: [{ kind: 'log', host: 'pay-api-02', path: '/var/log/auth.log', format: 'syslog', line: '{ts} pay-api-02 sshd[66711]: pam_unix(sshd:session): session closed for user deploy' }] },
    { at: '2026-11-20T22:51:00', emits: [{ kind: 'message', channel: 'pc-infra', from: 'jihoon', text: '핫픽스 하나 올렸어요~ pay-api-02 재시작 1번 ㅋㅋ 🙏' }] },

    // this morning
    { at: '2026-11-23T08:41:20', emits: [{ kind: 'log', host: 'ledger-01', path: '/var/log/auth.log', format: 'syslog', line: '{ts} ledger-01 sshd[41022]: Accepted password for sec-audit from 10.20.0.40 port 40021 ssh2' }] },
    { at: '2026-11-23T08:52:10', emits: [{ kind: 'log', host: 'bastion', path: '/var/log/auth.log', format: 'syslog', line: accept('bastion', 101220, 'dyhan', '10.20.4.17', 51002, 'dyhan') }] },
    ...scanner('bastion', 80100),
    ...scanner('pay-api-02', 62100),
    ...scanner('ledger-01', 33100),
    ...scanner('logs-01', 55400),

    // the PC's old messenger session (은재's, still logged in: "메신저: 대상 아님")
    { at: '2026-11-13T17:30:00', emits: [{ kind: 'message', channel: 'pc-infra', from: 'eunjae', text: '8년 동안 고마웠습니다. 서버들 잘 부탁드려요. 다들 물 잘 주세요 🌱' }] },
    { at: '2026-11-13T17:31:00', emits: [{ kind: 'message', channel: 'pc-infra', from: 'jihoon', text: '선배님 ㅠㅠ 8년 고생 많으셨어요!! 🙏🙏' }] },
    { at: '2026-11-17T10:02:00', emits: [{ kind: 'message', channel: 'pc-infra', from: 'seojin', text: 'RB-048 추가했어요. 제목: "문서에 없는 것을 찾는 법".' }] },
    { at: '2026-11-18T11:40:00', emits: [{ kind: 'message', channel: 'pc-infra', from: 'jihoon', text: 'git-admins 권한 반납했어요 ㅎㅎ 이제 저도 서진님한테 반려당하는 사람 🙏' }] },
    { at: '2023-08-17T21:12:00', emits: [{ kind: 'message', channel: 'pc-dm-seojin', from: 'eunjae', text: '서진님 런북 좋네요. 제 머릿속보다 낫다 :)' }] },
    { at: '2023-08-17T21:14:30', emits: [{ kind: 'message', channel: 'pc-dm-seojin', from: 'seojin', text: 'ㅎ' }] },
  ],

  generators: [
    {
      kind: 'historyFill',
      host: 'pay-api-01',
      user: 'eunjae',
      from: '2026-10-01T10:00',
      to: '2026-11-13T12:00',
      seed: 4975,
      pool: ['systemctl status payment-api', 'journalctl -u payment-api -n 50', 'df -h', 'cat ~/README.txt', 'last -n 5', 'ps aux | grep payment', 'cd ~/handover', 'vim 인수인계서_v4.md', 'uptime'],
    },
  ],

  // ------------------------------------------------------------------ messenger
  channels: [
    { id: 'pc-infra', account: 'pc', kind: 'channel', title: '#인프라' },
    { id: 'pc-dm-seojin', account: 'pc', kind: 'dm', title: '강서진', with: 'seojin', draft: '서진님, 그동안 런북 써 줘서 고마웠어요. 사실 나는' },
    { id: 'me-dm-seojin', account: 'me', kind: 'dm', title: '강서진', with: 'seojin' },
    { id: 'me-dm-jihoon', account: 'me', kind: 'dm', title: '박지훈', with: 'jihoon' },
  ],

  mails: [
    {
      id: 'alert', account: 'me', folder: 'inbox', from: 'security', to: '한도윤', cc: '강서진, 오미래', at: '2026-11-23T09:00',
      subject: '[보안] 퇴사자 계정·키 점검 — 남은재 (SEC-2240)',
      body: '한도윤님,\n11/16 계정 회수 뒤 자동 점검에서 아래가 나왔습니다.\n\n1. ledger-01: 계정 eunjae 아직 활성. 11/13 17:20 본인 crontab 수정 (퇴사 40분 전)\n2. pay-api-02: 공용 계정 deploy 의 authorized_keys 에 eunjae@nuri-pc 키 1개\n3. 11/16 09:14–20:52: eunjae 키 사용 41회 (출발지 10.20.4.17)\n4. 11/20 22:41: pay-api-02 deploy 로그인 1회\n\n- 퇴사자 계정과 키로 누가 들어왔는지, 무엇이 그걸 남아 있게 했는지 오늘 17:00까지 보고 바랍니다.\n- 감사용 읽기 전용 세션을 열어 두었습니다 (터미널 탭: bastion, pay-api-02, ledger-01. 명령 목록은 help).\n- ledger-01 은 사내 계정으로 들어가지지 않아 감사용 로컬 계정 sec-audit 를 만들었습니다.\n- PC(nuri-pc)에 남은 퇴사자 예약 작업(crontab)도 정리 바랍니다.\n\n보안팀',
    },
    {
      id: 'checklist', account: 'me', folder: 'inbox', from: 'security', to: '한도윤', at: '2026-11-23T09:02',
      subject: 'FW: [인사] 퇴사 처리 체크리스트 — 남은재',
      body: '한도윤님, 참고로 11/16 회수 때 쓴 양식입니다.\n\n----- 전달된 메시지 -----\n보낸 사람: 인사팀 · 11/09\n제목: [인사] 퇴사 처리 체크리스트 — 남은재\n\n[x] 노트북 반납\n[x] 출입증 반납\n[x] 법인카드 반납\n[x] 사내 계정(LDAP) 회수 — 보안팀 (11/16)\n[x] 메일 계정 전달 설정\n[x] 사내 위키 권한 정리\n[x] 인수인계서 제출\n\n보안팀',
    },
    {
      id: 'sec-2211', account: 'me', folder: 'inbox', from: 'security', to: '한도윤', at: '2026-11-16T08:59',
      subject: '[안내] 남은재님 계정 조사 모드 세션 (SEC-2211)',
      body: '한도윤님,\n남은재님 PC 세션을 조사 모드로 열어 두었습니다.\n\n- 읽기 전용입니다. 파일 수정, 서비스 재시작, crontab 편집은 막혀 있습니다.\n- 열려 있던 터미널 탭(pay-api-01, bastion, pay-cfg, review-web)은 그대로 두었습니다. 세션은 남은재님 키로 붙습니다.\n\n계정은 오늘 조사 종료 후 회수합니다.\n보안팀',
    },
    {
      id: 'sec-done', account: 'me', folder: 'inbox', from: 'security', to: '한도윤', at: '2026-11-16T21:30',
      subject: '[보안] 퇴사자 계정 회수 완료 — 남은재',
      body: '한도윤님,\n남은재님 계정 회수를 마쳤습니다 (11/16 21:00).\n\n- 사내 계정(LDAP): 완료\n- 메신저: 대상 아님\n- 서버 키: 해당 없음\n\n조사 모드 세션(SEC-2211)도 종료했습니다. 수고 많으셨습니다.\n보안팀',
    },
    {
      id: 'pressure', account: 'me', folder: 'inbox', from: 'mirae', to: '한도윤', cc: '보안팀', at: '2026-11-23T14:00', later: true,
      subject: 'RE: [보안] 퇴사자 계정·키 점검 — 남은재 (SEC-2240)',
      body: '도윤님,\n진행 상황 공유 부탁드립니다. 감사 대응 회의가 내일 오전입니다.\n\n- 퇴사자 키로 실제 접속이 있었는지부터 알려 주십시오.\n- 마감은 그대로 17:00입니다.\n\n오미래 드림 / CTO',
    },
    {
      // the finale's first beat (report.md §4-3D (D-4)): "네 번째" closes 은재's "세 번 말함. 네 번째는 안 함."
      id: 'fourth', account: 'me', folder: 'inbox', from: 'mirae', to: '한도윤', cc: '보안팀, 강서진', at: '2026-11-23T17:05', later: true,
      subject: 'RE: [보안] ledger-01 퇴사자 계정 — 경위 보고',
      body: '도윤님, 보고서 잘 읽었습니다.\n\n- 11/13 17:20의 수정은 주석 한 줄이었고, 11/13 이후 은재님 계정과 키로 들어온 사람은 없었다는 것 확인했습니다. 다만 계정과 키가 남아 있었다는 것이 우리 절차의 구멍입니다.\n- 같은 이야기를 네 번째로 듣습니다. 세 번은 은재님에게서, 네 번째는 도윤님의 보고서에서.\n- 퇴사 체크리스트에 서버 키, 공용 계정, LDAP 밖 서버의 로컬 계정을 이번 주 안에 넣겠습니다.\n\n오미래 드림 / CTO',
    },
    {
      // the season's only live words from 은재 (finale); the body is written at the end (src/engine/finale.ts)
      id: 'reply', account: 'me', folder: 'inbox', from: 'eunjaeHome', to: '한도윤', at: '2026-11-23T17:40', later: true,
      subject: '도윤님께', body: '', attachment: { name: '공방.jpg', src: 'characters/eunjae-workshop.webp', alt: '공방에서 의자 다리 하나를 들고 있는 남은재. 얼굴이 처음으로 정면으로 보인다.' },
    },
    { id: 'hr', account: 'pc', folder: 'inbox', from: 'hr', to: '남은재', at: '2026-11-13T18:00', subject: '[인사] 퇴사 처리 완료 안내', body: '남은재님,\n11/13자로 퇴사 처리가 완료되었습니다. 그동안 수고 많으셨습니다.\n\n- 사내 계정·서버 계정 회수: 11/16(월) 보안팀 일정에 따라 진행\n- 장비 반납: 완료\n\n인사팀' },
    { id: 'draft-seojin', account: 'pc', folder: 'drafts', from: 'eunjae', to: '강서진', at: '2026-11-13T17:48', subject: '서진님께', body: '서진님, 인수인계서에 못 쓴 게 하나 있어요. 결제 서버에 제 계정으로 도는 백업이…' },
    ...DRAFTS.map((d, i) => ({
      id: `draft-locked-${i + 1}`, account: 'pc' as const, folder: 'drafts' as const, from: 'eunjae', to: d.to,
      at: `2026-${String(5 + Math.floor(i / 2)).padStart(2, '0')}-${String(3 + i * 2).padStart(2, '0')}T23:${String(10 + i * 4)}`,
      subject: d.subject, body: d.body, locked: '비밀번호: 처음 맡았던 서버 이름', password: ['namu', '나무'],
    })),
  ],

  notes: [
    { id: 'today', title: '11/23 (월) 보안팀 경보', lines: ['보안팀: 은재님 계정 아직 살아 있음 (ledger-01?)', '11/13 17:20 crontab 수정 = 퇴사 40분 전 (?!)', '1. 누가 들어왔나  2. 언제  3. 왜 남았나', '할 일: PC 예약 작업 정리 (보안팀)', '은재님 자리: 오늘까지 (2주 끝. 11/24부터 다시 내 자리)', '월요일: 몬스테라 물 🌱'] },
    // the hidden sign: once the ledger-01 crontab has said "첫 글자만", opening this page shows it (clue k_sign)
    { id: 'signs', title: '은재님이 나한테 남긴 한 줄들 (모아 둠)', lines: SIGN_LINES, unlock: { after: 'k_crontab_comment', clue: 'k_sign' } },
    { id: 'farewell', title: '11/13 (금) 송별회', lines: ['은재님 송별회. 정든집 19시. 지훈님이 쏘심 🍕', '은재님: 밤에 도는 거 서진님께 꼭. (뭐였지)'], highlight: 1, reveal: '→ 알았음. 늦었음.' },
    { id: 'ot', title: '11/02 (월) 입사 OT', lines: ['온콜 = 밤에 전화 받는 사람(?)', '퇴사하면 계정은 보안팀이 지움 (인사팀 양식)'] },
  ],

  stickies: [
    { text: '다음 분께 —\n밤에 도는 것들을\n먼저 보세요.', x: 74, y: 38, color: '#F2D94E' },
    { text: '요 몬스테라는\n월요일에 물 주세요 🌱\n— 도윤님께', x: 74, y: 57, color: '#C9E4B4' },
    { text: '보안팀: 감사 세션 (읽기 전용)\n명령 목록은 터미널에서 help', x: 74, y: 77, color: '#E8E6E1' },
  ],

  notifications: [
    { id: 'n-hotfix', at: '2026-11-20T22:51', app: '메신저', title: '박지훈 · #인프라', text: '핫픽스 하나 올렸어요~ pay-api-02 재시작 1번 ㅋㅋ 🙏' },
    { id: 'n-done', at: '2026-11-16T21:30', app: '메일', title: '보안팀', text: '[보안] 퇴사자 계정 회수 완료 — 남은재' },
  ],

  terminalTabs: [
    { label: 'nuri-pc', host: 'nuri-pc', cwd: '/home/dyhan', scrollback: ['nuri-pc — 한도윤 (11/20–11/23 임시. 전 사용자: 남은재)'] },
    { label: 'handover', host: 'nuri-pc', cwd: '/home/dyhan/handover', scrollback: ['[은재님 PC에서 옮겨 온 인수인계서 v4 — 23항목 중 19개 체크]'] },
    { label: 'bastion', host: 'bastion', cwd: '/home/dyhan' },
    { label: 'pay-api-02', host: 'pay-api-02', cwd: '/home/dyhan' },
    { label: 'ledger-01', host: 'ledger-01', cwd: '/home/sec-audit', scrollback: ['ledger-01 — 정산 원장 서버 (Ubuntu 16.04 LTS, 2018)', '보안팀 감사용 로컬 계정 sec-audit (SEC-2240) — 읽기 전용 sudo'] },
  ],

  dashboard: [
    '퇴사자 계정·키 점검 (SEC-2240) — 11/13 ~ 11/23, 전 서버 SSH 로그인',
    '',
    'eunjae 키 로그인 (시간당)',
    ' 6 ┤                  ▆▆▆▆▆▆▆▆▆▆▆▆',
    ' 3 ┤  ▂                ████████████',
    ' 0 ┼▁▁█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████████████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '    11/13          11/16 09–21                    11/23',
    '',
    'LDAP eunjae: 회수됨 (11/16 21:00)   ledger-01 로컬 eunjae: 활성   deploy 키 eunjae@nuri-pc: 1개',
  ],

  panels: {
    title: '퇴사자 계정·키 점검 (SEC-2240)',
    from: '2026-11-13T00:00',
    to: '2026-11-23T09:00',
    stepMin: 60,
    marks: ['2026-11-13T17:20', '2026-11-16T21:00', '2026-11-20T22:41'],
    stats: [
      { title: 'LDAP eunjae', value: '회수됨', state: 'ok', note: '11/16 21:00' },
      { title: 'ledger-01 로컬 eunjae', value: '활성', state: 'crit', note: '마지막 수정 11/13 17:20' },
      { title: 'deploy 키 eunjae@nuri-pc', value: '1개', state: 'warn', note: 'pay-api-02' },
      { title: '11/13 이후 eunjae 키 사용', value: '41회', state: 'warn', note: '11/16 09:14–20:52' },
    ],
    timeseries: [
      {
        id: 'logins', title: 'eunjae 키 SSH 로그인 (전 서버, 시간당)', min: 0, max: 8,
        series: [{ name: 'eunjae', color: 'yellow', points: [['2026-11-13T00:00', 0], ['2026-11-13T13:00', 2], ['2026-11-13T15:00', 0], ['2026-11-13T17:00', 1], ['2026-11-13T18:00', 0], ['2026-11-16T09:00', 4], ['2026-11-16T21:00', 0]] }],
      },
      {
        id: 'deploy', title: 'pay-api-02 deploy 로그인 (시간당, 키 무관)', min: 0, max: 4,
        series: [{ name: 'deploy', color: 'blue', points: [['2026-11-13T00:00', 0], ['2026-11-19T15:00', 1], ['2026-11-19T16:00', 0], ['2026-11-20T22:00', 1], ['2026-11-20T23:00', 0]] }],
      },
    ],
  },

  // ------------------------------------------------------------------ clues
  clues: [
    { id: 'k_alert', label: '보안팀 메일: 퇴사자 계정·키 점검 네 가지', slot: 'cause', trace: true, match: [{ open: 'mail:alert' }] },
    { id: 'k_nsswitch', label: 'ledger-01 nsswitch: passwd: files (사내 디렉터리를 안 본다)', slot: 'cause', key: true, match: [{ output: '^passwd:\\s+files\\s*$', host: 'ledger-01' }] },
    { id: 'k_ldap_hosts', label: '다른 서버 nsswitch: passwd: files ldap', slot: 'cause', match: [{ output: '^passwd:\\s+files ldap' }] },
    { id: 'k_ledger_passwd', label: 'ledger-01 /etc/passwd: eunjae:x:1001 (로컬 계정)', slot: 'cause', key: true, match: [{ output: '^eunjae:x:1001:1001', host: 'ledger-01' }] },
    { id: 'k_deploy_key', label: 'pay-api-02 deploy authorized_keys: eunjae@nuri-pc', slot: 'cause', key: true, match: [{ output: '^ssh-ed25519 \\S+ eunjae@nuri-pc$', host: 'pay-api-02' }] },
    { id: 'k_ledger_key', label: 'ledger-01 eunjae authorized_keys: 같은 키 (2019)', slot: 'cause', match: [{ output: '^ssh-ed25519 \\S+ eunjae@nuri-pc$', host: 'ledger-01' }] },
    { id: 'k_history_keys', label: '은재 history 11/13 14:39: "5대 중 3대 함. 나머지 둘은 서진님이랑"', slot: 'cause', key: true, trace: true, match: [{ output: '키 정리: 5대 중 3대 함' }] },
    { id: 'k_emptied', label: '세 서버의 authorized_keys: 11/13 14:3x "정리함"', slot: 'cause', match: [{ output: 'Nov 13 14:3\\d .*authorized_keys' }, { output: '# 11/13 은재: 정리함' }] },
    { id: 'k_readme', label: 'ledger-01 README: "namu — 1호 엔지니어님이 남기고 간 서버… 인수인계서는 없었어요"', slot: 'cause', trace: true, match: [{ output: '1호 엔지니어님이 남기고 간 서버', host: 'ledger-01' }] },
    { id: 'k_hosts_namu', label: 'ledger-01 /etc/hosts: 옛 이름 namu', slot: 'cause', match: [{ output: 'ledger-01\\s+namu', host: 'ledger-01' }] },
    { id: 'k_sign', label: '숨은 사인: 도·망·쳐·요 (메모장 네 줄의 첫 글자)', slot: 'sequence', match: [{ open: 'sign:read' }] },

    { id: 'k_crontab_comment', label: 'ledger-01 은재 crontab: 도는 줄 없음, 11/13 주석 "첫 글자만 :)"', slot: 'sequence', key: true, trace: true, aha: '바뀐 건 명령이 아니라 주석 한 줄.', match: [{ output: '첫 글자만 :\\)', host: 'ledger-01' }, { output: '안 도망침\\. \\(2018-03 은재\\)', host: 'ledger-01' }] },
    { id: 's_crontab_mtime', label: 'ls -l: crontabs/eunjae 수정 11/13 17:20', slot: 'sequence', key: true, match: [{ output: 'Nov 13 17:20 .*crontabs/eunjae|Nov 13 17:20 eunjae$', host: 'ledger-01' }, { output: '\\(eunjae\\) REPLACE \\(eunjae\\)', host: 'ledger-01' }] },
    { id: 's_ledger_last', label: 'ledger-01 last: eunjae 마지막 로그인 11/13 17:18–17:22', slot: 'sequence', key: true, match: [{ output: '^eunjae\\s+pts/0\\s+10\\.20\\.0\\.5\\s+Fri Nov 13 17:18', host: 'ledger-01' }] },
    { id: 's_fp_eunjae', label: `키 지문: eunjae@nuri-pc = SHA256:${FP.eunjae.slice(0, 8)}…`, slot: 'sequence', key: true, match: [{ output: `SHA256:${FP.eunjae.replace(/[+/]/g, (c) => `\\${c}`)} eunjae@nuri-pc` }] },
    { id: 's_fp_jihoon', label: `키 지문: jhpark@mbp-2024 = SHA256:${FP.jhpark.slice(0, 8)}…`, slot: 'sequence', key: true, match: [{ output: `SHA256:${FP.jhpark.replace(/[+/]/g, (c) => `\\${c}`)} jhpark@mbp-2024` }] },
    { id: 's_1120', label: 'pay-api-02 auth.log: 11/20 22:41 deploy 로그인 (지훈의 지문)', slot: 'sequence', match: [{ output: 'Nov 20 22:41:07 pay-api-02 sshd\\[66711\\]: Accepted publickey for deploy' }] },
    { id: 's_41', label: 'bastion auth.log: 11/16 eunjae 키 접속 (10.20.4.17)', slot: 'sequence', match: [{ output: 'Nov 16 \\d\\d:\\d\\d:\\d\\d bastion sshd\\[\\d+\\]: Accepted publickey for eunjae from 10\\.20\\.4\\.17' }] },
    // either end of the session in bastion's auth.log (`grep eunjae` prints both): the closing line names SEC-2211 too
    { id: 's_sec2211', label: 'SEC-2211: 11/16 조사 모드 세션 (보안팀 승인)', slot: 'sequence', key: true, match: [{ output: 'approved by 보안팀 \\(ticket SEC-2211\\)' }, { output: 'SEC-2211 closed; LDAP account eunjae disabled', host: 'bastion' }, { open: 'mail:sec-2211' }] },

    { id: 'r_checklist', label: '인사팀 퇴사 체크리스트: 서버 키 · 공용 계정 항목 없음', slot: 'responsibility', key: true, match: [{ open: 'mail:checklist' }] },
    { id: 'r_sec_done', label: '보안팀 11/16 회수 메일: "서버 키: 해당 없음"', slot: 'responsibility', key: true, match: [{ open: 'mail:sec-done' }] },
    { id: 'r_handover', label: '인수인계서 v4: 23항목에 서버 키가 없다', slot: 'responsibility', match: [{ output: '^## 체크리스트 \\(19/23\\)$', host: 'nuri-pc' }] },
    { id: 'r_deploy_readme', label: 'deploy README: "나갈 때: 자기 줄은 자기가 지우기"', slot: 'responsibility', match: [{ output: '나갈 때: 자기 줄은 자기가 지우기' }] },
  ],

  // ------------------------------------------------------------------ accusation
  accusation: {
    maxSubmissions: 2,
    intro: '보안팀과 오미래 CTO 에게 17:00까지 보낼 경위 보고서. 세 칸 모두 근거(📌)가 필요해요. 제출은 2번까지예요.',
    slots: [
      {
        id: 'cause',
        title: '원인 (기술)',
        prompt: '11/16 계정 회수 뒤에도 남은재의 접근이 남은 까닭은?',
        type: 'single',
        options: [
          { id: 'sabotage', blames: 'eunjae', text: '남은재가 퇴사 직전 crontab에 작업을 몰래 걸어 두어, 계정이 지워져도 다시 들어올 길을 남겨 두었다' },
          { id: 'dir-only', correct: true, text: '사내 디렉터리 계정만 회수돼서, 디렉터리를 보지 않는 서버의 로컬 계정과 공용 계정 속 개인 키는 그대로 남았다' },
          { id: 'revoke-failed', text: '보안팀의 회수 작업이 실패해서, 사내 디렉터리의 eunjae 계정이 지금도 모든 서버에 그대로 로그인할 수 있다' },
          { id: 'jihoon-key', blames: 'jihoon', needs: ['s_1120'], text: '박지훈이 퇴사자 키를 공용 deploy 계정에 옮겨 쓰면서, 11/20 밤에 그 키로 결제 서버에 들어갔다' },
          { id: 'scanner', text: '보안 스캐너가 매일 밤 키 파일을 다시 쓰면서, 퇴사자가 지운 키를 공용 계정에 되살려 놓았다' },
        ],
        evidence: [
          { id: 'accounts', label: '계정 · 이름 서비스 설정', clues: ['k_nsswitch', 'k_ledger_passwd'] },
          { id: 'keys', label: '키 파일', clues: ['k_deploy_key', 'k_ledger_key'] },
          { id: 'notes', label: '사람이 남긴 메모 · 기록', clues: ['k_history_keys', 'k_readme'] },
        ],
      },
      {
        id: 'sequence',
        title: '경위 (타임라인)',
        prompt: '11/13 이후, 남은재의 계정과 키로 누가 언제 들어왔나?',
        type: 'single',
        options: [
          { id: 'forty-one', needs: ['s_41'], text: '11/16 09:14부터 20:52까지 누군가 퇴사자 키로 41번 들어왔고, 그 사이 ledger-01의 crontab도 바뀌었다' },
          { id: 'night-1120', blames: 'jihoon', needs: ['s_1120'], text: '11/20 22:41 누군가 퇴사자 키로 deploy 계정에 들어가 결제 서버를 재시작하고 8분 만에 나갔다' },
          { id: 'nobody', correct: true, text: '11/13 17:22 이후 그 계정과 키로 들어온 사람은 없다. 11/16의 41회는 승인된 조사였고, 11/20은 다른 사람의 키였다' },
          { id: 'cron-nightly', text: '11/13 17:20 crontab을 고친 뒤로 매일 밤 그 계정의 작업이 돌면서 다른 서버들에 접속했다' },
        ],
        evidence: [
          { id: 'access', label: '접속 · 인증 기록', clues: ['s_ledger_last', 's_1120', 's_41', 's_sec2211'] },
          { id: 'prints', label: '키 지문', clues: ['s_fp_eunjae', 's_fp_jihoon'] },
          { id: 'jobs', label: '예약 · 작업 기록', clues: ['k_crontab_comment', 's_crontab_mtime'] },
        ],
      },
      {
        id: 'responsibility',
        title: '무엇이 가능하게 했나',
        prompt: '보고서의 이 칸에 무엇을 쓸까? 가장 크게 작용한 3개를 고르세요.',
        type: 'multi',
        picks: 3,
        options: [
          { id: 'checklist', weight: 20, text: '퇴사 체크리스트에 서버 키 · 공용 계정 · 디렉터리 밖 서버가 없어서, 계정을 지우면 회수가 끝난 줄 알았다' },
          { id: 'outside-ldap', weight: 20, text: '2018년에 세운 서버가 사내 디렉터리에 붙지 않은 채 남아, 계정 회수가 그 서버까지 닿지 않았다' },
          { id: 'shared-account', weight: 20, text: '공용 계정에 여러 사람이 각자 개인 키를 넣어 쓰는데, 누구 키가 들어 있는지 관리하는 사람이 없었다' },
          { id: 'one-memory', weight: 15, text: '어느 서버에 누구 키가 있는지가 한 사람의 기억에만 있었고, 문서로는 넘어가지 않았다' },
          { id: 'alone', weight: 10, text: '퇴사자가 키 정리를 혼자 하다 다 못 끝냈고, 남은 둘을 함께 정리할 사람과 절차가 없었다' },
          { id: 'blame-eunjae', weight: -40, blames: 'eunjae', text: '남은재가 범인이다 — 퇴사 직전 서버에 몰래 손을 댔으니, 사보타주로 보고해야 한다' },
          { id: 'blame-jihoon', weight: -40, blames: 'jihoon', needs: ['s_1120'], text: '박지훈이 범인이다 — 퇴사자 키가 든 공용 계정으로 밤에 들어갔으니, 권한을 회수해야 한다' },
          { id: 'blame-security', weight: -40, blames: 'security', text: '보안팀이 범인이다 — 회수를 제대로 하지 않았으니, 담당자에게 책임을 물어야 한다' },
        ],
        evidence: [
          { id: 'procedure', label: '절차 · 양식', clues: ['r_checklist', 'r_sec_done', 'r_handover'] },
          { id: 'accounts', label: '계정 · 이름 서비스 설정', clues: ['k_nsswitch', 'k_ledger_passwd'] },
          { id: 'keys', label: '키 파일', clues: ['k_deploy_key', 'k_ledger_key'] },
          { id: 'notes', label: '사람이 남긴 메모 · 기록', clues: ['k_history_keys', 'r_deploy_readme'] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ hints
  hints: {
    idleMinutes: 6,
    idle: [
      { id: 'idle-1', from: 'jihoon', channel: 'me-dm-jihoon', unlessClues: ['k_readme', 'k_crontab_comment'], text: '도윤님 ㅋㅋ 보안팀 메일 무섭죠~ 근데 은재 선배는 서버마다 README 남기는 스타일이었어요!! ledger-01 홈부터 한번 봐요 🙏', askText: '음 ㅋㅋ 은재 선배는 서버마다 README 남기는 스타일이었어요!! ledger-01 홈부터 한번 봐요 🙏' },
      { id: 'idle-2', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['k_nsswitch', 'k_ledger_passwd'], text: '음. 계정은 사내 디렉터리에서 지웠어요. 그 서버가 디렉터리를 보는지부터요.' },
      { id: 'idle-3', from: 'jihoon', channel: 'me-dm-jihoon', unlessClues: ['k_deploy_key'], text: '아 그리고 pay-api-02 deploy 계정요 ㅋㅋ 저희 다 거기에 자기 키 넣고 써요~ authorized_keys 한번 열어 봐요!!', askText: '아 pay-api-02 deploy 계정요 ㅋㅋ 저희 다 거기에 자기 키 넣고 써요~ authorized_keys 한번 열어 봐요!!' },
      { id: 'idle-4', from: 'seojin', channel: 'me-dm-seojin', unlessClues: ['s_fp_eunjae', 's_fp_jihoon'], text: '로그인 기록은 키 지문으로 봐요. auth.log 줄 끝에 있어요.' },
    ],
    wrong: {
      eunjae: { id: 'wrong-eunjae', from: 'seojin', channel: 'me-dm-seojin', text: '음. 선배가 그 crontab에서 뭘 바꿨는지 먼저요. 명령인지, 주석인지.' },
      jihoon: { id: 'wrong-jihoon', from: 'jihoon', channel: 'me-dm-jihoon', text: '11/20 밤은 제 배포 키입니다. 지문 비교해 주세요. 선배 키 아닙니다.' },
      default: { id: 'wrong-default', from: 'jihoon', channel: 'me-dm-jihoon', text: '도윤님 ㅋㅋ 사람보다 키부터요~ 그 키가 누구 건지 지문으로 맞춰 보는 거 어때요?? 🙏' },
    },
    answers: {
      cause: '11/16 21:00 회수된 것은 사내 디렉터리(LDAP)의 eunjae 뿐 · ledger-01 은 nsswitch 가 passwd: files 라 디렉터리를 안 보고, 로컬 계정 eunjae(uid 1001)가 살아 있다 · pay-api-02 의 공용 계정 deploy 의 authorized_keys 에 eunjae@nuri-pc 키 한 줄 (2019)',
      sequence: '11/13 17:18–17:22 은재 본인이 ledger-01 에서 crontab 주석 한 줄을 더하고 나감 (그 계정의 마지막 로그인) · 11/16 09:14–20:52 의 41회는 SEC-2211 조사 모드 세션 (도윤의 조사) · 11/20 22:41 deploy 로그인의 지문은 jhpark@mbp-2024 · 그 밖에 퇴사자 키 접속 0건',
      responsibility: '인사팀 퇴사 체크리스트에 서버 키·공용 계정·디렉터리 밖 서버가 없고, 회수 메일은 "서버 키: 해당 없음" · ledger-01(2018, 옛 이름 namu)은 사내 디렉터리 밖 · deploy 공용 계정에 사람마다 개인 키 · 은재 history "5대 중 3대 함. 나머지 둘은 서진님이랑" — 서진은 그날 오후부터 휴가',
    },
    explicit: [
      {
        slot: 'cause', cost: 10, unlessClues: ['k_nsswitch', 'k_ledger_passwd'],
        text: 'ledger-01 탭에서 cat /etc/nsswitch.conf 와 getent passwd eunjae, bastion 탭에서도 같은 두 줄 → 📌 (근거: 계정 · 이름 서비스 설정).',
        compare: '두 서버의 passwd: 줄을 나란히: 하나는 files 뒤에 ldap 이 있고 하나는 없어요. 11/16 보안팀은 어디에서 계정을 지웠나요?',
      },
      {
        slot: 'cause', cost: 10, unlessClues: ['k_deploy_key'],
        text: 'pay-api-02 탭에서 sudo cat /home/deploy/.ssh/authorized_keys → 은재님 키 줄을 📌 (근거: 키 파일).',
        compare: '그 계정은 누구의 계정인가요? 사내 디렉터리에서 eunjae 를 지우면 이 파일의 한 줄도 사라질까요?',
      },
      {
        slot: 'cause', cost: 10, unlessClues: ['k_history_keys'],
        text: 'bastion 탭에서 ssh pay-api-01, 그다음 sudo cat /home/eunjae/.bash_history | grep "#" → 11/13 오후의 # 줄을 📌 (근거: 사람이 남긴 메모 · 기록).',
        compare: '"5대 중 3대"의 3대는 어느 서버이고, 나머지 둘은요? 보안팀 메일의 1·2번과 맞춰 보세요.',
      },
      {
        slot: 'sequence', cost: 10, unlessClues: ['k_crontab_comment', 's_crontab_mtime'],
        text: 'ledger-01 탭에서 sudo crontab -l -u eunjae 와 sudo ls -l /var/spool/cron/crontabs/eunjae → 📌 (근거: 예약 · 작업 기록).',
        compare: '11/13 17:20 에 바뀐 줄은 어느 줄인가요? 앞에 # 이 없는 줄(실제로 도는 줄)이 하나라도 있나요?',
      },
      {
        slot: 'sequence', cost: 10, unlessClues: ['s_fp_eunjae', 's_fp_jihoon'],
        text: 'pay-api-02 탭에서 sudo ssh-keygen -lf /home/deploy/.ssh/authorized_keys → 키마다 지문(SHA256:…)이 나와요. 📌 (근거: 키 지문).',
        compare: 'sudo grep "for deploy" /var/log/auth.log 의 11/20 22:41 줄 끝 지문을 위 지문들과 하나씩 대 보세요. 누구 키인가요?',
      },
      {
        slot: 'sequence', cost: 10, unlessClues: ['s_sec2211', 's_ledger_last'],
        text: 'bastion 탭에서 sudo grep SEC-2211 /var/log/auth.log (메일함의 11/16 보안팀 메일도), ledger-01 탭에서 last eunjae → 📌 (근거: 접속 · 인증 기록).',
        compare: '41회가 찍힌 시각(11/16 09:14–20:52)과 조사 세션이 열려 있던 시각을 나란히. 그 41회는 누구였나요? ledger-01 의 마지막 eunjae 로그인은 언제인가요?',
      },
      {
        slot: 'responsibility', cost: 10, unlessClues: ['r_checklist', 'r_sec_done'],
        text: '메일함의 보안팀 메일 두 통: "FW: 퇴사 처리 체크리스트"와 11/16 "퇴사자 계정 회수 완료" → 📌 (근거: 절차 · 양식).',
        compare: '체크리스트에 서버 키, 공용 계정, 디렉터리 밖 서버가 있나요? "서버 키: 해당 없음"은 무엇을 보고 쓴 걸까요?',
      },
      { slot: 'responsibility', cost: 10, text: '이 칸은 "누가"가 아니라 "무엇이 그걸 가능하게 했나"입니다. 사람을 범인으로 고르면 틀린 칸이 돼요.' },
    ],
    ask: {
      prompts: ['뭐부터 봐요?', '막혔어요'],
      none: { from: 'jihoon', channel: 'me-dm-jihoon', text: 'ㅋㅋ 저도 이제 아는 게 없어요… 💡 힌트 패널 한번 봐요!! 🙏' },
    },
  },

  // ------------------------------------------------------------------ live events
  triggers: [
    { id: 'alarm', when: { clue: 'k_alert' }, actions: [{ message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 6, text: '헉 은재 선배가 퇴사 40분 전에 crontab을?? 설마… 아니겠죠 ㅋㅋ' } }] },
    { id: 'crontab', when: { clue: 'k_crontab_comment' }, actions: [{ message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 8, text: '도윤님 그 crontab 봤어요?? 안 도망침 ㅋㅋㅋㅋ 은재 선배 진짜' } }] },
    {
      // the hidden sign read straight down 도윤's notebook page (report.md §4-6): 지훈 bursts out, 서진 lets one line slip
      id: 'sign-found',
      when: { clue: 'k_sign' },
      actions: [
        { toast: '세로로 읽으면 — 도 · 망 · 쳐 · 요' },
        { message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 3, text: 'ㅋㅋㅋㅋㅋ 도윤님 튀래요' } },
        { message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 9, text: '음. 선배답네요.' } },
      ],
    },
    { id: 'deploy', when: { clue: 'k_deploy_key' }, actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 10, text: 'deploy 공용 키요. 선배가 저랑 정리하자고 했었어요. 저는 휴가였고요.' } }] },
    { id: 'hotfix', when: { allClues: ['s_1120', 's_fp_jihoon'] }, actions: [{ message: { channel: 'me-dm-jihoon', from: 'jihoon', delaySec: 5, text: '앗 ㅋㅋ 11/20 밤 그거 저예요!! 핫픽스 배포… 제 키로 deploy 들어간 거예요 🙏' } }] },
    { id: 'mine', when: { clue: 's_sec2211' }, actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 8, text: '11/16은 도윤님이에요. 조사 세션. 로그는 허락을 몰라요.' } }] },
    { id: 'namu', when: { clue: 'k_readme' }, actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 12, text: 'namu. 선배가 처음 맡은 서버였네요. 저도 몰랐어요.' } }] },
    { id: 'gap', when: { allClues: ['k_ledger_passwd', 'k_deploy_key'] }, actions: [{ message: { channel: 'me-dm-seojin', from: 'seojin', delaySec: 20, text: '둘 다 체크리스트에 없어요. 인사팀 양식에도, 제 런북에도.' } }] },
    { id: 'pressure-mail', when: { afterMin: 30 }, actions: [{ mail: 'pressure' }, { toast: '새 메일: RE: [보안] 퇴사자 계정·키 점검' }] },
  ],

  // ------------------------------------------------------------------ last scene → season finale (report.md §4-6)
  // after the report: 오미래's "네 번째", the sign read aloud if the player had not found it, then the 24th handover line
  ending: {
    beats: [
      { wait: 0, mail: 'fourth' },
      { wait: 9, unless: 'sign-found', note: 'signs', sign: true },
      { wait: 1, unless: 'sign-found', message: { channel: 'me-dm-jihoon', from: 'jihoon', text: 'ㅋㅋㅋㅋㅋ 도윤님 튀래요' } },
      { wait: 2.5, unless: 'sign-found', message: { channel: 'me-dm-seojin', from: 'seojin', text: '음. 선배답네요.' } },
      // why hand it over at all: 도윤's two weeks in 은재's seat end today (Case 0: 11/10–11/23) and the seat stays empty
      { wait: 2.5, message: { channel: 'me-dm-seojin', from: 'seojin', text: '도윤님, 내일부터 원래 자리예요. 2주 고마웠어요.' } },
      { wait: 1.2, message: { channel: 'me-dm-seojin', from: 'seojin', text: '후임은 다음 달이래요. 선배 자리는 내일부터 비어요.' } },
      { wait: 1.2, message: { channel: 'me-dm-seojin', from: 'seojin', text: '인수인계서는 오늘 남기고 가요. 누구한테 넘길지는 도윤님이 정해요.' } },
      { wait: 1.5, note: 'today', line: '{hm} 서진님: 내일부터 원래 자리. 인수인계서는 오늘. → 은재님 마지막 날도 이랬겠지. 이번엔 적고 간다.' },
      { wait: 2, act: { tab: 1, prefill: HANDOVER_LINE, until: '^echo "- \\[x\\] 서버 키 회수', timeoutSec: 90 } },
    ],
  },

  finale: {
    signTrigger: 'sign-found',
    handover: { host: 'nuri-pc', path: '/home/dyhan/handover/인수인계서_v4.md', line: '- [x] 서버 키 회수 (공용 계정·LDAP 밖 로컬 계정 포함) — 한도윤 11/23' },
    choice: {
      question: '내일이면 이 자리는 비어요. 인수인계서 v5를 누구에게 넘길까요?',
      note: '도윤은 내일 원래 자리로 · 23항목 + 24번째 줄: 서버 키 회수',
      confirm: '넘기면 되돌릴 수 없어요. 넘기기 직전 저장은 남아요.',
      ok: '넘기기',
      back: '다시 고르기',
      options: [
        { id: 'seojin', label: '서진님 — 런북으로' },
        { id: 'mirae', label: '미래님 — 체크리스트로' },
        { id: 'security', label: '보안팀 — 오늘 안에' },
        { id: 'infra', label: '#인프라 — 다 같이', needsSign: true },
        { id: 'nobody', label: '아무에게도 — 제가 기억할게요' },
      ],
    },
    cards: {
      infra: { title: '다 같이', lines: ['자리를 비우기 전, 도윤이 인수인계서 v5를 #인프라에 올린다.', '다음 날 11:20, 지훈이 첫 댓글을 단다. "제 개인 cron도 하나 있어요. 지금 적을게요."', '금요일부터 \'밤에 도는 것\' 목록이 매주 팀 메일로 나간다.', '읽는 사람은 열한 명, 고치는 사람은 아직 셋이다.'] },
      seojin: { title: 'RB-049', lines: ['서진이 그날 밤 RB-049 「퇴사자 키 회수」와 RB-050 「밤에 도는 것」을 쓴다.', '문서는 정확하고, 링크는 빠짐없다. 서진의 런북은 쉰 개가 됐다.', '서진은 그날 밤에도 \'결제\' 알림을 끄지 못했다.'] },
      mirae: { title: '네 번째', lines: ['금요일, 퇴사 체크리스트에 \'서버 키\', \'공용 계정\', \'LDAP 밖 서버\'가 들어간다.', '2년 전 포스트모템의 원인란이 \'남은재\'에서 \'백업 검증 절차 없음\'으로 고쳐진다.', '체크리스트는 생겼다. 체크하는 사람은 여전히 바쁘다.'] },
      security: { title: '하루 만에', lines: ['보안팀이 18:00까지 전 서버의 키를 회수한다. 퇴사자 키 0개.', '그날 저녁 지훈의 배포 키도, 서진의 비상 키도 같이 막혔다.', '다음 날 아침 배포가 멈췄다.'] },
      nobody: { title: '인수인계 없음', lines: ['도윤은 아무에게도 넘기지 않고 원래 자리로 돌아갔다. 다 기억했으니까.', '3년 뒤, 그 자리에 앉은 사람의 메모장 첫 장에는 이렇게 적혀 있었다.', '"도윤님: 밤에 도는 거 꼭. (뭐였지)"'] },
    },
    reply: {
      mail: 'reply',
      first: {
        infra: '다 같이 읽었다면서요. 그게 제가 8년 동안 못 한 거예요.',
        seojin: '서진님한테 넘겼다고요. 서진님은 또 혼자 다 쓰겠죠. 옆에서 같이 써 주세요.',
        mirae: '대표님이 2년 전 회고를 고쳤다고 들었어요. 네 번째에서요 :)',
        security: '보안팀이 하루 만에 다 막았다고요 ㅎㅎ 지훈님 키까지요. 그것도 방법이에요.',
      },
      signFound: '첫 글자 찾았다면서요 :) 반만 농담이었어요.',
      signMissed: '제가 남긴 첫 글자들, 메모장을 세로로 읽어 봐요 :)',
      body: [
        '저는 인수인계서를 끝내지 못했어요. 대신 아무것도 지우지 않았어요. 누군가는 읽을 거라고 믿고요.',
        "2018년에 '도망쳐'를 받고도 저는 8년을 안 도망쳤어요. 제가 다 기억하니까, 아무도 적을 필요가 없었던 거예요.",
        '그러니까 도망치라는 건 회사가 아니라, 혼자 다 기억하는 자리에서예요. 도윤님은 적는 사람이니까 괜찮을 거예요.',
        '{extra}',
        '저는 요즘 의자를 만들어요. 다리 하나가 자꾸 짧아요.',
        '서버들한테 안부 전해 주세요. 🌱',
      ],
      watered: '몬스테라 아직 살아 있다고 들었어요.',
      forwarded: '서진님한테 제 초안을 전해 줬다면서요. …고마워요.',
      noHints: '로그부터 보셨겠죠. 그럼 됐어요.',
      sign: '남은재',
    },
    crontab: {
      host: 'nuri-pc',
      user: 'dyhan',
      byChoice: {
        default: {
          text: '# 왜: 월요일은 몬스테라. 은재님 crontab에서 옮김.\n0 9 * * 1   notify-send "🌱 몬스테라 물 주는 날"\n# 왜: 퇴사자 키가 남았는지 매주 확인. RB-049. 결과는 팀으로.\n0 9 * * 1   /home/dyhan/bin/키점검.sh | mail -s "[주간] 퇴사자 키 점검" infra@\n# 왜: 밤에 도는 것 목록을 매주 팀에. 혼자 기억하지 않으려고.\n0 18 * * 5  /home/dyhan/bin/밤.sh | mail -s "[주간] 밤에 도는 것" infra@',
          next: '다음 실행: 11/27 (금) 18:00',
        },
        nobody: { text: '0 9 * * 1   notify-send "🌱"\n15 3 * * 6  /home/dyhan/bin/키점검.sh', next: '다음 실행: 11/28 (토) 03:15' },
      },
    },
    credits: [
      '## 체크리스트 (27/27)',
      '- [x] 결제 서버 개인 crontab 정리 (서진님께 설명)  — 강서진 11/16',
      '- [x] 온콜표에서 내 이름 빼기  — 팀장 11/17',
      '- [x] 정산팀 원장 백업 이관 확인  — 박지훈 11/18',
      '- [x] (새) git-admins 그룹 정리  — 오미래 11/18',
      '- [x] (새) 서버 키 회수: 공용 계정·로컬 계정·PC 포함  — 한도윤·강서진 11/23',
      '- [x] (새) 접근 이관 절차 RB-049  — 강서진 11/23',
      '- [x] (새) 마지막으로 탭 닫기  — 한도윤 11/23',
      '- [x] 화분  — 한도윤 (매주 월)',
      '- [x] 적어 두기. 그래야 도망칠 수 있어요.  — 한도윤',
      '작성: 남은재 (v1–v4) · 한도윤, 강서진, 박지훈, 오미래 (v5)',
    ],
    nextLine: { host: 'nuri-pc', path: '/home/dyhan/README_다음사람에게.txt', seconds: 15, sign: '— 한도윤', prompt: '이 자리의 다음 사람에게 한 줄', empty: '…' },
    bad: { host: 'nuri-pc', user: 'dyhan', title: '몬스테라가 시들었습니다', sub: '3주 뒤. crontab -r 은 묻지 않고 전부 지운다. e 바로 옆에 r 이 있다.', back: '지우기 직전으로 돌아가기' },
    endings: [
      { id: 'infra', title: '다 같이' },
      { id: 'seojin', title: 'RB-049' },
      { id: 'mirae', title: '네 번째' },
      { id: 'security', title: '하루 만에' },
      { id: 'nobody', title: '인수인계 없음' },
      { id: 'monstera', title: '몬스테라' },
    ],
  },

  // ------------------------------------------------------------------ debrief (after the finale)
  debrief: {
    headline: '계정을 지워도 열쇠는 남는다. 열쇠가 어디 있는지는 한 사람만 알았다.',
    story: [
      { at: '2018-03', text: '은재가 입사해 처음 맡은 서버 namu(지금 ledger-01). 1호 엔지니어가 남기고 간 서버였고, 인수인계서는 없었다. crontab 맨 위에는 1호의 세 줄, 그 아래 은재의 "안 도망침."' },
      { at: '2019', text: '02호기를 들이며 공용 배포 계정 deploy 를 만든다. 사람마다 개인 키 한 줄. "나갈 때: 자기 줄은 자기가 지우기."' },
      { at: '금 11/13 14:30', text: '퇴사 체크리스트에 없는 키 정리를 은재가 혼자 시작한다. pay-api-01, bastion, logs-01 세 대. "나머지 둘은 서진님이랑 (deploy 공용, 정산팀 확인)." 서진은 그날 오후부터 휴가였다.' },
      { at: '금 11/13 17:20', text: '퇴사 40분 전, ledger-01 의 자기 crontab 에 주석 한 줄을 더한다. "도윤님한테도 남겼어요. 날마다 한 줄, 마지막 날은 화분에. 첫 글자만 :)" 도는 명령은 2021년부터 없다.' },
      { at: '월 11/16', text: '09:14–20:52, 조사 모드 세션(SEC-2211)이 은재의 키로 41번 붙는다. 도윤의 Case 3 조사였다. 21:00 보안팀이 사내 디렉터리의 eunjae 를 회수한다. 회수 메일: "서버 키: 해당 없음."' },
      { at: '금 11/20 22:41', text: '지훈이 핫픽스를 배포하러 deploy 계정에 들어간다. 자기 키(jhpark@mbp-2024)로.' },
      { at: '월 11/23 09:00', text: '보안팀 자동 점검: ledger-01 의 로컬 계정 eunjae, deploy 의 eunjae@nuri-pc 키. 11/13 이후 그 계정과 키로 들어온 사람은 없었다.' },
    ],
    systemFactors: [
      '퇴사 체크리스트(인사팀 양식)에 서버 키 · 공용 계정 · 디렉터리 밖 서버가 없다 — 회수 메일이 "서버 키: 해당 없음"이라고 쓸 수 있었던 이유',
      '사내 디렉터리(LDAP) 이전에 세운 서버 — 계정 회수가 닿지 않는다 (nsswitch: passwd: files)',
      '공용 계정에 개인 키 — 누가 들어왔는지는 지문으로만 구분되고, 누구 줄이 남았는지는 아무도 관리하지 않는다',
      '어느 서버에 누구 키가 있는지가 한 사람의 기억에만 — 그 사람이 혼자 정리하다 둘을 남기고 떠났다',
    ],
    principle: 'SSH 키는 서버마다, 계정마다 따로 남는다. 계정 회수 ≠ 키 회수. 사내 디렉터리에서 사람을 지워도, 디렉터리 밖 서버의 로컬 계정과 공용 계정 속 키 한 줄은 그대로다.',
    cards: [
      { title: '이 서버는 사내 디렉터리를 보나', cmd: 'grep ^passwd /etc/nsswitch.conf   ·   getent passwd <사람>', explain: 'passwd: files ldap 이면 디렉터리 계정이 통하고, files 뿐이면 계정은 이 서버 안에만 있다. 디렉터리에서 지운 사람이 getent 에 나오면 로컬 계정이 남은 것이다.' },
      { title: '누구 키가 남았나', cmd: 'sudo grep -H "" /home/*/.ssh/authorized_keys /root/.ssh/authorized_keys', explain: '사람 계정만이 아니라 공용 계정(deploy)과 root 까지. 주석(키 끝의 이름)은 바뀔 수 있으니 지문으로 확인한다.' },
      { title: '키 지문', cmd: 'ssh-keygen -lf ~/.ssh/authorized_keys', explain: '키마다 SHA256 지문. auth.log 의 "Accepted publickey … SHA256:…" 끝과 대 보면 그 로그인이 어느 키였는지 안다.' },
      { title: '그 키로 누가 들어왔나', cmd: 'sudo grep "Accepted publickey" /var/log/auth.log | grep <지문>   ·   last <계정>', explain: '계정 이름이 아니라 지문으로. 공용 계정의 로그인은 이름이 다 deploy 로 찍힌다.' },
      { title: '최근에 바뀐 키 파일', cmd: 'sudo find /home -name authorized_keys -mtime -14 -ls', explain: '누가 언제 정리했는지(또는 더했는지). 정리한 서버와 남은 서버가 갈린다.' },
      { title: '퇴사 체크리스트에 넣을 것', cmd: '서버 키 · 공용 계정의 개인 키 · 디렉터리 밖 서버의 로컬 계정 · 예약 작업', explain: '사람의 기억 대신 목록으로. 목록이 있어야 혼자 정리하다 남기는 일이 없다.' },
    ],
    closingMail: 'fourth',
    doyunLine: '제가 보기엔, 은재님은 인수인계서를 못 끝낸 게 아니라 아무것도 지우지 않은 거였어요. 이제 제가 적을게요.',
    cast: [
      { who: 'doyun', text: '처음으로 "누가"를 묻는 메일에 "아무도"라고 답했다. 그리고 은재가 시즌 내내 남긴 한 줄들을 메모장에 모아 두고 있었다.' },
      { who: 'seojin', text: '은재가 함께 정리하자던 그날 휴가였다. "둘 다 체크리스트에 없어요. 인사팀 양식에도, 제 런북에도."' },
      { who: 'jihoon', text: '공용 계정에 자기 키로 들어갔고, 그래서 지문으로 바로 가려졌다. 2023년의 임시 sudo 는 아직 그대로다.' },
      { who: 'eunjae', text: '아무것도 숨기지 않았다. 2018년에 인수인계 없이 서버를 받은 "다음 사람"이었고, 그래서 서버마다 README 를 썼다. 마지막 날 남긴 것은 백도어가 아니라 농담 하나였다.' },
    ],
  },

  goal: { intro: '보안팀과 오미래 CTO 에게 17:00까지 보낼 경위 보고서. 세 칸을 채우면 사건이 끝나요. 제출은 2번까지, 틀리면 칸마다 ✓/✗ 로 알려 줘요.' },

  // ------------------------------------------------------------------ opening
  opening: {
    briefing: {
      lockTime: '09:00',
      lockDate: '11월 23일 월요일',
      caller: 'seojin',
      kind: 'voice',
      voiceCue: 'voice.briefing-case4-seojin',
      lines: [
        { text: '도윤님. 보안팀 경보예요.', pauseMs: 900 },
        { text: '은재 선배 계정, 11/16에 회수했는데 아직 남은 게 있대요.', pauseMs: 1100 },
        { text: 'ledger-01에 선배 계정이 살아 있고, 11/13 17:20에 선배가 거기 crontab을 고쳤대요. 퇴사 40분 전.', pauseMs: 1400 },
        { text: '누가 그 계정이랑 키로 들어왔는지. 왜 남아 있었는지. 그것만 찾아요. 지우는 건 같이 해요.', pauseMs: 1300 },
        { text: '보고서는 보안팀이랑 미래님께, 17시까지. 도윤님 그 자리, 오늘까지죠.', pauseMs: 1500 },
      ],
      mail: 'alert',
      mailPreview: '11/16 계정 회수 뒤 자동 점검에서 아래가 나왔습니다. 1. ledger-01: 계정 eunjae 아직 활성.',
    },
    objectives: {
      title: '오늘 할 일',
      items: [
        { id: 'alert', text: '보안팀 메일 읽기', hint: '메일함의 [보안] 메일. 네 가지가 적혀 있어요.', any: [{ open: 'mail:alert' }], pulse: 'mail' },
        { id: 'ledger', text: 'ledger-01 에서 은재님 crontab 보기', hint: 'ledger-01 탭: sudo crontab -l -u eunjae', any: [{ clue: 'k_crontab_comment' }, { clue: 's_crontab_mtime' }], pulse: 'terminal' },
        { id: 'pins', text: '증거 3개 핀 → 보고서 쓰기 (칸마다 하나 이상)', hint: '수상한 줄에 마우스를 올리면 오른쪽에 📌 가 보여요.', any: [{ pins: 3 }] },
      ],
      after: ['다음: 서버마다 계정과 키, 그리고 지문. 원인 / 경위 / 무엇이 가능하게 했나.', '막히면: 은재님 README 와 history, 키 지문. 그래도 막히면 💡'],
    },
  },

  boot: { status: '은재님이 쓰던 PC — 11/20부터 도윤님 계정 (11/23까지)', unlock: 'PC 켜기', note: '보안팀 감사 세션 (SEC-2240) · 서버는 읽기 전용' },

  shell: {
    help: [
      '누리클라우드 — 보안팀 감사 세션 (SEC-2240). 서버는 읽기 전용, 이 PC(nuri-pc)는 오늘까지 도윤님 계정.',
      '  파일    ls  cd  pwd  cat  less  head  tail  grep  wc  sort  uniq  find',
      '  계정    getent passwd|group   id   last   sudo -l [-U 사용자]',
      '  키      ssh-keygen -lf <파일>   (지문 보기만)',
      '  기록    history  journalctl',
      '  예약    crontab -l   (남의 것: sudo crontab -l -u <사용자>)',
      '  시스템  systemctl show|status   ps  df  free  uptime  hostname  date  echo  env  which',
      '  이동    ssh <호스트>   exit',
      '  기타    man <명령>   help   clear   sudo <읽기 명령> (모든 사용이 auth.log에 남음)',
      '팁: ↑/↓ 이전 명령, Tab 자동완성, 줄 위의 📌 로 증거 보드에 핀.',
    ],
  },
};
