// Preserve the installed Stripe provider identifier and public payment methods.
import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import SnowforceStripe from "./service";
export default ModuleProvider(Modules.PAYMENT, { services: [SnowforceStripe] });
