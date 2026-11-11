"use client";
import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { mediaLoader, publicMediaSource } from "@/lib/images/delivery-policy";

/** Public storage photos share durable, bounded previews; other assets keep Next's loader. */
export function PublicImage(props: ImageProps) {
  const managed = typeof props.src === "string" && publicMediaSource(props.src, process.env.NEXT_PUBLIC_SUPABASE_URL);
  return managed ? <RecoverablePublicImage key={String(props.src)} {...props} /> : <Image {...props} alt={props.alt} />;
}

function RecoverablePublicImage(props: ImageProps) {
  const [original, setOriginal] = useState(false);
  return <Image
    {...props}
    key={original ? "original" : "preview"}
    alt={props.alt}
    loader={original ? undefined : mediaLoader}
    unoptimized={original}
    overrideSrc={original ? undefined : props.overrideSrc}
    onError={(event) => {
      if (!original) setOriginal(true);
      else props.onError?.(event);
    }}
  />;
}
