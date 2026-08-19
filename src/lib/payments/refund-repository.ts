import "server-only";

import type {
  PaymentCurrency,
  RegistrationRefund,
  RegistrationRefundReason,
  RegistrationRefundStatus,
} from "@/lib/types";
import { createJsonArrayStore, workspaceDataPath } from "@/lib/server/json-store";
import { createAdminClient } from "@/lib/supabase/server";

export type NewRegistrationRefund = {
  id: string;
  registrationId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: PaymentCurrency;
  status: RegistrationRefundStatus;
  reason: RegistrationRefundReason;
  internalNote: string;
  initiatedBy: string | null;
};

export type RegistrationRefundUpdate = Partial<
  Pick<RegistrationRefund, "stripeRefundId" | "status" | "failureReason" | "amount" | "currency">
>;

export type RegistrationRefundSource = {
  list(registrationId?: string): Promise<RegistrationRefund[]>;
  get(id: string): Promise<RegistrationRefund | undefined>;
  getByStripeRefundId(stripeRefundId: string): Promise<RegistrationRefund | undefined>;
  create(input: NewRegistrationRefund): Promise<RegistrationRefund>;
  update(id: string, input: RegistrationRefundUpdate): Promise<RegistrationRefund | undefined>;
};

type RegistrationRefundRow = {
  id: string;
  registration_id: string;
  stripe_refund_id: string | null;
  stripe_payment_intent_id: string;
  amount: number;
  currency: PaymentCurrency;
  status: RegistrationRefundStatus;
  reason: RegistrationRefundReason;
  internal_note: string;
  initiated_by: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

function rowToRefund(row: RegistrationRefundRow): RegistrationRefund {
  return {
    id: row.id,
    registrationId: row.registration_id,
    stripeRefundId: row.stripe_refund_id ?? "",
    stripePaymentIntentId: row.stripe_payment_intent_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    reason: row.reason,
    internalNote: row.internal_note,
    initiatedBy: row.initiated_by,
    failureReason: row.failure_reason ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function newRefundToRow(input: NewRegistrationRefund) {
  return {
    id: input.id,
    registration_id: input.registrationId,
    stripe_refund_id: null,
    stripe_payment_intent_id: input.stripePaymentIntentId,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    reason: input.reason,
    internal_note: input.internalNote,
    initiated_by: input.initiatedBy,
  };
}

function updateToRow(input: RegistrationRefundUpdate) {
  return {
    ...(input.stripeRefundId !== undefined ? { stripe_refund_id: input.stripeRefundId || null } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.failureReason !== undefined ? { failure_reason: input.failureReason || null } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    updated_at: new Date().toISOString(),
  };
}

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function createRegistrationRefundStore(filePath: string): RegistrationRefundSource {
  const store = createJsonArrayStore<RegistrationRefund>(filePath);
  return {
    async list(registrationId) {
      const rows = await store.read();
      return registrationId ? rows.filter((row) => row.registrationId === registrationId) : rows;
    },
    async get(id) {
      return (await store.read()).find((row) => row.id === id);
    },
    async getByStripeRefundId(stripeRefundId) {
      return (await store.read()).find((row) => row.stripeRefundId === stripeRefundId);
    },
    async create(input) {
      const rows = await store.read();
      const now = new Date().toISOString();
      const refund: RegistrationRefund = {
        ...input,
        stripeRefundId: "",
        failureReason: "",
        createdAt: now,
        updatedAt: now,
      };
      await store.write([...rows, refund]);
      return refund;
    },
    async update(id, input) {
      const rows = await store.read();
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return undefined;
      rows[index] = { ...rows[index], ...input, updatedAt: new Date().toISOString() };
      await store.write(rows);
      return rows[index];
    },
  };
}

function createSupabaseRegistrationRefundSource(): RegistrationRefundSource {
  return {
    async list(registrationId) {
      let query = createAdminClient()
        .from("registration_refunds")
        .select("*")
        .order("created_at", { ascending: false });
      if (registrationId) query = query.eq("registration_id", registrationId);
      const { data, error } = await query;
      throwSupabaseError(error);
      return ((data ?? []) as RegistrationRefundRow[]).map(rowToRefund);
    },
    async get(id) {
      const { data, error } = await createAdminClient()
        .from("registration_refunds")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToRefund(data as RegistrationRefundRow) : undefined;
    },
    async getByStripeRefundId(stripeRefundId) {
      const { data, error } = await createAdminClient()
        .from("registration_refunds")
        .select("*")
        .eq("stripe_refund_id", stripeRefundId)
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToRefund(data as RegistrationRefundRow) : undefined;
    },
    async create(input) {
      const { data, error } = await createAdminClient()
        .from("registration_refunds")
        .insert(newRefundToRow(input))
        .select("*")
        .single();
      throwSupabaseError(error);
      return rowToRefund(data as RegistrationRefundRow);
    },
    async update(id, input) {
      const { data, error } = await createAdminClient()
        .from("registration_refunds")
        .update(updateToRow(input))
        .eq("id", id)
        .select("*")
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToRefund(data as RegistrationRefundRow) : undefined;
    },
  };
}

export function createRegistrationRefundRepository(source: RegistrationRefundSource) {
  return {
    getRegistrationRefunds: source.list,
    getRegistrationRefund: source.get,
    getRegistrationRefundByStripeId: source.getByStripeRefundId,
    createRegistrationRefund: source.create,
    updateRegistrationRefund: source.update,
  };
}

const source = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createSupabaseRegistrationRefundSource()
  : createRegistrationRefundStore(workspaceDataPath("registration-refunds.json"));

const repository = createRegistrationRefundRepository(source);

export const getRegistrationRefunds = repository.getRegistrationRefunds;
export const getRegistrationRefund = repository.getRegistrationRefund;
export const getRegistrationRefundByStripeId = repository.getRegistrationRefundByStripeId;
export const createRegistrationRefund = repository.createRegistrationRefund;
export const updateRegistrationRefund = repository.updateRegistrationRefund;
