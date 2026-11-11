import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageProps } from "next/image";
vi.mock("next/image", () => ({ default: (props: ImageProps) => {
  const src = typeof props.src === "string" ? props.src : "";
  const preview = props.loader && !props.unoptimized ? props.loader({ src, width: 640, quality: 75 }) : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={preview} alt={props.alt} onError={props.onError} onLoad={props.onLoad} />;
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
  it("recovers a failed product preview using the original public URL before reporting an image failure", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    const src = "https://media.example.test/storage/v1/object/public/shop-products/products/snow%20jacket.jpg";
    const error = vi.fn(), loaded = vi.fn();
    render(<PublicImage src={src} alt="Jacket" width={400} height={500} onError={error} onLoad={loaded} />);
    fireEvent.error(screen.getByAltText("Jacket"));
    expect(screen.getByAltText("Jacket")).toHaveAttribute("src", src);
    expect(error).not.toHaveBeenCalled();
    fireEvent.load(screen.getByAltText("Jacket"));
    expect(loaded).toHaveBeenCalledOnce();
    fireEvent.error(screen.getByAltText("Jacket"));
    expect(error).toHaveBeenCalledOnce();
    expect(screen.getByAltText("Jacket")).toHaveAttribute("src", src);
  });
  it("restarts preview delivery when the photo changes after a failed preview", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    const src = "https://media.example.test/storage/v1/object/public/shop-products/products/jacket.jpg";
    const view = render(<PublicImage src={src} alt="Gear" width={400} height={500} />);
    fireEvent.error(screen.getByAltText("Gear"));
    view.rerender(<PublicImage src={src.replace("jacket.jpg", "pants.jpg")} alt="Gear" width={400} height={500} />);
    expect(screen.getByAltText("Gear").getAttribute("src")).toContain("/api/media/image?");
    expect(screen.getByAltText("Gear").getAttribute("src")).toContain("pants.jpg");
  });
  it("recovers each product independently and keeps errors on other sources observable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    const src = "https://media.example.test/storage/v1/object/public/shop-products/products/jacket.jpg";
    const error = vi.fn();
    render(<><PublicImage src={src} alt="First" width={100} height={100}/><PublicImage src={src.replace("jacket", "pants")} alt="Second" width={100} height={100}/><PublicImage src="/logo.png" alt="Logo" width={20} height={20} onError={error}/></>);
    fireEvent.error(screen.getByAltText("First"));
    expect(screen.getByAltText("First")).toHaveAttribute("src", src);
    expect(screen.getByAltText("Second").getAttribute("src")).toContain("/api/media/image?");
    fireEvent.error(screen.getByAltText("Logo"));
    expect(error).toHaveBeenCalledOnce();
  });
});
