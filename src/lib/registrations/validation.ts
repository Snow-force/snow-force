import { z } from "zod";
import type { RegistrationFieldConfig } from "@/lib/types";

export function buildRegistrationSchema(fields: RegistrationFieldConfig[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case "email":
        schema = z.string().email("Invalid email");
        break;
      case "tel":
        schema = z.string().min(5, "Phone number too short");
        break;
      case "textarea":
        schema = z.string();
        break;
      case "select":
        schema = z.string();
        break;
      default:
        schema = z.string();
    }

    if (field.required) {
      schema = (schema as z.ZodString).min(1, `${field.key} is required`);
    } else {
      schema = schema.optional().or(z.literal(""));
    }

    shape[field.key] = schema;
  }

  shape.consent = z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms" }),
  });

  return z.object(shape);
}

export type RegistrationFormData = z.infer<ReturnType<typeof buildRegistrationSchema>>;
