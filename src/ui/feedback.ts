import { h } from './dom.ts';
import { t } from '../i18n.ts';

/**
 * The game repo's GitHub issue chooser: bugs, next-incident ideas, contributions.
 * Exact URL, no query string: nothing about the player or the case goes with the click.
 */
export const FEEDBACK_URL = 'https://github.com/s3onghyun/no-handover/issues/new/choose';

/** "💬 의견·기여": a plain link that opens the chooser in a new tab (lock screen, ❓ help). */
export function feedbackLink(): HTMLAnchorElement {
  return h(
    'a.feedback-link',
    { href: FEEDBACK_URL, target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('feedback.aria') },
    `💬 ${t('feedback.link')}`,
  );
}

/** One quiet line under a result screen: "막힌 곳이나 다음 사건 아이디어를 GitHub 이슈로 남겨 주세요" + the link. */
export function feedbackLine(): HTMLElement {
  return h('p.feedback-line', null, `${t('feedback.line')} `, feedbackLink());
}
