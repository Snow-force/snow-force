import { describe, expect, it } from "vitest";
import { mediaLoader, publicMediaSource } from "./delivery-policy";
const project = "https://media.example.test";
const src = `${project}/storage/v1/object/public/recap-media/recaps/day/photo.jpg`;
describe("public preview source boundary", () => {
  it("accepts only configured public photo buckets and normalizes their paths", () => {
    expect(publicMediaSource(src, project)).toMatchObject({ bucket: "recap-media", objectPath: "recaps/day/photo.jpg", url: src });
    expect(publicMediaSource(src.replace("photo.jpg", "snow%20day.webp"), project)?.objectPath).toBe("recaps/day/snow%20day.webp");
  });
  it.each([
    "http://media.example.test/storage/v1/object/public/recap-media/a.jpg",
    "https://evil.example/storage/v1/object/public/recap-media/a.jpg",
    "https://user:password@media.example.test/storage/v1/object/public/recap-media/a.jpg",
    `${project}/storage/v1/object/sign/recap-media/a.jpg?token=secret`,
    `${project}/storage/v1/object/public/private-documents/a.jpg`,
    `${project}/storage/v1/object/public/recap-media/_web/v1/a.webp`,
    `${project}/storage/v1/object/public/recap-media/a.svg`,
    `${src}?token=secret`, `${src}#fragment`,
    `${project}/storage/v1/object/public/recap-media/a%2Fb.jpg`,
    `${project}/storage/v1/object/public/recap-media/a%5Cb.jpg`,
    `${project}/storage/v1/object/public/recap-media/%ZZ.jpg`,
    "/local.jpg", "not-a-url",
  ])("rejects private, arbitrary or recursive sources: %s", (url) => expect(publicMediaSource(url, project)).toBeNull());
  it("requires configuration and limits source size and width cardinality", () => {
    expect(publicMediaSource(src, undefined)).toBeNull();
    expect(publicMediaSource(`${src}${"x".repeat(2050)}`, project)).toBeNull();
    expect(new URL(mediaLoader({ src, width: 640 }), "https://site.test").searchParams.get("v")).toBe("v1");
    expect(new URL(mediaLoader({ src, width: 750 }), "https://site.test").searchParams.get("w")).toBe("1280");
    expect(new URL(mediaLoader({ src, width: 9999 }), "https://site.test").searchParams.get("w")).toBe("1920");
  });
});
