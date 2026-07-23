import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to structured logging system
    console.error('AppErrorBoundary caught an error:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default friendly error UI
      return (
        <Card className="m-4 p-6 max-w-md mx-auto border-red-200 bg-red-50">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-red-900">
                Oops! Something went wrong
              </h2>
              <p className="text-red-700 text-sm leading-relaxed">
                Don't worry! The rest of the app is still working fine. 
                This part had a temporary issue, but everything else is safe.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                onClick={this.handleReset}
                variant="outline"
                className="border-red-300 hover:bg-red-100"
              >
                Try Again
              </Button>
              <Button 
                onClick={this.handleReload}
                className="bg-red-600 hover:bg-red-700"
              >
                Refresh Page
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="w-full mt-4 pt-4 border-t border-red-200">
                <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                  Technical Details (Dev Only)
                </summary>
                <pre className="mt-2 p-3 bg-red-100 rounded text-xs text-red-800 overflow-auto max-h-48">
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
