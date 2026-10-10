import type { LoaderOptions } from "@medusajs/framework/types";
import { assertFullCaptureGuard } from "../lib/full-capture";
import { isManagementMode } from "../lib/operating-mode";

export default async function fullCaptureLoader({ container }: LoaderOptions) {
  if (!isManagementMode()) await assertFullCaptureGuard(container);
}
