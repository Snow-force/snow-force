import Link from "next/link";
import { MemberAuthCard } from "./member-auth-card";

type MemberAuthPanelProps = {
  searchParams: Record<string, string | undefined>;
};

export function MemberAuthPanel({ searchParams }: MemberAuthPanelProps) {
  return (
    <div className="relative min-h-[calc(100svh-64px)] overflow-hidden bg-[#07090c]">
      <video
        className="absolute inset-0 h-full w-full object-cover"
          src="/login_video.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[#07090c]/70" />

      <Link href="/" className="absolute left-5 top-5 z-20 text-[24px] font-semibold leading-none text-white sm:left-8 sm:top-6">
        SnowForce
      </Link>

      <div className="relative z-20 flex min-h-[calc(100svh-64px)] flex-col justify-end pb-6 pt-16 lg:items-center lg:justify-center lg:pb-0 lg:pt-0">
        <MemberAuthCard searchParams={searchParams} />
      </div>
    </div>
  );
}
