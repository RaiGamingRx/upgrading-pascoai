import React, { useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDeviceType } from "@/hooks/useDeviceType";
import { cn } from "@/lib/utils";

interface MagneticButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  strength?: number; // max pixel displacement (default 6)
  className?: string;
}

export function MagneticButton({
  children,
  strength = 6,
  className,
  ...props
}: MagneticButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const prefersReduced = useReducedMotion();
  const { isTouch } = useDeviceType();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!buttonRef.current || prefersReduced || isTouch) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) / (rect.width / 2);
    const deltaY = (e.clientY - centerY) / (rect.height / 2);

    setOffset({
      x: deltaX * strength,
      y: deltaY * strength,
    });
  };

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    setOffset({ x: 0, y: 0 });
  };

  const transformStyle =
    !prefersReduced && !isTouch && (offset.x !== 0 || offset.y !== 0)
      ? `translate3d(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px, 0)`
      : undefined;

  return (
    <div
      ref={buttonRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: transformStyle,
        transition: isHovered ? "transform 0.1s ease-out" : "transform 0.3s ease-out",
      }}
      className={cn("inline-block", className)}
      {...props}
    >
      {children}
    </div>
  );
}
