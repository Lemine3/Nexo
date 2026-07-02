import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Normalizes all thrown errors into an RFC 7807-flavored Problem Details
 * body, per docs/srs/12-api-integration-infra.md §12.1.2, so every client
 * (storefront, back-office, future mobile apps) can handle errors uniformly.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let errors: Array<{ field?: string; code?: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        title = exception.name;
        detail = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        title = (b.error as string) ?? exception.name;
        detail = Array.isArray(b.message) ? undefined : (b.message as string);
        if (Array.isArray(b.message)) {
          errors = (b.message as string[]).map((message) => ({ message }));
        }
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    response.status(status).json({
      type: `https://docs.nexo.dev/errors/${status}`,
      title,
      status,
      detail,
      instance: request.url,
      errors,
    });
  }
}
