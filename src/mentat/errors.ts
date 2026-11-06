/**
 * MentatApiError: the backend answered with an error status
 * MentatUnavailableError: no answer at all (down, timeout, DNS)
 * MentatContractError: it answered 200, but not in the shape we expect
 */

export class MentatError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = new.target.name;
    this.retryable = retryable;
  }
}

export class MentatApiError extends MentatError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    // 429 and 5xx -- retry; 4xx -- request is wrong.
    super(message, status === 429 || status >= 500);
  }
}

export class MentatUnavailableError extends MentatError {
  readonly timedOut: boolean;

  constructor(message: string, timedOut = false) {
    super(message, true);
    this.timedOut = timedOut;
  }
}

export class MentatContractError extends MentatError {
  constructor(message: string) {
    super(message, false);
  }
}

export class MentatNotConfiguredError extends MentatError {
  constructor(message: string) {
    super(message, false);
  }
}
