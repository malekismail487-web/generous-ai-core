/**
 * Lumina Structured Logger
 * 
 * Professional logging infrastructure for the Lumina adaptive learning platform.
 * Replaces console.* statements with structured, environment-aware logging.
 * 
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Environment-based filtering
 * - Structured JSON output for production
 * - Stack trace inclusion for errors
 * - Context enrichment
 * - Safe for production use
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string | number;
  };
  userId?: string;
  sessionId?: string;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  includeStack?: boolean;
  jsonOutput?: boolean;
  prefix?: string;
}

class Logger {
  private minLevel: LogLevel;
  private includeStack: boolean;
  private jsonOutput: boolean;
  private prefix: string;
  
  private levelPriority: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  constructor(options: LoggerOptions = {}) {
    const isDevelopment = import.meta.env.DEV;
    
    this.minLevel = options.minLevel ?? (isDevelopment ? 'DEBUG' : 'INFO');
    this.includeStack = options.includeStack ?? !isDevelopment;
    this.jsonOutput = options.jsonOutput ?? !isDevelopment;
    this.prefix = options.prefix ?? '[Lumina]';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatContext(context: LogContext): string | object {
    if (this.jsonOutput) {
      return JSON.stringify(context);
    }
    
    const parts = [
      `${this.prefix}[${context.level}]`,
      `${new Date(context.timestamp).toISOString()}`,
      `[${context.module}]`,
      context.message
    ];

    if (context.data) {
      parts.push(JSON.stringify(context.data));
    }

    if (context.error) {
      parts.push(`Error: ${context.error.message}`);
      if (context.error.stack && this.includeStack) {
        parts.push(`\n${context.error.stack}`);
      }
    }

    return parts.join(' ');
  }

  private log(level: LogLevel, module: string, message: string, data?: Record<string, any>, error?: Error) {
    if (!this.shouldLog(level)) {
      return;
    }

    const context: LogContext = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      ...(data && { data }),
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          code: (error as any).code
        }
      })
    };

    const formatted = this.formatContext(context);

    switch (level) {
      case 'DEBUG':
        console.log(formatted);
        break;
      case 'INFO':
        console.info(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      case 'ERROR':
        console.error(formatted);
        break;
    }

    // In production, you might want to send errors to an external service
    if (level === 'ERROR' && !import.meta.env.DEV) {
      // TODO: Integrate with error tracking service (e.g., Sentry)
      // This is where you'd send the error to your monitoring service
      // Example: Sentry.captureException(error, { tags: { module, level } });
    }
  }

  debug(module: string, message: string, data?: Record<string, any>) {
    this.log('DEBUG', module, message, data);
  }

  info(module: string, message: string, data?: Record<string, any>) {
    this.log('INFO', module, message, data);
  }

  warn(module: string, message: string, data?: Record<string, any>) {
    this.log('WARN', module, message, data);
  }

  error(module: string, message: string, error?: Error, data?: Record<string, any>) {
    this.log('ERROR', module, message, data, error);
  }

  /**
   * Create a child logger with a specific module prefix
   */
  child(module: string): ModuleLogger {
    return new ModuleLogger(this, module);
  }

  /**
   * Temporarily change log level
   */
  withLevel<T>(level: LogLevel, fn: () => T): T {
    const previousLevel = this.minLevel;
    this.minLevel = level;
    try {
      return fn();
    } finally {
      this.minLevel = previousLevel;
    }
  }
}

class ModuleLogger {
  constructor(
    private logger: Logger,
    private module: string
  ) {}

  debug(message: string, data?: Record<string, any>) {
    this.logger.debug(this.module, message, data);
  }

  info(message: string, data?: Record<string, any>) {
    this.logger.info(this.module, message, data);
  }

  warn(message: string, data?: Record<string, any>) {
    this.logger.warn(this.module, message, data);
  }

  error(message: string, error?: Error, data?: Record<string, any>) {
    this.logger.error(this.module, message, error, data);
  }
}

// Create default logger instance
const defaultLogger = new Logger();

// Export convenience functions for common modules
export const logger = defaultLogger;

export const createLogger = (module: string): ModuleLogger => {
  return defaultLogger.child(module);
};

// Pre-created loggers for common modules
export const authLogger = createLogger('auth');
export const apiLogger = createLogger('api');
export const adaptiveLogger = createLogger('adaptive');
export const uiLogger = createLogger('ui');
export const dbLogger = createLogger('database');
export const componentLogger = createLogger('component');

/**
 * Utility function to safely handle errors in async operations
 * Replaces try-catch blocks with console.error
 */
export async function safeAsync<T>(
  operation: Promise<T>,
  module: string,
  errorMessage: string,
  fallbackValue?: T
): Promise<T | undefined> {
  try {
    return await operation;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    defaultLogger.error(module, errorMessage, err);
    return fallbackValue;
  }
}

/**
 * Higher-order function to wrap async functions with error logging
 */
export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  module: string,
  errorMessage: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      defaultLogger.error(module, errorMessage, err);
      throw error; // Re-throw after logging
    }
  }) as T;
}

export default defaultLogger;
