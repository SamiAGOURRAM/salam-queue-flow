import { useCallback, useEffect, useRef, useState } from "react";

interface CountUpProps {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  startWhen?: boolean;
  separator?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export default function CountUp({
  to,
  from = 0,
  direction = "up",
  delay = 0,
  duration = 2,
  className = "",
  style,
  startWhen = true,
  separator = "",
  onStart,
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const getDecimalPlaces = (num: number): number => {
    const str = num.toString();
    if (str.includes(".")) {
      const decimals = str.split(".")[1];
      if (parseInt(decimals) !== 0) {
        return decimals.length;
      }
    }
    return 0;
  };

  const maxDecimals = Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

  const formatValue = useCallback(
    (latest: number) => {
      const hasDecimals = maxDecimals > 0;

      const options: Intl.NumberFormatOptions = {
        useGrouping: !!separator,
        minimumFractionDigits: hasDecimals ? maxDecimals : 0,
        maximumFractionDigits: hasDecimals ? maxDecimals : 0,
      };

      const formattedNumber = Intl.NumberFormat("en-US", options).format(latest);

      return separator ? formattedNumber.replace(/,/g, separator) : formattedNumber;
    },
    [maxDecimals, separator],
  );

  // Initialize text content
  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = formatValue(direction === "down" ? to : from);
    }
  }, [from, to, direction, formatValue]);

  // Basic in-view detection using IntersectionObserver
  useEffect(() => {
    if (!startWhen || hasStarted) return;
    if (!ref.current || typeof IntersectionObserver === "undefined") {
      setHasStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasStarted(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.4 },
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [startWhen, hasStarted]);

  // Animation loop
  useEffect(() => {
    if (!hasStarted) return;

    const startValue = direction === "down" ? from : from;
    const endValue = to;
    const startTime = performance.now() + delay * 1000;
    const durationMs = duration * 1000;

    if (typeof onStart === "function") {
      onStart();
    }

    let frameId: number;

    const tick = (now: number) => {
      if (!ref.current) return;

      if (now < startTime) {
        frameId = requestAnimationFrame(tick);
        return;
      }

      const elapsed = Math.min(now - startTime, durationMs);
      const t = durationMs === 0 ? 1 : elapsed / durationMs;
      // Ease-out quad
      const eased = 1 - (1 - t) * (1 - t);

      const value = startValue + (endValue - startValue) * eased;
      ref.current.textContent = formatValue(value);

      if (elapsed < durationMs) {
        frameId = requestAnimationFrame(tick);
      } else if (typeof onEnd === "function") {
        onEnd();
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [hasStarted, direction, from, to, delay, duration, formatValue, onStart, onEnd]);

  return <span className={className} style={style} ref={ref} />;
}


