import { describe, expect, it, vi } from "vitest";

import { createMerchantRepository, createMerchantRepositoryFake } from "./repository";

const createSupabaseMerchantRepository = vi.hoisted(() => vi.fn());

vi.mock("./repository-supabase", () => ({ createSupabaseMerchantRepository }));

import { __getMerchantStateDefaultDepsForTests } from "./application-state";

describe("merchant state production dependencies", () => {
  it("uses the server-only Supabase repository instead of the in-memory fake by default", async () => {
    // Given: a durable repository returned by the production factory.
    const durableRepository = createMerchantRepository(createMerchantRepositoryFake());
    createSupabaseMerchantRepository.mockReturnValue(durableRepository);

    // When: no test dependency override is active.
    const dependencies = await __getMerchantStateDefaultDepsForTests();

    // Then: the state machine receives the durable production source.
    expect(createSupabaseMerchantRepository).toHaveBeenCalledOnce();
    expect(dependencies.repository).toBe(durableRepository);
  });
});
