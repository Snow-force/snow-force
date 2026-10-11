import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { evaluateNewcomerContext } from "../../lib/newcomer-cart-policy";

updateCartPromotionsWorkflow.hooks.setPromotionContext(async ({ cart, promo_codes, action }, { container }) =>
  new StepResponse(await evaluateNewcomerContext(cart, promo_codes, action, container))
);
