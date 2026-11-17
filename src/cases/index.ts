// The season-1 ladder (docs/campaign-ladder.md). Placeholders have a title and no case data yet.
import type { CampaignEntry } from '../engine/campaign.ts';
import { caseZeroWiki } from './case-0-wiki.ts';
import { caseFriday1802 } from './friday-1802.ts';

export const CAMPAIGN: CampaignEntry[] = [
  { slot: 0, id: caseZeroWiki.id, title: caseZeroWiki.title, when: '11/10 (화)', principle: '로그는 디스크를 채운다 — df · du · tail · systemctl status', tutorial: true, cs: caseZeroWiki },
  { slot: 1, id: 'case1-cron-env', title: '밤에만 실패하는 스크립트', when: '11/11 (수)', principle: 'cron은 로그인 셸이 아니다 — PATH · 환경 변수' },
  { slot: 2, id: 'case2-deleted-open', title: '지웠는데 안 비워지는 디스크', when: '11/12 (목)', principle: '지운 파일도 열려 있으면 공간을 차지한다 — /proc/<PID>/fd' },
  { slot: 3, id: caseFriday1802.id, title: caseFriday1802.title, when: '11/16 (월)', principle: '프로세스마다 열린 파일 한도, 소켓도 파일 — LimitNOFILE', cs: caseFriday1802 },
  { slot: 4, id: 'case4-keys', title: '남아 있는 열쇠', when: '11/23 (월)', principle: 'SSH 키는 서버마다 남는다 — 계정 회수 ≠ 키 회수' },
];
