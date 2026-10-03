import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import SnowforceFulfillment from "./service";
export default ModuleProvider(Modules.FULFILLMENT, { services: [SnowforceFulfillment] });
