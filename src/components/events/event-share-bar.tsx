"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import { getQrCodeDataUrl } from "@/lib/events/share-actions";

function buildEventShareUrl(origin: string, slug: string): string {
  return `${origin}/events/${slug}`;
}

function copyTextFallback(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function copyEventLink(origin: string, slug: string): Promise<void> {
  const url = buildEventShareUrl(origin, slug);
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(url);
  } else {
    copyTextFallback(url);
  }
}

export function EventShareBar({
  slug,
  title,
  tone = "dark",
}: {
  slug: string;
  title: string;
  tone?: "dark" | "light";
}) {
  const { t } = useLanguage();

  const buttonClass =
    tone === "dark"
      ? "text-[14px] px-3 py-1.5 rounded-full border border-white/15 text-white/80 hover:bg-white/10 transition-colors"
      : "text-[14px] px-3 py-1.5 rounded-full border border-[#e0e0e0] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors";

  const toastClass =
    tone === "dark"
      ? "text-[14px] px-3 py-1.5 rounded-full bg-white/10 text-white/90"
      : "text-[14px] px-3 py-1.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f]";
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrUrl, setQrUrl] = useState<string>("");
  const [toast, setToast] = useState<string>("");

  const hideToastAfterDelay = useCallback(() => {
    const id = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(id);
  }, []);

  const handleCopyLink = useCallback(async () => {
    await copyEventLink(window.location.origin, slug);
    setToast(t({ en: "Link copied", zh: "链接已复制" }));
    hideToastAfterDelay();
  }, [slug, t, hideToastAfterDelay]);

  const handleShare = useCallback(async () => {
    const url = buildEventShareUrl(window.location.origin, slug);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      }
    }
    await copyEventLink(window.location.origin, slug);
    setToast(t({ en: "Link copied", zh: "链接已复制" }));
    hideToastAfterDelay();
  }, [slug, title, t, hideToastAfterDelay]);

  const openQrModal = useCallback(async () => {
    setShowQrModal(true);
    const origin = window.location.origin;
    setQrUrl(buildEventShareUrl(origin, slug));
    const { dataUrl } = await getQrCodeDataUrl(slug);
    setQrDataUrl(dataUrl);
  }, [slug]);

  const closeQrModal = useCallback(() => {
    setShowQrModal(false);
    setQrDataUrl("");
  }, []);

  useEffect(() => {
    if (!showQrModal) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeQrModal();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showQrModal, closeQrModal]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleShare}
        className={buttonClass}
      >
        {t({ en: "Share", zh: "分享" })}
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        className={buttonClass}
      >
        {t({ en: "Copy Link", zh: "复制链接" })}
      </button>
      <button
        type="button"
        onClick={openQrModal}
        className={buttonClass}
      >
        {t({ en: "QR", zh: "二维码" })}
      </button>

      {toast ? (
        <span className={toastClass}>
          {toast}
        </span>
      ) : null}

      {showQrModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeQrModal();
            }
          }}
        >
          <div className="max-w-sm rounded-2xl bg-[#1d1d1f] p-6 text-center shadow-2xl border border-white/10">
            <h3 className="mb-4 text-[18px] font-semibold text-white">
              {t({ en: "Scan to share", zh: "扫码分享" })}
            </h3>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={t({ en: "QR code", zh: "二维码" })}
                className="mx-auto mb-4 rounded-xl"
                width={240}
                height={240}
              />
            ) : null}
            <p className="mb-6 break-all text-[13px] text-white/70">{qrUrl}</p>
            <button
              type="button"
              onClick={closeQrModal}
              className="text-[14px] px-5 py-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              {t({ en: "Close", zh: "关闭" })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
