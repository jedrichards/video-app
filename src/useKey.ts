import { useEffect, useRef } from "react";

export const ARROW_LEFT = "ArrowLeft";
export const ARROW_RIGHT = "ArrowRight";
export const PAGE_UP = "PageUp";
export const PAGE_DOWN = "PageDown";

export function useKey(code: string, callback: () => void) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === code) {
        callbackRef.current();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [code]);
}
