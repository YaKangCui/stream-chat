import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

/** 兜住渲染期异常，避免整个应用白屏；真实项目这里还会上报 Sentry。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error('[ErrorBoundary]', error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="crash">
          <p>页面出错了 😵</p>
          <button onClick={() => location.reload()}>刷新重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}
