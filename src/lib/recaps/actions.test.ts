import { describe, expect, it } from "vitest";

import {
  addMediaItems,
  deleteMediaItem,
  moveMediaItem,
  setCoverMediaItem,
  updateMediaCaption,
} from "./media-helpers";
import {
  abortRecapMediaUploadResult,
  createRecapFromEventResult,
  finalizeRecapMediaUploadResult,
  signRecapMediaUploadResult,
  unarchiveRecapResult,
} from "./actions";
import { RECAP_MEDIA_MAX_BYTES } from "./upload-signing";
import type { Event, EventRecap, RecapMediaItem } from "../types";
import { createDefaultReviewConfig } from "@/lib/reviews/config";

function media(id: string, order: number, isCover = false): RecapMediaItem {
  return {
    id,
    type: "image",
    url: `https://example.com/${id}.jpg`,
    storagePath: `recaps/demo/${id}.jpg`,
    order,
    isCover,
  };
}

function eventForRecap(): Event {
  return {
    slug: "demo-event",
    status: "archived",
    registrationState: "closed",
    title: { zh: "活动标题", en: "Event title" },
    eventDate: "2026-01-01",
    meetTime: "08:00",
    meetLocation: { zh: "集合点", en: "Meet point" },
    activityLocation: { zh: "雪场", en: "Resort" },
    locationUrl: "",
    coverImage: "https://example.com/cover.jpg",
    capacity: 12,
    registrationCount: 0,
    registrationCloseAt: "2025-12-31T10:00",
    requiresApproval: false,
    allowWaitlist: true,
    allowCancellation: true,
    feeAmount: "120",
    paymentModel: "free",
    depositAmount: null,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    waiverTextEn: null,
    waiverTextSha: null,
    merchantBoothProgram: null,
    reviewConfig: createDefaultReviewConfig(),
    paymentInstructions: { zh: "付款说明", en: "Payment instructions" },
    seoTitle: { zh: "", en: "" },
    seoDescription: { zh: "", en: "" },
    registrationQuestions: [],
    detailModules: [
      {
        id: "intro",
        type: "intro",
        displayMode: "rich_text",
        title: { zh: "活动概览", en: "Overview" },
        content: { zh: "回顾正文", en: "Recap body" },
        items: { zh: [], en: [] },
      },
    ],
  };
}

function recap(items: RecapMediaItem[]): EventRecap {
  return {
    slug: "demo",
    status: "draft",
    title: { zh: "中文", en: "" },
    summary: { zh: "摘要", en: "" },
    content: { zh: "正文", en: "" },
    date: "2026-01-01",
    location: { zh: "雪场", en: "" },
    coverImage: items.find((item) => item.isCover)?.url ?? "",
    media: items,
    tags: { zh: [], en: [] },
    seoTitle: { zh: "", en: "" },
    seoDescription: { zh: "", en: "" },
    eventSlug: "demo-event",
  };
}

describe("recap media helpers", () => {
  it("adds uploaded media and makes the first image cover when no cover exists", () => {
    const next = addMediaItems(recap([]), [media("a", 0), media("b", 1)]);

    expect(next.media.map((item) => [item.id, item.order, item.isCover])).toEqual([
      ["a", 0, true],
      ["b", 1, false],
    ]);
    expect(next.coverImage).toBe("https://example.com/a.jpg");
  });

  it("deletes cover media and promotes the first remaining image", () => {
    const next = deleteMediaItem(recap([media("a", 0, true), media("b", 1)]), "a");

    expect(next.media.map((item) => [item.id, item.order, item.isCover])).toEqual([["b", 0, true]]);
    expect(next.coverImage).toBe("https://example.com/b.jpg");
  });

  it("moves media by direction and reindexes order", () => {
    const next = moveMediaItem(recap([media("a", 0, true), media("b", 1), media("c", 2)]), "c", "up");

    expect(next.media.map((item) => [item.id, item.order])).toEqual([
      ["a", 0],
      ["c", 1],
      ["b", 2],
    ]);
  });

  it("sets one image as cover", () => {
    const next = setCoverMediaItem(recap([media("a", 0, true), media("b", 1)]), "b");

    expect(next.media.map((item) => [item.id, item.isCover])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(next.coverImage).toBe("https://example.com/b.jpg");
  });

  it("updates optional captions without requiring both languages", () => {
    const next = updateMediaCaption(recap([media("a", 0, true)]), "a", { zh: "合影" });

    expect(next.media[0].caption).toEqual({ zh: "合影" });
  });

  it("makes an existing hidden recap visible when its source event is archived again", async () => {
    const hiddenRecap = { ...recap([]), status: "hidden" as const };
    const saved: Record<string, unknown> = {};

    const result = await createRecapFromEventResult(
      {
        loadRecap: async () => hiddenRecap,
        insertRecap: async () => {
          throw new Error("existing recap should be updated, not inserted");
        },
        saveRecap: async (_slug, data) => {
          saved.recap = data;
          return { ...hiddenRecap, ...data };
        },
      },
      eventForRecap(),
    );

    expect(result?.status).toBe("draft");
    expect(saved.recap).toEqual({ status: "draft" });
  });

  it("restores archived event to draft and hides the recap without deleting media", async () => {
    const recapWithMedia = recap([media("a", 0, true)]);
    const saved: Record<string, unknown> = {};

    const result = await unarchiveRecapResult(
      {
        loadRecap: async () => ({ ...recapWithMedia, status: "published" }),
        saveRecap: async (_slug, data) => {
          saved.recap = data;
          return { ...recapWithMedia, ...data };
        },
        saveEvent: async (_slug, data) => {
          saved.event = data;
          return {};
        },
      },
      "demo",
    );

    expect(result).toEqual({ success: true, eventSlug: "demo-event" });
    expect(saved.event).toEqual({ status: "draft" });
    expect(saved.recap).toEqual({ status: "hidden" });
  });

  it("does not hide the recap when the source event cannot be restored", async () => {
    const recapWithMedia = recap([media("a", 0, true)]);
    const saved: Record<string, unknown> = {};

    const result = await unarchiveRecapResult(
      {
        loadRecap: async () => recapWithMedia,
        saveRecap: async (_slug, data) => {
          saved.recap = data;
          return { ...recapWithMedia, ...data };
        },
        saveEvent: async (_slug, data) => {
          saved.event = data;
          return undefined;
        },
      },
      "demo",
    );

    expect(result).toEqual({ success: false, message: "Source event could not be restored." });
    expect(saved.event).toEqual({ status: "draft" });
    expect(saved.recap).toBeUndefined();
  });
});

type SignCandidateInput = {
  name: string;
  type: string;
  size: number;
};

type SignDependencies = Parameters<typeof signRecapMediaUploadResult>[0];

function makeSignDeps(overrides: Partial<SignDependencies> = {}): SignDependencies {
  const calls: { path?: string; options?: { upsert: boolean } }[] = [];
  return {
    loadRecap: overrides.loadRecap ?? (async () => recap([])),
    now: overrides.now ?? (() => 1700000000000),
    createSignedUploadUrl:
      overrides.createSignedUploadUrl ??
      (async (path, options) => {
        calls.push({ path, options });
        return { signedUrl: `https://example.com/upload/${path}?token=t-${calls.length}`, token: `t-${calls.length}`, path };
      }),
    getPublicUrl: overrides.getPublicUrl ?? ((path: string) => ({ publicUrl: `https://example.com/pub/${path}` })),
    _calls: calls,
  } as SignDependencies;
}

describe("signRecapMediaUploadResult", () => {
  it("returns one signed entry per valid candidate with publicUrl and a server-generated path", async () => {
    const deps = makeSignDeps();
    const result = await signRecapMediaUploadResult(deps, {
      slug: "demo",
      candidates: [
        { name: "a.jpg", type: "image/jpeg", size: 1000 },
        { name: "b.png", type: "image/png", size: 2000 },
      ] satisfies SignCandidateInput[],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signed).toHaveLength(2);
      expect(result.signed[0]).toMatchObject({
        name: "a.jpg",
        type: "image/jpeg",
        size: 1000,
        token: "t-1",
        publicUrl: "https://example.com/pub/recaps/demo/1700000000000-0-a.jpg",
      });
      expect(result.signed[0].path).toBe("recaps/demo/1700000000000-0-a.jpg");
      expect(result.signed[1].path).toBe("recaps/demo/1700000000000-1-b.png");
    }
  });

  it("rejects oversized candidates and signs nothing", async () => {
    const deps = makeSignDeps();
    const result = await signRecapMediaUploadResult(deps, {
      slug: "demo",
      candidates: [{ name: "big.jpg", type: "image/jpeg", size: RECAP_MEDIA_MAX_BYTES + 1 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("too_large");
      expect(result.index).toBe(0);
    }
  });

  it("rejects unsupported MIME types", async () => {
    const deps = makeSignDeps();
    const result = await signRecapMediaUploadResult(deps, {
      slug: "demo",
      candidates: [{ name: "doc.pdf", type: "application/pdf", size: 100 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_mime");
    }
  });

  it("rejects empty candidates", async () => {
    const deps = makeSignDeps();
    const result = await signRecapMediaUploadResult(deps, { slug: "demo", candidates: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("empty");
    }
  });

  it("rejects when the recap does not exist", async () => {
    const deps = makeSignDeps({ loadRecap: async () => undefined });
    const result = await signRecapMediaUploadResult(deps, {
      slug: "missing",
      candidates: [{ name: "a.jpg", type: "image/jpeg", size: 100 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("recap_not_found");
    }
  });

  it("does not sign any entry when validation fails on a later index", async () => {
    const deps = makeSignDeps();
    const result = await signRecapMediaUploadResult(deps, {
      slug: "demo",
      candidates: [
        { name: "good.jpg", type: "image/jpeg", size: 100 },
        { name: "bad.pdf", type: "application/pdf", size: 100 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_mime");
      expect(result.index).toBe(1);
    }
    // createSignedUploadUrl is never called on failure
    expect(((deps as unknown) as { _calls: unknown[] })._calls).toEqual([]);
  });

  it("calls createSignedUploadUrl with upsert:false", async () => {
    const deps = makeSignDeps();
    await signRecapMediaUploadResult(deps, {
      slug: "demo",
      candidates: [{ name: "a.jpg", type: "image/jpeg", size: 100 }],
    });
    const calls = ((deps as unknown) as { _calls: { path?: string; options?: { upsert: boolean } }[] })._calls;
    expect(calls[0]?.options).toEqual({ upsert: false });
  });

  it("gives duplicate filenames distinct paths via per-candidate index", async () => {
    const deps = makeSignDeps();
    const result = await signRecapMediaUploadResult(deps, {
      slug: "demo",
      candidates: [
        { name: "photo.jpg", type: "image/jpeg", size: 100 },
        { name: "photo.jpg", type: "image/jpeg", size: 200 },
        { name: "photo.jpg", type: "image/jpeg", size: 300 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const paths = result.signed.map((entry) => entry.path);
      expect(new Set(paths).size).toBe(3);
      expect(paths).toEqual([
        "recaps/demo/1700000000000-0-photo.jpg",
        "recaps/demo/1700000000000-1-photo.jpg",
        "recaps/demo/1700000000000-2-photo.jpg",
      ]);
    }
  });

  it("produces the same signed paths for identical candidate lists (deterministic)", async () => {
    const a = await signRecapMediaUploadResult(makeSignDeps(), {
      slug: "demo",
      candidates: [
        { name: "a.jpg", type: "image/jpeg", size: 1 },
        { name: "a.jpg", type: "image/jpeg", size: 2 },
      ],
    });
    const b = await signRecapMediaUploadResult(makeSignDeps(), {
      slug: "demo",
      candidates: [
        { name: "a.jpg", type: "image/jpeg", size: 1 },
        { name: "a.jpg", type: "image/jpeg", size: 2 },
      ],
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.signed.map((entry) => entry.path)).toEqual(
        b.signed.map((entry) => entry.path),
      );
    }
  });
});

type FileObject = {
  name: string;
  id: string | null;
  metadata: { size: number; mimetype: string } | null;
};

type FinalizeDependencies = Parameters<typeof finalizeRecapMediaUploadResult>[0];

function makeFinalizeDeps(overrides: Partial<FinalizeDependencies> = {}): FinalizeDependencies {
  const removed: string[] = [];
  const listed: { slug: string; prefix: string }[] = [];
  return {
    loadRecap: overrides.loadRecap ?? (async () => recap([])),
    saveRecap: overrides.saveRecap ?? (async (_slug, data) => ({ ...recap([]), ...data } as EventRecap)),
    listRecapObjects:
      overrides.listRecapObjects ??
      (async (slug, prefix) => {
        listed.push({ slug, prefix });
        return [
          {
            name: "1700000000000-a.jpg",
            id: "id-1",
            metadata: { size: 100, mimetype: "image/jpeg" },
          },
        ] as FileObject[];
      }),
    removeRecapObjects:
      overrides.removeRecapObjects ??
      (async (paths) => {
        removed.push(...paths);
        return paths.length;
      }),
    getPublicUrl: overrides.getPublicUrl ?? ((path: string) => ({ publicUrl: `https://example.com/pub/${path}` })),
    now: overrides.now ?? (() => 1),
    _removed: removed,
    _listed: listed,
  } as FinalizeDependencies;
}

describe("finalizeRecapMediaUploadResult", () => {
  it("persists uploaded media and returns the new items", async () => {
    const deps = makeFinalizeDeps();
    const saved: { slug?: string; data?: Partial<EventRecap> } = {};
    deps.saveRecap = async (slug, data) => {
      saved.slug = slug;
      saved.data = data;
      return { ...recap([]), ...data } as EventRecap;
    };

    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        {
          path: "recaps/demo/1700000000000-a.jpg",
          name: "a.jpg",
          type: "image/jpeg",
          size: 100,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.media).toHaveLength(1);
      expect(result.media[0]).toMatchObject({
        storagePath: "recaps/demo/1700000000000-a.jpg",
        url: "https://example.com/pub/recaps/demo/1700000000000-a.jpg",
        isCover: true,
        order: 0,
        type: "image",
      });
    }
    expect(saved.slug).toBe("demo");
    expect(saved.data?.media).toHaveLength(1);
  });

  it("preserves the recapPayload draft (including media already in the payload)", async () => {
    const draftRecap: EventRecap = {
      ...recap([media("existing", 0, true)]),
      title: { en: "Draft title", zh: "草稿标题" },
    };
    const deps = makeFinalizeDeps();
    const saved: Partial<EventRecap> = {};
    deps.loadRecap = async () => recap([]);
    deps.saveRecap = async (_slug, data) => {
      Object.assign(saved, data);
      return { ...recap([media("existing", 0, true)]), ...data } as EventRecap;
    };

    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      recapPayload: draftRecap,
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(true);
    // Saved recap must retain the draft title and existing media
    expect(saved.title).toEqual({ en: "Draft title", zh: "草稿标题" });
    expect(saved.media?.map((m) => m.id)).toEqual(["existing", expect.any(String)]);
  });

  it("returns bad_path without ever passing the unsafe path to removeRecapObjects", async () => {
    const deps = makeFinalizeDeps();
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/other-event/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("bad_path");
      expect(result.cleanedUp).toEqual([]);
    }
    expect(((deps as unknown) as { _removed: string[] })._removed).toEqual([]);
  });

  it("removes only the already-validated safe paths when a later entry is unsafe", async () => {
    const deps = makeFinalizeDeps();
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
        { path: "recaps/other-event/1700000000000-b.jpg", name: "b.jpg", type: "image/jpeg", size: 100 },
        { path: "recaps/demo/../../etc/passwd", name: "evil", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("bad_path");
      expect(result.cleanedUp).toEqual(["recaps/demo/1700000000000-a.jpg"]);
    }
    expect(((deps as unknown) as { _removed: string[] })._removed).toEqual([
      "recaps/demo/1700000000000-a.jpg",
    ]);
  });

  it("never passes traversal or other-slug paths to removeRecapObjects on bad_path", async () => {
    const deps = makeFinalizeDeps();
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/../../etc/passwd", name: "evil", type: "image/jpeg", size: 100 },
        { path: "recaps/other-event/1700000000000-b.jpg", name: "b.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("bad_path");
      expect(result.cleanedUp).toEqual([]);
    }
    expect(((deps as unknown) as { _removed: string[] })._removed).toEqual([]);
  });

  it("removes uploaded files and returns missing_object when storage list has no entry", async () => {
    const deps = makeFinalizeDeps({
      listRecapObjects: async () => [] as FileObject[],
    });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_object");
      expect(result.cleanedUp).toEqual(["recaps/demo/1700000000000-a.jpg"]);
    }
    expect(((deps as unknown) as { _removed: string[] })._removed).toEqual([
      "recaps/demo/1700000000000-a.jpg",
    ]);
  });

  it("removes uploaded files and returns metadata_invalid when mimetype is not allowed", async () => {
    const deps = makeFinalizeDeps({
      listRecapObjects: async () =>
        [
          {
            name: "1700000000000-a.jpg",
            id: "id-1",
            metadata: { size: 100, mimetype: "application/pdf" },
          },
        ] as FileObject[],
    });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("metadata_invalid");
      expect(result.cleanedUp).toEqual(["recaps/demo/1700000000000-a.jpg"]);
    }
  });

  it("removes uploaded files and returns metadata_invalid when size exceeds limit", async () => {
    const deps = makeFinalizeDeps({
      listRecapObjects: async () =>
        [
          {
            name: "1700000000000-a.jpg",
            id: "id-1",
            metadata: { size: RECAP_MEDIA_MAX_BYTES + 1, mimetype: "image/jpeg" },
          },
        ] as FileObject[],
    });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: RECAP_MEDIA_MAX_BYTES + 1 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("metadata_invalid");
    }
  });

  it("removes uploaded files and returns save_failed when the repository throws", async () => {
    const deps = makeFinalizeDeps({
      saveRecap: async () => {
        throw new Error("boom");
      },
    });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("save_failed");
      expect(result.cleanedUp).toEqual(["recaps/demo/1700000000000-a.jpg"]);
    }
  });

  it("returns save_failed when saveRecap returns undefined", async () => {
    const deps = makeFinalizeDeps({ saveRecap: async () => undefined });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("save_failed");
    }
  });

  it("returns recap_not_found and cleans up when the recap is missing", async () => {
    const deps = makeFinalizeDeps({ loadRecap: async () => undefined });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("recap_not_found");
      expect(result.cleanedUp).toEqual(["recaps/demo/1700000000000-a.jpg"]);
    }
  });

  it("returns empty_upload with empty cleanup when no entries are uploaded", async () => {
    const deps = makeFinalizeDeps();
    const result = await finalizeRecapMediaUploadResult(deps, { slug: "demo", uploaded: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("empty_upload");
      expect(result.cleanedUp).toEqual([]);
    }
    expect(((deps as unknown) as { _removed: string[] })._removed).toEqual([]);
  });

  it("does not call listRecapObjects or saveRecap when uploaded is empty", async () => {
    const listCalls: unknown[] = [];
    const saveCalls: unknown[] = [];
    const deps = makeFinalizeDeps();
    deps.listRecapObjects = async (...args) => {
      listCalls.push(args);
      return [] as FileObject[];
    };
    deps.saveRecap = async (...args) => {
      saveCalls.push(args);
      return undefined;
    };
    const result = await finalizeRecapMediaUploadResult(deps, { slug: "demo", uploaded: [] });
    expect(result.ok).toBe(false);
    expect(listCalls).toEqual([]);
    expect(saveCalls).toEqual([]);
  });

  it("removes every uploaded path on cleanup, not just the failing one", async () => {
    const deps = makeFinalizeDeps({
      listRecapObjects: async () => [] as FileObject[],
    });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
        { path: "recaps/demo/1700000000000-b.jpg", name: "b.jpg", type: "image/jpeg", size: 100 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cleanedUp).toEqual([
        "recaps/demo/1700000000000-a.jpg",
        "recaps/demo/1700000000000-b.jpg",
      ]);
    }
  });

  it("reports cleanedUp as empty when removeRecapObjects itself throws", async () => {
    const deps = makeFinalizeDeps({
      listRecapObjects: async () => [] as FileObject[],
      removeRecapObjects: async () => {
        throw new Error("storage down");
      },
    });
    const result = await finalizeRecapMediaUploadResult(deps, {
      slug: "demo",
      uploaded: [
        { path: "recaps/demo/1700000000000-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_object");
      expect(result.cleanedUp).toEqual([]);
    }
  });
});

type AbortDependencies = Parameters<typeof abortRecapMediaUploadResult>[0];

function makeAbortDeps(overrides: Partial<AbortDependencies> = {}): AbortDependencies {
  const removed: string[] = [];
  return {
    removeRecapObjects:
      overrides.removeRecapObjects ??
      (async (paths) => {
        removed.push(...paths);
        return paths.length;
      }),
    _removed: removed,
  } as AbortDependencies;
}

describe("abortRecapMediaUploadResult", () => {
  it("removes only the safe paths for the slug", async () => {
    const deps = makeAbortDeps();
    const result = await abortRecapMediaUploadResult(deps, {
      slug: "demo",
      paths: [
        "recaps/demo/1700000000000-a.jpg",
        "recaps/demo/1700000000000-b.jpg",
      ],
    });

    expect(result).toEqual({
      ok: true,
      removed: [
        "recaps/demo/1700000000000-a.jpg",
        "recaps/demo/1700000000000-b.jpg",
      ],
      skipped: [],
    });
    expect(((deps as unknown) as { _removed: string[] })._removed).toEqual([
      "recaps/demo/1700000000000-a.jpg",
      "recaps/demo/1700000000000-b.jpg",
    ]);
  });

  it("skips paths belonging to a different slug", async () => {
    const deps = makeAbortDeps();
    const result = await abortRecapMediaUploadResult(deps, {
      slug: "demo",
      paths: [
        "recaps/demo/1700000000000-a.jpg",
        "recaps/other-event/1700000000000-b.jpg",
      ],
    });

    expect(result.removed).toEqual(["recaps/demo/1700000000000-a.jpg"]);
    expect(result.skipped).toEqual(["recaps/other-event/1700000000000-b.jpg"]);
  });

  it("skips paths with traversal segments", async () => {
    const deps = makeAbortDeps();
    const result = await abortRecapMediaUploadResult(deps, {
      slug: "demo",
      paths: ["recaps/demo/../../etc/passwd"],
    });
    expect(result.removed).toEqual([]);
    expect(result.skipped).toEqual(["recaps/demo/../../etc/passwd"]);
  });

  it("returns ok: true with empty arrays when given an empty list", async () => {
    const deps = makeAbortDeps();
    const result = await abortRecapMediaUploadResult(deps, { slug: "demo", paths: [] });
    expect(result).toEqual({ ok: true, removed: [], skipped: [] });
    expect(((deps as unknown) as { _removed: string[] })._removed).toEqual([]);
  });

  it("is best effort and still returns ok when remove throws", async () => {
    const deps = makeAbortDeps({
      removeRecapObjects: async () => {
        throw new Error("network down");
      },
    });
    const result = await abortRecapMediaUploadResult(deps, {
      slug: "demo",
      paths: ["recaps/demo/1700000000000-a.jpg"],
    });
    expect(result).toEqual({
      ok: true,
      removed: [],
      skipped: ["recaps/demo/1700000000000-a.jpg"],
    });
  });
});
