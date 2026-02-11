import React from 'react';

type State = {
  hasError: boolean;
  error?: Error | null;
};

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // Log to console — could be replaced with remote logging
    console.error('Uncaught error in React tree:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-[#071024] text-slate-100 p-6">
          <div className="max-w-2xl text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="mb-4">An unexpected error occurred. The application was able to recover and you can continue using the UI.</p>
            <details className="text-xs text-slate-400 whitespace-pre-wrap">
              {this.state.error?.message}
            </details>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}
