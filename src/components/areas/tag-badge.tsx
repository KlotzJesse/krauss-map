"use client";

import { X } from "lucide-react";

interface TagBadgeProps {
  name: string;
  color: string;
  onRemove?: () => void;
  small?: boolean;
  className?: string;
}

export function TagBadge({ name, color, onRemove, small = false, className }: TagBadgeProps) {
  const hex = color.startsWith("#") ? color : `#${color}`;

  // Determine text color based on background luminance
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  const textColor = luminance > 140 ? "#1a1a1a" : "#ffffff";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium leading-none ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"} ${className ?? ""}`}
      style={{ backgroundColor: hex, color: textColor }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded-full hover:opacity-70 transition-opacity"
          aria-label={`Tag ${name} entfernen`}
        >
          <X className={small ? "h-2.5 w-2.5" : "h-3 w-3"} />
        </button>
      )}
    </span>
  );
}
