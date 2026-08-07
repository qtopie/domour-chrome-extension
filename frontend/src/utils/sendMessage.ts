declare const chrome: any;

/**
 * Wrapper for `chrome.runtime.sendMessage` that always reads
 * `chrome.runtime.lastError`, preventing the "Unchecked runtime.lastError:
 * The message port closed before a response was received." console error
 * that MV3 logs when a callback doesn't read the error.
 *
 * When the port closes (service worker suspended, page closed, or handler
 * crashed before responding), the callback is invoked with `undefined`.
 */
export function sendMessage<T = any>(
  message: unknown,
  callback?: (response: T | undefined) => void
): void {
  try {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        callback?.(undefined);
        return;
      }
      callback?.(response);
    });
  } catch (e) {
    // Background not reachable (e.g. extension context invalidated).
    callback?.(undefined);
  }
}
