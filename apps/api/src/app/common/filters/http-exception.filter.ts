import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export class ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  method: string;
}

interface ExceptionResponse {
  message?: string;
  error?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as ExceptionResponse;
        message = responseObj.message || message;
        error = responseObj.error || error;
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    // Log the error
    if (status >= 500) {
      const errorMessage = exception instanceof Error ? exception.message : 'Unknown error';
      const errorStack = exception instanceof Error ? exception.stack : '';
      this.logger.error(
        `${request.method} ${request.url} ${status} Error: ${errorMessage}\n${errorStack}`,
      );
      // Also log the full exception object for debugging
      console.error('Full exception details:', exception);
    } else if (status >= 400) {
      const errorMessage = exception instanceof Error ? exception.message : 'Unknown error';
      this.logger.warn(
        `${request.method} ${request.url} ${status} Error: ${errorMessage}`,
      );
      // Log warning details to console
      console.warn('Warning details:', exception);
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    response.status(status).json(errorResponse);
  }
}
