import Link from "next/link";
import { Backpack, CalendarCheck2, Images } from "lucide-react";
import { MemberAuthCard } from "./member-auth-card";

type MemberAuthPanelProps = {
  searchParams: Record<string, string | undefined>;
};

const membershipBenefits = [
  {
    description: "Register for upcoming events faster.",
    icon: CalendarCheck2,
    title: "Easy Registration",
  },
  {
    description: "Keep trips, photos and recaps together.",
    icon: Images,
    title: "Trip History",
  },
  {
    description: "Save gear, pass and riding details.",
    icon: Backpack,
    title: "Rider Profile",
  },
] as const;

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
      <div className="absolute inset-0 bg-[#07090c]/72" />

      <Link href="/" className="absolute left-5 top-5 z-20 text-[24px] font-semibold leading-none text-white sm:left-8 sm:top-7 min-[960px]:left-10 min-[960px]:top-9 min-[960px]:text-[28px] xl:left-14">
        SnowForce
      </Link>

      <div className="relative z-20 flex min-h-[calc(100svh-64px)] flex-col justify-end px-4 pb-6 pt-16 sm:px-6 md:items-center md:justify-center md:py-24 min-[960px]:px-10 min-[960px]:py-28 xl:px-14">
        <div className="mx-auto w-full max-w-[1320px] min-[960px]:grid min-[960px]:grid-cols-[minmax(0,1fr)_minmax(480px,540px)] min-[960px]:items-center min-[960px]:gap-12 xl:grid-cols-[minmax(0,1.12fr)_minmax(520px,580px)] xl:gap-20">
          <section className="hidden min-w-0 min-[960px]:block" aria-label="SnowForce membership overview">
            <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[#7dd3fc]">
              One account. Every mountain day.
            </p>
            <h1 className="mt-5 max-w-[680px] text-[46px] font-semibold leading-[0.98] tracking-[-0.045em] text-white xl:text-[62px] 2xl:text-[68px]">
              Built for days that start before sunrise.
            </h1>
            <p className="mt-6 max-w-[540px] text-[18px] leading-8 text-white/74 xl:text-[20px] xl:leading-9">
              Register faster, keep trip details organized, and return to every SnowForce event with your rider profile ready.
            </p>
            <div className="relative isolate mt-11 max-w-[680px] py-3 before:absolute before:-inset-x-5 before:inset-y-0 before:-z-10 before:bg-gradient-to-r before:from-black/20 before:via-black/10 before:to-transparent before:blur-xl">
              <div className="grid grid-cols-3">
                {membershipBenefits.map(({ description, icon: Icon, title }, index) => (
                  <div key={title} className={`min-w-0 pr-4 xl:pr-6 ${index > 0 ? "border-l border-white/16 pl-4 xl:pl-6" : ""}`}>
                    <Icon aria-hidden="true" className="h-5 w-5 stroke-[1.7] text-[#7dd3fc] xl:h-[22px] xl:w-[22px]" />
                    <h2 className="mt-3 text-[14px] font-semibold leading-5 text-white xl:text-[16px] xl:leading-6">
                      {title}
                    </h2>
                    <p className="mt-1.5 text-[12px] leading-[1.55] text-white/56 xl:text-[13px] xl:leading-5">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <MemberAuthCard searchParams={searchParams} />
        </div>
      </div>
    </div>
  );
}
