import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    console.error("UI error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    const { children, title = "React runtime error" } = this.props;
    const { error, errorInfo } = this.state;

    if (!error) {
      return children;
    }

    return (
      <div className="w-full overflow-auto rounded-lg border border-red-500 bg-red-50 p-4 text-left text-red-700">
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        <p className="mb-2 font-semibold">{error.message || "Unknown runtime error"}</p>
        {error.stack && (
          <pre className="mb-3 whitespace-pre-wrap break-words rounded border border-red-200 bg-white p-3 text-xs">
            {error.stack}
          </pre>
        )}
        {errorInfo?.componentStack && (
          <pre className="whitespace-pre-wrap break-words rounded border border-red-200 bg-white p-3 text-xs">
            {errorInfo.componentStack}
          </pre>
        )}
      </div>
    );
  }
}
