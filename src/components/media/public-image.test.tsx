import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageProps } from "next/image";
vi.mock("next/image", () => ({ default: (props: ImageProps) => {
  const src = typeof props.src === "string" ? props.src : "";
  const preview = props.loader ? props.loader({ src, width: 640, quality: 75 }) : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={preview} alt={props.alt} />;
} }));
import { PublicImage } from "./public-image";
afterEach(() => vi.unstubAllEnvs());
describe("shared customer image delivery", () => {
  it("routes public storage photos through stable small previews, even if an old surface requests unoptimized", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    render(<PublicImage unoptimized width={100} height={100} src="https://media.example.test/storage/v1/object/public/event-covers/day.jpg" alt="Trip" />);
    expect(screen.getByAltText("Trip").getAttribute("src")).toContain("/api/media/image?");
  });
  it("preserves local logos and data QR codes", () => {
    render(<><PublicImage src="/logo.png" alt="Logo" width={20} height={20}/><PublicImage src="data:image/png;base64,abc" alt="Ticket" unoptimized width={20} height={20}/></>);
    expect(screen.getByAltText("Logo")).toHaveAttribute("src", "/logo.png");
    expect(screen.getByAltText("Ticket")).toHaveAttribute("src", "data:image/png;base64,abc");
  });
});
