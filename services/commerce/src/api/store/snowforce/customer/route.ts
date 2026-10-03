import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { IAuthModuleService, ICustomerModuleService, ILockingModule } from "@medusajs/framework/types";
import { Modules, MedusaError } from "@medusajs/framework/utils";
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows";

// No supplied email/customer ID is used. Identity comes from the verified auth provider.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const authIdentityId = req.auth_context.auth_identity_id;
  const auth = req.scope.resolve<IAuthModuleService>(Modules.AUTH);
  const customers = req.scope.resolve<ICustomerModuleService>(Modules.CUSTOMER);
  const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING);
  const customer = await locking.execute(`snowforce-customer:${authIdentityId}`, async (signal) => {
    const identity = await auth.retrieveAuthIdentity(authIdentityId, { relations: ["provider_identities"] });
    const provider = identity.provider_identities?.find((item) => item.provider === "supabase");
    if (!provider || !/^[0-9a-f-]{36}$/i.test(provider.entity_id) || typeof provider.user_metadata?.email !== "string") throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
    const customerId = identity.app_metadata?.customer_id;
    if (typeof customerId === "string" && customerId) return customers.retrieveCustomer(customerId);
    if (signal?.aborted) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Customer registration lock expired.");
    const { result } = await createCustomerAccountWorkflow(req.scope).run({
      input: { authIdentityId, customerData: { email: provider.user_metadata.email } },
    });
    return result;
  }, { timeout: 15, expire: 60 });
  // Public safe fields only. A fresh JWT is obtained by the storefront after registration.
  res.status(200).json({ customer: { id: customer.id } });
}
