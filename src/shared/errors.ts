import type { EscrowPaymentRequired } from "./types.js";

// ──────────────────────── Base Error ────────────────────────

export class X402Error extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "X402Error";
    this.code = code;
  }
}

// ──────────────────────── Client Errors ────────────────────────

/** Server returned 402 but the payment requirement is malformed or missing fields */
export class InvalidPaymentHeaderError extends X402Error {
  constructor(message: string) {
    super(message, "INVALID_PAYMENT_HEADER");
    this.name = "InvalidPaymentHeaderError";
  }
}

/** Payment scheme is not supported (e.g. server requires a scheme we don't handle) */
export class UnsupportedSchemeError extends X402Error {
  readonly scheme: string;

  constructor(scheme: string) {
    super(`Unsupported payment scheme: ${scheme}`, "UNSUPPORTED_SCHEME");
    this.name = "UnsupportedSchemeError";
    this.scheme = scheme;
  }
}

/** Network-level error (timeout, DNS failure, connection reset) — generally retryable */
export class NetworkError extends X402Error {
  override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, "NETWORK_ERROR");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** Payment aborted because seller reputation check failed */
export class ReputationAbortError extends X402Error {
  readonly score: number;

  constructor(score: number) {
    super(
      `Payment aborted: seller reputation check failed (score=${score})`,
      "REPUTATION_ABORT"
    );
    this.name = "ReputationAbortError";
    this.score = score;
  }
}

// ──────────────────────── Server Errors ────────────────────────

/** ERC-3009 signature verification failed */
export class PaymentVerificationError extends X402Error {
  readonly details?: string;

  constructor(message: string, details?: string) {
    super(message, "VERIFICATION_FAILED");
    this.name = "PaymentVerificationError";
    this.details = details;
  }
}

/** On-chain settlement (createEscrowWithAuth) failed */
export class SettlementError extends X402Error {
  override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, "SETTLEMENT_FAILED");
    this.name = "SettlementError";
    this.cause = cause;
  }
}
