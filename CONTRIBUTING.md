# 기여 안내 · Contributing

[한국어](#한국어) · [English](#english)

이슈 열기 / Open an issue: https://github.com/s3onghyun/no-handover/issues/new/choose
게임 / Play: https://no-handover.vercel.app/

---

## 한국어

No Handover는 퇴사한 선배의 PC로 서버 장애 원인을 찾는 브라우저 게임입니다. 버그 제보, 다음 사건 아이디어, "현실에선 이렇지 않아요" 지적, 코드 PR 모두 환영합니다.

### 버그 제보

[🐞 버그](https://github.com/s3onghyun/no-handover/issues/new?template=bug.yml) 양식을 써 주세요. 있으면 좋은 것:

- 사건 번호(Case 0–4)와 어디서 생겼는지(터미널, 메신저, 보고서, 증거 보드 …)
- 친 명령이나 누른 것, 기대한 결과와 실제 결과
- 브라우저·OS·화면 크기, 스크린샷
- 플레이 로그: 작업 표시줄 📋 → "플레이 로그 JSON 저장". 로그는 서버로 보내지지 않고 내 기기에만 저장됩니다. 붙이기 전에 열어 보고 개인 정보가 없는지 확인하세요.

### 새 사건 제안

[💡 다음 사건 아이디어](https://github.com/s3onghyun/no-handover/issues/new?template=idea.yml) 양식을 써 주세요. 사건 하나에 필요한 것:

1. **증상**: 누가 무엇을 보고 알았나("위키가 안 열려요", "밤에만 실패해요").
2. **진짜 원인**: 실제 시스템에서 일어날 수 있는 원인 하나. 사건마다 원리 하나(예: cron은 로그인 셸이 아니다, 지운 파일도 열려 있으면 공간을 차지한다).
3. **단서의 길**: 증상에서 원인까지 플레이어가 따라갈 흔적(로그 줄, history, crontab, 메신저, 메일 …). 단서만으로 풀 수 있어야 공정합니다. 운이나 숨은 지식이 필요하면 안 됩니다.
4. **현실의 확인 명령**: 실제 서버에서 이 원인을 확인하는 명령과 그 출력 모양(`df -h`, `ls -l /proc/<PID>/fd`, `systemctl show -p LimitNOFILE` …). 해설의 "현업에서는 이렇게 확인한다" 카드가 됩니다.
5. **가상의 이름만**: 회사·사람·서버·도메인은 지어낸 것만(`.example` 도메인, 사설 IP).

사건 데이터 형식은 [`docs/case-format.md`](docs/case-format.md), 사건 순서는 [`docs/campaign-ladder.md`](docs/campaign-ladder.md)에 있습니다. 사건 하나 = `src/cases/` 파일 하나입니다.

### 현실 점검

게임 속 명령 출력, 로그 형식, 장애 원인이 실제와 다르면 [🧭 현실 점검](https://github.com/s3onghyun/no-handover/issues/new?template=reality-check.yml) 양식으로 알려 주세요. 실제 출력(가린 것)이나 문서 링크가 있으면 가장 좋습니다. 의도한 단순화는 README의 "알려진 단순화"에 있습니다.

### PR 흐름

1. 포크하고 브랜치를 만듭니다.
2. `npm install` 뒤 바꿉니다. 작은 PR 하나에 한 가지만.
3. 올리기 전에: `npm test`와 `npm run build`. UI를 바꿨으면 `npm run e2e`도(Playwright headless shell이 `~/.cache/ms-playwright`에 있어야 합니다. 없으면 PR에 못 돌렸다고 적어 주세요).
4. PR 설명에 무엇을, 왜 바꿨는지와 어떻게 확인했는지 적습니다.

AI 도구로 만든 PR도 환영합니다. 단, 올린 사람이 내용을 직접 읽고 확인한 것이어야 합니다.

### 목소리·음악·그림

동료 대사에는 음성 파일이 붙습니다. 기여자는 음성·음악·그림 파일을 직접 추가하지 않습니다. 대사는 텍스트로 제안하거나 PR에 텍스트로 넣으세요. 새 대사가 들어가면 `tests/voices.test.ts`가 "파일 없음"으로 실패하는데, PR에서는 그대로 두면 됩니다. 메인테이너가 같은 방식으로 음성을 만들어 넣습니다. 에셋의 출처와 조건은 [`ASSETS.md`](ASSETS.md).

### 스포일러 예절

- 이슈·PR **제목에 정답(원인)을 쓰지 마세요.** "Case 2 보고서 원인 칸 채점이 이상해요"는 좋고, 원인을 그대로 쓴 제목은 피해 주세요.
- 본문에서 정답이나 해법을 말해야 하면 접어 두세요:

  ```
  <details><summary>스포일러: Case 2 원인</summary>

  여기에 정답

  </details>
  ```

### 실제 데이터 금지

실제 회사·고객·동료 이름, 실제 서버 이름·IP·도메인, 실제 로그나 사내 문서, 비밀 키·토큰, 개인 정보는 이슈·PR·사건 데이터 어디에도 넣지 마세요. 실제 장애에서 아이디어를 얻었다면 원리만 남기고 모두 바꿔 주세요.

### 라이선스

코드 기여는 [MIT](LICENSE)로 배포됩니다.

---

## English

No Handover is a browser game where you take over a departed senior's PC and find the cause of a server outage. The game text is Korean; issues and PRs in English are welcome. Bug reports, ideas for the next incident, "that's not how it works in real life" notes and code PRs are all welcome.

### Reporting bugs

Use the [🐞 Bug](https://github.com/s3onghyun/no-handover/issues/new?template=bug.yml) form. Helpful:

- The case (0–4) and where it happened (terminal, messenger, report, evidence board …)
- The command you typed or what you clicked, what you expected, what happened
- Browser, OS, screen size, a screenshot
- The play log: taskbar 📋 → "플레이 로그 JSON 저장" (save play log). It is never sent anywhere; it is saved on your device. Open it and check it before attaching.

### Proposing a new incident

Use the [💡 Next incident idea](https://github.com/s3onghyun/no-handover/issues/new?template=idea.yml) form. A case needs:

1. **Symptom**: who noticed what ("the wiki won't open", "it only fails at night").
2. **Real root cause**: one cause that can happen on a real system, one principle per case (cron is not a login shell; a deleted file still takes space while it is open).
3. **Clue trail**: the traces a player follows from symptom to cause (log lines, shell history, crontab, chat, mail …). It must be solvable from the clues alone: no luck, no hidden knowledge.
4. **Real-world check commands**: the commands that confirm the cause on a real server and what their output looks like. They become the debrief's "how you check this at work" card.
5. **Fictional names only**: invented companies, people, hosts and domains (`.example` domains, private IPs).

The case data format is [`docs/case-format.md`](docs/case-format.md) (Korean), the case order is [`docs/campaign-ladder.md`](docs/campaign-ladder.md). One case = one file in `src/cases/`.

### Reality checks

If a command's output, a log format or an outage cause in the game differs from real life, use the [🧭 Reality check](https://github.com/s3onghyun/no-handover/issues/new?template=reality-check.yml) form. Real output (redacted) or a documentation link helps most. Intended simplifications are listed in the README under 알려진 단순화.

### Pull requests

1. Fork and create a branch.
2. `npm install`, then make the change. One thing per PR; small PRs.
3. Before pushing: `npm test` and `npm run build`. If you changed the UI, also `npm run e2e` (needs a Playwright headless shell in `~/.cache/ms-playwright`; if you can't run it, say so in the PR).
4. Say in the PR what changed, why, and how you checked it.

AI-assisted PRs are welcome if the author has read and checked them.

### Voices, music and art

Colleague lines come with voice files. Contributors don't add voice, music or image files directly: propose lines as text, or put them in your PR as text. A new line makes `tests/voices.test.ts` fail with a missing file; leave that in your PR and the maintainers generate the clip the same way as the others. Asset provenance and terms: [`ASSETS.md`](ASSETS.md).

### Spoiler etiquette

- **No answers (causes) in issue or PR titles.** "Case 2: report scoring looks wrong" is fine; a title that states the cause is not.
- If the body needs the answer or the solution, fold it:

  ```
  <details><summary>Spoiler: Case 2 cause</summary>

  the answer here

  </details>
  ```

### No real data

Never put real company, customer or colleague names, real hostnames/IPs/domains, real logs or internal documents, keys or tokens, or personal data into issues, PRs or case data. If an idea comes from a real incident, keep the principle and change everything else.

### License

Code contributions are released under the [MIT license](LICENSE).
