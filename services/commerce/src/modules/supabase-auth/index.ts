import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import SupabaseAuthProvider from "./service";
export default ModuleProvider(Modules.AUTH, { services: [SupabaseAuthProvider] });
