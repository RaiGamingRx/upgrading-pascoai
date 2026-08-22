import React, { useRef, useState, useEffect } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface RevealOnScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  direction?: "up" | "left" | "right" | "scale" | "fade";
  delay?: number; // ms
  duration?: number; // ms
  threshold?: number;
  className?: string;
  stagger?: boolean; // whether to stagger if there are multiple RevealOnScroll in rapid succession
}

export function RevealOnScroll({
  children,
  direction = "up",
  delay = 0,
  duration = 380,
  threshold = 0.1,
  className,
  ...props
}: RevealOnScrollProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (prefersReduced) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    const currentEl = ref.current;
    if (currentEl) {
      observer.observe(currentEl);
    }

    return () => {
      if (currentEl) observer.unobserve(currentEl);
    };
  }, [threshold, prefersReduced]);

  const getAnimationClass = () => {
    if (!isVisible || prefersReduced) return "";
    switch (direction) {
      case "up":
        return "animate-reveal-up";
      case "left":
        return "animate-reveal-left";
      case "right":
        return "animate-slide-right";
      case "scale":
        return "animate-reveal-scale";
      case "fade":
        return "animate-fade-in";
      default:
        return "animate-reveal-up";
    }
  };

  return (
    <div
      ref={ref}
      style={{
        animationDelay: delay > 0 ? `${delay}ms` : undefined,
        animationDuration: `${duration}ms`,
        opacity: isVisible || prefersReduced ? 1 : 0,
      }}
      className={cn(
        "transition-opacity",
        getAnimationClass(),
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
