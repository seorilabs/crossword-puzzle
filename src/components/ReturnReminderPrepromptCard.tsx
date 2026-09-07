import { RETURN_REMINDER_PREPROMPT_COPY } from "../../packages/crossword-core/src";

export type ReturnReminderPrepromptCardProps = {
  body: string;
  onAccept: () => void;
  onDecline: () => void;
};

// 완료 축하 다이얼로그 안의 복귀 알림 사전 안내. 시스템 동의 다이얼로그(AIT 스마트
// 발송 동의)는 한 번 거부되면 되돌리기 어려우므로 스트릭 프레이밍으로 가치를 먼저
// 보여 주고, "알림 받기"를 누른 사용자에게만 시스템 다이얼로그를 띄운다. 문구는 core
// (RETURN_REMINDER_PREPROMPT_COPY / formatReturnReminderPrepromptBody)가 만든다.
export function ReturnReminderPrepromptCard({
  body,
  onAccept,
  onDecline,
}: ReturnReminderPrepromptCardProps) {
  return (
    <section
      className="returnReminderPreprompt"
      aria-label="복귀 알림 안내"
      role="group"
    >
      <p className="returnReminderPrepromptTitle">
        {RETURN_REMINDER_PREPROMPT_COPY.title}
      </p>
      <p className="returnReminderPrepromptBody">{body}</p>
      <div className="returnReminderPrepromptActions">
        <button
          className="primaryButton returnReminderPrepromptAccept"
          type="button"
          onClick={onAccept}
        >
          {RETURN_REMINDER_PREPROMPT_COPY.accept}
        </button>
        <button
          className="secondaryButton returnReminderPrepromptDecline"
          type="button"
          onClick={onDecline}
        >
          {RETURN_REMINDER_PREPROMPT_COPY.decline}
        </button>
      </div>
    </section>
  );
}
