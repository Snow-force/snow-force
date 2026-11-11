"use client";
import Image, { type ImageProps } from "next/image";
import { mediaLoader, publicMediaSource } from "@/lib/images/delivery-policy";

/** Public storage photos share durable, bounded previews; other assets keep Next's loader. */
export function PublicImage(props: ImageProps) {
  const managed = typeof props.src === "string" && publicMediaSource(props.src, process.env.NEXT_PUBLIC_SUPABASE_URL);
  return <Image {...props} alt={props.alt} {...(managed ? { loader: mediaLoader, unoptimized: false } : {})} />;
}
