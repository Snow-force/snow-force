"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

type SafeRecapImageProps = {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  priority?: boolean;
  fallbackSrc?: string;
  fallbackAlt?: string;
  fallbackLabel: string;
  unavailableLabel: string;
};

export function SafeRecapImage(props: SafeRecapImageProps) {
  return <RecapImageWithFallback key={JSON.stringify([props.src, props.fallbackSrc])} {...props} />;
}

function RecapImageWithFallback({
  src,
  alt,
  sizes,
  className = "",
  imageClassName = "object-cover",
  imageStyle,
  priority = false,
  fallbackSrc = "/team/group.jpg",
  fallbackAlt,
  fallbackLabel,
  unavailableLabel,
}: SafeRecapImageProps) {
  const initialSrc = src || fallbackSrc;
  const [activeSrc, setActiveSrc] = useState(initialSrc);
  const [loading, setLoading] = useState(Boolean(initialSrc));
  const [usedFallback, setUsedFallback] = useState(!src && Boolean(fallbackSrc));
  const [failed, setFailed] = useState(!initialSrc);

  function handleError() {
    if (!usedFallback && fallbackSrc && activeSrc !== fallbackSrc) {
      setActiveSrc(fallbackSrc);
      setUsedFallback(true);
      setLoading(true);
      return;
    }

    setLoading(false);
    setFailed(true);
  }

  return (
    <div className={`absolute inset-0 overflow-hidden bg-[#17191d] ${className}`}>
      {!failed && activeSrc ? (
        <Image
          key={activeSrc}
          src={activeSrc}
          alt={usedFallback ? fallbackAlt ?? alt : alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          onLoad={() => setLoading(false)}
          onError={handleError}
          className={imageClassName}
          style={imageStyle}
        />
      ) : null}

      {loading ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[#202329] text-[12px] font-medium uppercase tracking-[0.14em] text-white/[0.55]"
          aria-hidden="true"
        >
          SnowForce
        </div>
      ) : null}

      {usedFallback && !loading && !failed ? (
        <span className="absolute bottom-3 left-3 rounded-[4px] bg-black/80 px-2.5 py-1.5 text-[11px] leading-none text-white/80">
          {fallbackLabel}
        </span>
      ) : null}

      {failed ? (
        <div
          className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] leading-5 text-white/60"
          role="img"
          aria-label={`${alt}. ${unavailableLabel}`}
        >
          {unavailableLabel}
        </div>
      ) : null}
    </div>
  );
}
