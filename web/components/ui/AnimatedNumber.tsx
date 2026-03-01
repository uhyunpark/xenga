"use client";

import { useEffect, useRef } from "react";
import { useSpring, useTransform, motion, useReducedMotion } from "framer-motion";

interface AnimatedNumberProps {
  value: number | null | undefined;
  format?: (n: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const shouldReduce = useReducedMotion();
  const prevValue = useRef(0);

  const safeValue = typeof value === "number" && !isNaN(value) ? value : 0;

  const spring = useSpring(prevValue.current, {
    stiffness: 100,
    damping: 20,
    restDelta: 0.01,
  });

  const display = useTransform(spring, (v) =>
    format ? format(Math.round(v * 100) / 100) : Math.round(v).toString()
  );

  useEffect(() => {
    prevValue.current = safeValue;
    if (shouldReduce) {
      spring.jump(safeValue);
    } else {
      spring.set(safeValue);
    }
  }, [safeValue, spring, shouldReduce]);

  if (value === null || value === undefined || isNaN(value)) {
    return <span className={className}>{"\u2014"}</span>;
  }

  return <motion.span className={className}>{display}</motion.span>;
}
