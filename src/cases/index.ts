// The season-1 ladder (docs/campaign-ladder.md): Case 0 (tutorial) to Case 4 (the season finale).
import type { CampaignEntry } from '../engine/campaign.ts';
import { caseZeroWiki } from './case-0-wiki.ts';
import { caseOneCron } from './case-1-cron.ts';
import { caseTwoDeleted } from './case-2-deleted.ts';
import { caseFriday1802 } from './friday-1802.ts';
import { caseFourKeys } from './case-4-keys.ts';

export const CAMPAIGN: CampaignEntry[] = [
  { slot: 0, id: caseZeroWiki.id, title: caseZeroWiki.title, when: '11/10 (화)', principle: '로그는 디스크를 채운다 — df · du · tail · systemctl status', tutorial: true, cs: caseZeroWiki },
  { slot: 1, id: caseOneCron.id, title: caseOneCron.title, when: '11/11 (수)', principle: 'cron은 로그인 셸이 아니다 — PATH · 환경 변수', cs: caseOneCron },
  { slot: 2, id: caseTwoDeleted.id, title: caseTwoDeleted.title, when: '11/12 (목)', principle: '지운 파일도 열려 있으면 공간을 차지한다 — /proc/<PID>/fd', cs: caseTwoDeleted },
  { slot: 3, id: caseFriday1802.id, title: caseFriday1802.title, when: '11/16 (월)', principle: '프로세스마다 열린 파일 한도, 소켓도 파일 — LimitNOFILE', cs: caseFriday1802 },
  { slot: 4, id: caseFourKeys.id, title: caseFourKeys.title, when: '11/23 (월)', principle: 'SSH 키는 서버마다 남는다 — 계정 회수 ≠ 키 회수', cs: caseFourKeys },
];
