"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Single-user app: sign in is the everyday path, sign up only happens once
// (first run). Both actions share the same form/fields on /login.

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Revalidate everything under the root layout so server components (e.g.
  // the Home page's user greeting) pick up the freshly authenticated session.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // If Supabase's "Confirm email" setting is ON, signUp succeeds but returns
  // no session until the user clicks the confirmation link — send them back
  // with an info message instead of treating this as a full sign-in.
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent("Check your email to confirm your account.")}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
