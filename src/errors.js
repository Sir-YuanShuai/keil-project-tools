class KeilProjectError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'KeilProjectError';
  }
}

function makeError(code, message) {
  return new KeilProjectError(code, message);
}

function errorResponse(code, message) {
  return { error: true, code, message };
}

module.exports = { KeilProjectError, makeError, errorResponse };
