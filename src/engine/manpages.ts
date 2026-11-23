// Short in-world manual pages (Korean). Real syntax; examples use case-neutral paths.

type Page = { name: string; synopsis: string[]; desc: string[]; examples: string[] };

const P = (name: string, synopsis: string[], desc: string[], examples: string[]): Page => ({ name, synopsis, desc, examples });

const pages: Page[] = [
  P('ls — 디렉터리 내용 보기', ['ls [-a] [-l] [-h] [-t] [-r] [-1] [경로...]'], ['-a  숨김 파일(.으로 시작)까지', '-l  권한·소유자·크기·수정 시각', '-h  크기를 K/M/G로', '-t  최근 수정순'], ['ls -alh ~', 'ls -l /proc/<PID>/fd | head']),
  P('cd — 작업 디렉터리 바꾸기', ['cd [경로]', 'cd -    (직전 디렉터리)', 'cd      (홈으로)'], ['~ 는 홈 디렉터리를 뜻합니다.'], ['cd ~/handover', 'cd /var/log']),
  P('cat — 파일 내용 출력', ['cat [-n] 파일...'], ['-n  줄 번호를 붙입니다.', '개인 파일로 보이는 것은 한 번 확인을 받습니다.'], ['cat ~/.bashrc', 'cat -n /etc/crontab']),
  P('less — 파일 보기', ['less 파일'], ['조사 모드에서는 페이지 넘김 없이 전체를 한 번에 출력합니다. 길면 head/tail/grep과 같이 쓰세요.'], ['less /var/log/auth.log']),
  P('head — 앞부분만 보기', ['head [-n N] [파일...]', '명령 | head [-N]'], ['기본 10줄.'], ['head -5 ~/bin/backup.sh', 'git log --oneline | head -3']),
  P('tail — 뒷부분만 보기', ['tail [-n N] [파일...]', 'tail -n +N 파일   (N번째 줄부터)'], ['기본 10줄. -f(실시간 추적)는 조사 모드에서 꺼져 있습니다.'], ['tail -3 ~/log/backup.log', 'tail -n 50 /var/log/auth.log']),
  P('grep — 패턴이 있는 줄 찾기', ['grep [-i] [-v] [-n] [-c] [-E] [-w] [-r] [-A N] [-B N] [-C N] 패턴 [파일...]'], ['-i 대소문자 무시  -v 반대로  -n 줄 번호  -c 개수만', '-E 확장 정규식(a|b)  -r 디렉터리 전체  -A/-B/-C 앞뒤 N줄'], ['grep -i error app.log', 'grep -n "too many" -A 2 app.log', 'history | grep "  # "']),
  P('wc — 줄/단어/바이트 세기', ['wc [-l] [-w] [-c] [파일...]'], ['파이프 뒤에서 -l 로 줄 수를 세는 데 자주 씁니다.'], ['ls /proc/<PID>/fd | wc -l']),
  P('sort / uniq — 정렬, 중복 묶기', ['sort [-n] [-r] [-u]', 'uniq [-c] [-d]'], ['uniq는 붙어 있는 같은 줄만 묶으므로 보통 sort 뒤에 씁니다.'], ['grep sjkang access.log | sort | uniq -c']),
  P('find — 파일 찾기', ['find [경로...] [-name 패턴] [-type f|d] [-user 이름] [-maxdepth N]'], ['권한이 없는 디렉터리는 "Permission denied" 를 내고 건너뜁니다.'], ['find ~ -name "*.sh"', 'find /etc/cron.d -type f']),
  P('history — 이 셸의 명령 기록', ['history [N]'], ['HISTTIMEFORMAT 이 설정돼 있으면 실행 시각이 같이 나옵니다.', '# 로 시작하는 줄은 실행되지 않는 주석이지만 기록에는 남습니다.', '다른 사람의 기록은 그 사람 홈의 ~/.bash_history 파일에 있습니다(#숫자 줄은 유닉스 시각).'], ['history | tail -20', 'history | grep crontab']),
  P('journalctl — systemd 저널(로그) 보기', ['journalctl [-u 유닛] [--since 시각] [--until 시각] [-p 우선순위] [-g 패턴] [-n N] [-r] [-o short-iso]'], ['-u payment-api 처럼 서비스 이름으로 거릅니다.', '--since "2026-11-14 03:00"  날짜+시각.  --since 03:00 은 "오늘" 03:00 입니다.', '--since yesterday / today / -2d / "2 days ago" 도 됩니다.', '-p err 은 에러 이상만, -g 는 메시지 패턴 검색.'], ['journalctl -u payment-api --since "2026-11-14 03:00" --until "2026-11-14 03:30"', 'journalctl -u cron --since -3d', 'journalctl -p err -n 20']),
  P('crontab — 예약 작업 목록', ['crontab -l [-u 사용자]'], ['형식: 분 시 일 월 요일 명령.  "15 3 * * *" = 매일 03:15.  "0 * * * *" = 매시 정각.  "15 3 * * 6" = 토요일 03:15.', 'cron 이 실행하는 환경은 로그인 셸과 다릅니다(PATH=/usr/bin:/bin). man cron', '사용자마다 따로 있습니다. 다른 사용자 것은 sudo crontab -l -u 이름.', '시스템 전체 예약은 /etc/crontab, /etc/cron.d/ 에도 있습니다.', '편집(-e)과 삭제(-r)는 조사 모드에서 막혀 있습니다.'], ['crontab -l', 'sudo crontab -l -u deploy', 'ls /etc/cron.d/']),
  P('git — 저장소 기록 보기', ['git log [--oneline] [--format=fuller] [-n N] [--all] [-p] [브랜치|커밋]', 'git show [커밋]', 'git branch [-a] [-v]', 'git status', 'git -C <경로> <명령>'], ['--format=fuller 는 작성 시각(AuthorDate)과 반영 시각(CommitDate)을 따로 보여 줍니다.', '커밋 본문 끝의 "Reviewed-by:" 같은 줄을 트레일러라고 부릅니다.', '저장소를 바꾸는 명령(commit, push, revert…)은 막혀 있습니다.'], ['git log --oneline -5', 'git log --format=fuller -1', 'git show HEAD', 'git branch -a']),
  P('df — 디스크 사용량', ['df [-h]'], ['Use% 가 100%에 가까우면 디스크가 꽉 찬 것입니다.'], ['df -h']),
  P('du — 디렉터리·파일이 차지한 크기', ['du [-s] [-h] [-a] [-c] [-d N] [경로...]'], ['-s  인자마다 합계 한 줄만', '-h  사람이 읽는 단위(K, M, G)', '-a  파일까지 한 줄씩', '-d N  N단계 깊이까지만', 'df 가 "어디가 찼나"라면 du 는 "그 안에서 누가 큰가"입니다. 큰 것으로 한 단계씩 내려가세요.'], ['du -sh /var/*', 'du -sh /var/log/*', 'du -ah /var/log/wiki']),
  P('hint — 힌트 패널 열기', ['hint'], ['작업 표시줄의 💡 힌트 패널을 엽니다. 칸마다 명시 힌트가 있고, 쓸 때마다 점수가 조금 깎입니다.'], ['hint']),
  P('free — 메모리 사용량', ['free [-h]'], [], ['free -h']),
  P('ulimit — 이 셸의 자원 한도', ['ulimit -n     (열 수 있는 파일 수)', 'ulimit -a     (전체)', 'ulimit -Hn    (하드 한도)'], ['지금 이 셸(bash) 프로세스의 한도입니다. 이미 떠 있는 서비스의 한도는 다를 수 있습니다:', '  systemctl show <서비스> -p LimitNOFILE', '  cat /proc/<PID>/limits'], ['ulimit -n', 'cat /proc/$(pgrep -f payment-api)/limits']),
  P('ss — 소켓(네트워크 연결) 보기', ['ss -s', 'ss -tan    (TCP 전체, 숫자로)', 'ss -ltn    (대기 중인 포트)', 'sudo ss -tanp  (프로세스까지)'], ['TCP 연결 하나도 프로세스 입장에서는 열린 파일(fd) 하나입니다.'], ['ss -s', 'ss -tan | wc -l']),
  P('last — 로그인 기록', ['last [사용자] [-n N]'], ['/var/log/wtmp 를 읽어 접속 시각과 출발지를 보여 줍니다. VPN 주소로 들어온 사람도 여기 남습니다.'], ['last', 'last sjkang']),
  P('sudo — 관리자 권한으로 실행', ['sudo <명령>'], ['조사 모드에서는 읽기 명령(cat, ls, grep, head, tail, less, journalctl, crontab -l, ss, find…)만 허용됩니다.', '허용 여부와 상관없이 모든 sudo 사용은 /var/log/auth.log 에 기록됩니다.'], ['sudo ls /home/sjkang', 'sudo cat /home/sjkang/.bash_history']),
  P('systemctl — 서비스 상태 보기', ['systemctl status <유닛>', 'systemctl show <유닛> [-p 속성[,속성]]', 'systemctl cat <유닛>', 'systemctl list-units | list-timers'], ['LimitNOFILE = 서비스가 열 수 있는 파일(fd) 최대 개수.', '변경 명령(restart, edit…)은 막혀 있습니다.'], ['systemctl status payment-api', 'systemctl show payment-api -p LimitNOFILE,MainPID']),
  P('ps / pgrep — 프로세스 찾기', ['ps aux', 'pgrep [-f] [-a] 패턴'], ['-f 는 전체 명령줄에서 찾습니다.'], ['pgrep -f payment-api', 'ps aux | grep java']),
  P('curl — HTTP 요청', ['curl [-s] [-S] [-v] [-k] [-I] URL'], ['조사 모드에서는 서버 안에서 열린 주소만 응답합니다.', 'https:// 주소는 TLS 핸드셰이크부터 합니다. -v 는 그 과정을(서버가 내보낸 인증서의 start date / expire date 포함) 표준 에러로 보여 줍니다.', '인증서를 믿을 수 없으면 curl: (60) 으로 멈춥니다. -k 는 검사를 건너뛰고 계속합니다(확인용으로만).', '-s 는 조용히, -S 는 -s 와 같이 쓰면 오류만 보여 줍니다. -I 는 응답 헤더만.'], ['curl -s localhost:8080/metrics | grep fds', 'curl -v https://www.example.com/', 'curl -vk https://www.example.com/ 2>&1 | grep date']),
  P('openssl — 인증서 파일 읽기 (x509)', ['openssl x509 -in 파일 -noout [-dates] [-enddate] [-startdate] [-subject] [-issuer] [-serial] [-text]', 'openssl x509 -in 파일 -noout -checkend 초'], ['PEM 인증서 파일의 내용을 사람이 읽는 형태로 보여 줍니다. -noout 이 없으면 끝에 인증서 본문(BEGIN CERTIFICATE …)도 다시 찍습니다.', 'notBefore / notAfter 는 유효 기간의 시작과 끝입니다. 시각은 GMT(UTC) — 한국 시각은 9시간을 더합니다.', '-checkend N: 지금부터 N초 안에 끝나면 "Certificate will expire"(종료 코드 1).', '파일 속 인증서와 서버가 지금 내보내는 인증서는 다를 수 있습니다. 서버 쪽은 curl -v https://… 의 expire date.', '조사 모드에서는 x509 만 쓸 수 있습니다.'], ['openssl x509 -in /etc/ssl/certs/example.pem -noout -dates', 'openssl x509 -in site.crt -noout -subject -issuer', 'openssl x509 -in site.crt -noout -checkend 86400']),
  P('ping — 네트워크 연결 확인', ['ping [-c N] 호스트'], [], ['ping -c 2 bastion']),
  P('ssh — 다른 서버 접속', ['ssh <호스트>', 'ssh <호스트> \'명령\'   (그 서버에서 명령 하나만 실행)'], ['접속할 수 있는 호스트는 ~/.ssh/config 에 있습니다. 돌아올 때는 exit.'], ['ssh bastion', "ssh pay-api-01 'uptime'"]),
  P('getent — 사용자/그룹 정보', ['getent group <이름>', 'getent passwd <이름>'], ['group 출력 형식: 이름:x:GID:구성원1,구성원2'], ['getent group adm']),
  P('id / whoami / hostname / date / uptime / echo', ['id', 'whoami', 'hostname', 'date', 'uptime', 'echo 텍스트'], ['지금 누구로, 어디서, 언제 접속해 있는지 확인합니다.'], ['id', 'date']),
  P('which — 명령이 어디 있는 파일인지', ['which [-a] 명령...', 'type 명령   (bash 내장: 별칭·내장 명령까지)'], ['PATH 의 디렉터리를 앞에서부터 찾아, 처음 찾은 파일의 경로를 보여 줍니다.', '못 찾으면 아무것도 출력하지 않고 종료 코드 1 — 그 PATH 로는 "command not found" 가 납니다.', '같은 이름이라도 PATH 가 다르면(예: cron) 결과가 다릅니다.'], ['which crontab', 'echo $PATH', 'env -i PATH=/usr/bin:/bin which crontab']),
  P('env — 환경 변수 보기, 바꾼 환경으로 실행', ['env', 'env [-i] [이름=값...] 명령 [인자...]', 'printenv [이름]'], ['인자 없이: 지금 셸의 환경 변수 전부.', '-i 는 빈 환경에서 시작합니다. 이름=값 으로 그 명령에만 변수를 줍니다.', '참고: $PATH 같은 변수는 env 가 실행되기 전에 지금 셸이 먼저 바꿔 넣습니다. 바뀐 PATH 를 보려면 env 의 출력이나 which 를 보세요.'], ['env | grep PATH', 'printenv HOME', 'env -i PATH=/usr/bin:/bin which wikictl']),
  P('cron — 예약 작업을 실행하는 데몬', ['crontab -l   (내 예약 목록)', 'ls /etc/cron.d/   cat /etc/crontab   (시스템 예약)', 'journalctl -u cron   (언제 무엇을 실행했나)'], ['cron 은 로그인 셸이 아닙니다. ~/.bashrc 도 ~/.profile 도 읽지 않습니다.', '사용자 crontab 의 작업은 PATH=/usr/bin:/bin, SHELL=/bin/sh, 작업 디렉터리 = 홈 으로 실행됩니다.', '/etc/crontab 맨 위의 PATH= 줄은 그 파일 안의 줄에만 적용됩니다.', '출력(표준 출력·에러)은 MAILTO 로 메일을 보내려 합니다. 메일 서버가 없으면 버려지고 저널에 "No MTA installed, discarding output" 이 남습니다.', '실행 기록: "(사용자) CMD (명령)". 종료 코드는 기록하지 않습니다 — 실패해도 조용합니다.'], ['journalctl -u cron --since "2026-11-11 00:00"', 'crontab -l', 'cat /etc/crontab']),
  P('man — 설명서', ['man <명령>'], ['help 로 설치된 명령 목록을 볼 수 있습니다.'], ['man journalctl']),
];

const alias: Record<string, string> = {
  more: 'less', uniq: 'sort / uniq', sort: 'sort / uniq', pgrep: 'ps / pgrep', ps: 'ps / pgrep',
  id: 'id / whoami', whoami: 'id / whoami', type: 'which', printenv: 'env', crond: 'cron', hostname: 'id / whoami', date: 'id / whoami', uptime: 'id / whoami', echo: 'id / whoami',
};

export const MAN = pages;

export function manFor(cmd: string): string[] | null {
  const key = alias[cmd] ?? cmd;
  const p = pages.find((x) => x.name.split(' — ')[0] === key || x.name.startsWith(key + ' '));
  if (!p) return null;
  const upper = cmd.toUpperCase();
  return [
    `${upper}(1)                      조사 모드 설명서                      ${upper}(1)`,
    '',
    '이름',
    `    ${p.name}`,
    '',
    '사용법',
    ...p.synopsis.map((s) => '    ' + s),
    ...(p.desc.length ? ['', '설명', ...p.desc.map((s) => '    ' + s)] : []),
    ...(p.examples.length ? ['', '예시', ...p.examples.map((s) => '    $ ' + s)] : []),
  ];
}
