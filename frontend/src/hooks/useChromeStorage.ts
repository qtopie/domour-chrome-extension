import { useState, useEffect, useCallback } from "react";

declare const chrome: any;

/**
 * Reactive custom hook for Chrome storage (local area) synchronization.
 * Automatically synchronizes state across multiple windows (Popup, SidePanel, Options)
 * via `chrome.storage.onChanged` listener.
 *
 * @param key The chrome.storage.local key to bind to
 * @param initialValue Default value if key is not present in storage
 * @returns [value, setValue, isInitialized]
 */
export function useChromeStorage<T>(
  key: string,
  initialValue: T
): [T, (val: T | ((prev: T) => T)) => Promise<void>, boolean] {
  const [value, setValueState] = useState<T>(initialValue);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // 1. Initial load from chrome.storage.local
  useEffect(() => {
    let isMounted = true;

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([key], (res: Record<string, any>) => {
        if (!isMounted) return;
        if (chrome.runtime?.lastError) {
          setIsInitialized(true);
          return;
        }
        if (res && res[key] !== undefined) {
          setValueState(res[key]);
        }
        setIsInitialized(true);
      });
    } else {
      setIsInitialized(true);
    }

    return () => {
      isMounted = false;
    };
  }, [key]);

  // 2. Listen for cross-page / background changes
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return;
    }

    const handleChange = (
      changes: Record<string, { oldValue?: any; newValue?: any }>,
      areaName: string
    ) => {
      if (areaName === "local" && changes[key]) {
        setValueState(changes[key].newValue !== undefined ? changes[key].newValue : initialValue);
      }
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleChange);
    };
  }, [key, initialValue]);

  // 3. Setter function to persist to storage and update local state
  const setValue = useCallback(
    async (updater: T | ((prev: T) => T)): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        setValueState((current) => {
          const nextVal = typeof updater === "function" ? (updater as (prev: T) => T)(current) : updater;

          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            chrome.storage.local.set({ [key]: nextVal }, () => {
              if (chrome.runtime?.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          } else {
            resolve();
          }

          return nextVal;
        });
      });
    },
    [key]
  );

  return [value, setValue, isInitialized];
}
