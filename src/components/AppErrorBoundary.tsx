import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

// 렌더 중 예외가 나면 React 트리 전체가 언마운트되어 빈 화면 + 조작 불가 상태가
// 된다. 미니앱은 별도 크래시 리포터가 없으므로, 최상위 ErrorBoundary로 예외를
// 붙잡아 사용자가 다시 시도할 수 있는 폴백 UI를 보여주고, 콘솔에 에러를 남겨
// 검수/재현 시 원인을 확인할 수 있게 한다.
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="appErrorBoundary" role="alert">
        <p className="appErrorBoundaryTitle">일시적인 오류가 발생했어요</p>
        <p className="appErrorBoundaryDescription">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 앱을 다시 열어주세요.
        </p>
        <button
          className="appErrorBoundaryButton"
          type="button"
          onClick={this.handleReset}
        >
          다시 시도
        </button>
      </div>
    );
  }
}
