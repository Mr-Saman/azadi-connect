'use strict';
class AppError extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; }
}
module.exports = { AppError };
