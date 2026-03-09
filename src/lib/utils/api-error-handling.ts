import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
}

export class ApiError extends Error {
  statusCode: number;
  message: string;
  error: string;
  constructor(
    statusCode: number,
    message: string,
    error: string = "API Error"
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.message = message;
    this.error = error;
  }
}

export function createApiError(
  statusCode: number,
  message: string,
  error?: string
): ApiErrorResponse {
  return {
    error: error || "API Error",
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };
}

export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  console.error("API Error:", error);

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const message = JSON.stringify(error);
    return NextResponse.json(
      createApiError(400, `Validation error: ${message}`, "Validation Error"),
      { status: 400 }
    );
  }

  // Handle custom API errors
  if (error instanceof ApiError) {
    return NextResponse.json(
      createApiError(error.statusCode, error.message, error.error),
      { status: error.statusCode }
    );
  }

  // Handle generic errors
  if (error instanceof Error) {
    return NextResponse.json(
      createApiError(500, error.message, "Internal Server Error"),
      { status: 500 }
    );
  }

  // Handle unknown errors
  return NextResponse.json(
    createApiError(
      500,
      "Ein unbekannter Fehler ist aufgetreten",
      "Unknown Error"
    ),
    { status: 500 }
  );
}

export function withApiErrorHandling<T extends unknown[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R | NextResponse<ApiErrorResponse>> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}
