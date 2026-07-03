import { formatBestTime } from "../../packages/crossword-core/src";
import type { PersonalStats } from "../../packages/crossword-core/src";

type PersonalStatsCardProps = {
  stats: PersonalStats;
  consecutiveStreak: number;
};

// "내 기록" 누적 통계 요약 카드. 완료 1건 이상이면 지표(총 완료/완료율/현재
// 스트릭/노힌트 완료)와, 보유한 최고 기록이 있으면 실제 풀이 시간(최고·평균)을
// dt·dd로 보여준다. 0건이면 빈 상태 안내를 보여준다(스트릭이 있으면 격려 문구를
// 덧붙임). 집계는 상위에서 끝낸 순수 값만 받아 렌더만 담당하므로 헤드리스 컴포넌트
// 테스트로 분기를 고정할 수 있다.
export function PersonalStatsCard({
  stats,
  consecutiveStreak,
}: PersonalStatsCardProps) {
  const completionPercent = Math.round(stats.completionRate * 100);
  // 보유 최고 기록이 있을 때만 실제 시간을 노출한다. null 이면(빈 상태) 해당
  // 항목을 렌더하지 않아 00:00·NaN 이 노출되지 않는다.
  const hasBestTime = stats.fastestBestTimeMs != null;

  return (
    <section className="personalStatsCard" aria-label="내 기록 요약">
      <h2 className="personalStatsTitle">내 기록</h2>
      {stats.completedCount > 0 ? (
        <dl className="personalStatsGrid">
          <div className="personalStat">
            <dt>총 완료</dt>
            <dd>{stats.completedCount}판</dd>
          </div>
          <div className="personalStat">
            <dt>완료율</dt>
            <dd>{completionPercent}%</dd>
          </div>
          <div className="personalStat">
            <dt>현재 스트릭</dt>
            <dd>{consecutiveStreak}일</dd>
          </div>
          <div className="personalStat">
            <dt>노힌트 완료</dt>
            <dd>{stats.noHintCompletedCount}판</dd>
          </div>
          {hasBestTime && (
            <>
              <div className="personalStat">
                <dt>최고 기록</dt>
                <dd>{formatBestTime(stats.fastestBestTimeMs as number)}</dd>
              </div>
              <div className="personalStat">
                <dt>평균 기록</dt>
                <dd>{formatBestTime(stats.averageBestTimeMs as number)}</dd>
              </div>
            </>
          )}
        </dl>
      ) : (
        <p className="personalStatsEmpty">
          첫 퍼즐을 완료하면 누적 기록이 여기에 쌓여요.
          {consecutiveStreak > 0 ? ` 🔥 ${consecutiveStreak}일째 도전 중!` : ""}
        </p>
      )}
    </section>
  );
}
