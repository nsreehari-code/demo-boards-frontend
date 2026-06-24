import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared button with a countdown timer.
 *
 * Runs a `duration` (ms) countdown and fires `onClick` automatically when it
 * elapses, then restarts. Clicking the button fires `onClick` immediately and
 * restarts the countdown. While `onClick` resolves (it may be async) the
 * button reports a `pending` state and is disabled.
 *
 * `children` may be a node or a render function receiving
 * `{ remainingMs, pending }` so the consumer can show a live countdown. All
 * other props (className, title, aria-*, …) are forwarded to the button.
 */
export function TimerButton({
  duration,
  onClick,
  disabled = false,
  children,
  ...rest
}) {
  const [deadline, setDeadline] = useState(() => Date.now() + duration);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const onClickRef = useRef(onClick);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const armedRef = useRef(false);

  onClickRef.current = onClick;
  const remainingMs = Math.max(0, deadline - nowMs);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const resetCountdown = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    setDeadline(now + duration);
    armedRef.current = false;
  }, [duration]);

  useEffect(() => {
    resetCountdown();
  }, [resetCountdown]);

  const fire = useCallback(async () => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      await onClickRef.current?.();
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) {
        setPending(false);
        resetCountdown();
      }
    }
  }, [resetCountdown]);

  useEffect(() => {
    if (pending) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      armedRef.current = true;
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [pending]);

  useEffect(() => {
    if (!armedRef.current || remainingMs > 0 || pending || disabled) {
      return;
    }
    fire();
  }, [remainingMs, pending, disabled, fire]);

  const handleClick = () => {
    if (pending) {
      return;
    }
    fire();
  };

  return (
    <button type="button" onClick={handleClick} disabled={disabled || pending} {...rest}>
      {typeof children === 'function' ? children({ remainingMs, pending }) : children}
    </button>
  );
}
