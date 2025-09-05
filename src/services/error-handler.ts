export enum ErrorCode {
  CHROME_NOT_AVAILABLE = 'CHROME_NOT_AVAILABLE',
  TARGET_NOT_FOUND = 'TARGET_NOT_FOUND',
  EVALUATION_TIMEOUT = 'EVALUATION_TIMEOUT',
  EVALUATION_ERROR = 'EVALUATION_ERROR',
  CDP_CONNECTION_ERROR = 'CDP_CONNECTION_ERROR',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface LogContext {
  service?: string
  method?: string
  requestId?: string
  targetId?: string
  [key: string]: any
}

export class Logger {
  private context: LogContext

  constructor(context: LogContext = {}) {
    this.context = context
  }

  private formatMessage(level: string, message: string, extra?: any): string {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...(extra && { extra }),
    }
    return JSON.stringify(logEntry)
  }

  debug(message: string, extra?: any): void {
    console.debug(this.formatMessage('debug', message, extra))
  }

  info(message: string, extra?: any): void {
    console.info(this.formatMessage('info', message, extra))
  }

  warn(message: string, extra?: any): void {
    console.warn(this.formatMessage('warn', message, extra))
  }

  error(message: string, extra?: any): void {
    console.error(this.formatMessage('error', message, extra))
  }

  withContext(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext })
  }
}

export class ErrorHandler {
  private static logger = new Logger({ service: 'ErrorHandler' })

  static detectErrorCode(error: any): ErrorCode {
    const message = error?.message || error?.toString() || ''

    // Connection-related errors
    if (message.includes('ECONNREFUSED') || message.includes('connect ECONNREFUSED')) {
      return ErrorCode.CHROME_NOT_AVAILABLE
    }

    if (message.includes('CDP connection') || message.includes('Chrome DevTools')) {
      return ErrorCode.CDP_CONNECTION_ERROR
    }

    // Target-related errors
    if (message.includes('No suitable browser target') || message.includes('TARGET_NOT_FOUND')) {
      return ErrorCode.TARGET_NOT_FOUND
    }

    // Evaluation-related errors
    if (message.includes('timeout') || message.includes('EVALUATION_TIMEOUT')) {
      return ErrorCode.EVALUATION_TIMEOUT
    }

    if (message.includes('evaluation') || message.includes('EVALUATION_ERROR')) {
      return ErrorCode.EVALUATION_ERROR
    }

    // Configuration and security
    if (message.includes('configuration') || message.includes('config')) {
      return ErrorCode.INVALID_CONFIGURATION
    }

    if (
      message.includes('security') ||
      (message.includes('localhost') && message.includes('only'))
    ) {
      return ErrorCode.SECURITY_VIOLATION
    }

    return ErrorCode.UNKNOWN_ERROR
  }

  static mapError(error: unknown): Error {
    const originalError = error instanceof Error ? error : new Error(String(error))
    const errorCode = this.detectErrorCode(originalError)

    const mappedMessage = this.getErrorMessage(errorCode, originalError.message)
    const mappedError = new Error(`${errorCode}: ${mappedMessage}`)

    // Preserve original stack trace
    mappedError.stack = originalError.stack
    mappedError.cause = originalError

    this.logger.error('Error mapped', {
      originalMessage: originalError.message,
      errorCode,
      mappedMessage,
    })

    return mappedError
  }

  static getErrorMessage(errorCode: ErrorCode, originalMessage?: string): string {
    const errorMessages = {
      [ErrorCode.CHROME_NOT_AVAILABLE]:
        'Chrome browser with remote debugging is not available. Ensure Chrome is running with --remote-debugging-port=9222',
      [ErrorCode.TARGET_NOT_FOUND]:
        'No suitable browser target found. No Chrome tab/window available for connection',
      [ErrorCode.EVALUATION_TIMEOUT]:
        'JavaScript evaluation timed out. Expression took longer than specified timeout to complete',
      [ErrorCode.EVALUATION_ERROR]:
        'JavaScript evaluation failed. Syntax error or runtime exception in evaluated expression',
      [ErrorCode.CDP_CONNECTION_ERROR]:
        'Chrome DevTools Protocol connection failed. Unable to establish or maintain connection to Chrome',
      [ErrorCode.INVALID_CONFIGURATION]:
        'Invalid plugin configuration. Check your plugin options and defaults',
      [ErrorCode.SECURITY_VIOLATION]:
        'Security violation. CDP connections are restricted to localhost only in development mode',
      [ErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred',
    }

    const baseMessage = errorMessages[errorCode]
    return originalMessage ? `${baseMessage}. Details: ${originalMessage}` : baseMessage
  }

  static formatErrorResponse(error: unknown): any {
    const mappedError = this.mapError(error)
    const errorCode = this.detectErrorCode(mappedError)

    return {
      error: true,
      code: errorCode,
      message: mappedError.message,
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }
  }

  static logCDPEvent(eventType: string, data: any, logger: Logger): void {
    logger.debug(`CDP event: ${eventType}`, {
      eventType,
      dataPreview: JSON.stringify(data).substring(0, 200) + '...',
    })
  }

  static logMCPRequest(toolName: string, args: any, duration: number, logger: Logger): void {
    logger.info(`MCP tool called: ${toolName}`, {
      toolName,
      argsPreview: JSON.stringify(args).substring(0, 100) + '...',
      duration: `${duration}ms`,
    })
  }

  static extractStackTrace(cdpError: any): string | undefined {
    if (cdpError?.exceptionDetails?.stackTrace?.callFrames) {
      const frames = cdpError.exceptionDetails.stackTrace.callFrames
      return frames
        .map(
          (frame: any) =>
            `    at ${frame.functionName || 'anonymous'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`,
        )
        .join('\n')
    }

    if (cdpError?.exceptionDetails?.exception?.description) {
      return cdpError.exceptionDetails.exception.description
    }

    return undefined
  }

  static createGracefulDegradationWarning(service: string, error: any): string {
    const logger = new Logger({ service })
    const errorCode = this.detectErrorCode(error)

    const warnings = {
      [ErrorCode.CHROME_NOT_AVAILABLE]:
        'Chrome DevTools not available - some debugging features will be limited',
      [ErrorCode.CDP_CONNECTION_ERROR]: 'CDP connection issues detected - will retry automatically',
      [ErrorCode.TARGET_NOT_FOUND]: 'No Chrome targets found - will create new tab if possible',
    }

    const warningMessage =
      warnings[errorCode] || 'Service degraded - some features may not work properly'

    logger.warn(warningMessage, { originalError: error?.message })

    return warningMessage
  }
}
