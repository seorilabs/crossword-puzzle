import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatReturnReminderPrepromptBody } from "../../packages/crossword-core/src";
import { ReturnReminderPrepromptCard } from "./ReturnReminderPrepromptCard";

describe("ReturnReminderPrepromptCard", () => {
  it("core 문구로 제목·본문을 보여 주고 수락·보류를 각각 호출한다", () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(
      <ReturnReminderPrepromptCard
        body={formatReturnReminderPrepromptBody(3)}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );

    expect(
      screen.getByText("내일 새 퍼즐이 나오면 알려드릴게요"),
    ).toBeTruthy();
    expect(
      screen.getByText("🔥 3일 연속 기록 지키기 · 매일 아침 9시 알림"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "알림 받기" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "괜찮아요" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
