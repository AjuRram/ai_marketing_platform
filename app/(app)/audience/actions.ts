"use server";

import { currentBusinessId } from "@/lib/session";
import { upsertPerson, addToList } from "@/lib/resources/audience";
import { revalidatePath } from "next/cache";

export interface AddPersonInput {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  listSlug?: string;
}

export async function addPersonAction(input: AddPersonInput) {
  const businessId = currentBusinessId();

  const email = input.email.trim();
  if (!email || !email.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }

  const person = upsertPerson(businessId, {
    email,
    name: input.name?.trim() || undefined,
    traits: {
      role: input.role?.trim() || "Member",
      company: input.company?.trim() || undefined,
      lifecycle: "subscriber",
    },
  });

  if (input.listSlug?.trim()) {
    addToList(businessId, input.listSlug.trim(), [email]);
  }

  revalidatePath("/audience");
  return { success: true, person };
}
