/* Business-rule violation with a user-facing message and a stable code (for tests and UI mapping). */
export class DomainError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
