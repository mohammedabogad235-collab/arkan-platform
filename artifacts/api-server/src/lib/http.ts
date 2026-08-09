import type { NextFunction, Request, RequestHandler, Response } from "express";

export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options?: {
      code?: string;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;

    if (options?.cause !== undefined) {
      Object.assign(this, { cause: options.cause });
    }
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getErrorMessage(error: unknown, fallback = "حدث خطأ غير متوقع"): string {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
