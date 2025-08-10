// Add `DOMException`
if (typeof DOMException === "undefined") {
  global.DOMException = class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name;
    }
  };
}

// Add `throwIfAborted` method to `AbortSignal` (used by pqueu)
if (!AbortSignal.prototype.throwIfAborted) {
  AbortSignal.prototype.throwIfAborted = function () {
    if (this.aborted) {
      throw new DOMException("This operation was aborted.", "AbortError");
    }
  };
}
