import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise, must be awaited.
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  // Single-user app: if already signed in, /login has nothing to do here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/");
  }

  const { error, message } = await searchParams;

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="card-bold w-full max-w-sm p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="display text-4xl">
            TV
            <br />
            Tracker
          </h1>
          <span className="stamp text-xs">Track it</span>
        </div>

        {error ? (
          <p className="mb-4 border-[3px] border-ink bg-acid/40 p-3 text-sm font-medium text-ink">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mb-4 border-[3px] border-ink bg-panel p-3 text-sm font-medium text-ink">
            {message}
          </p>
        ) : null}

        <form className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold uppercase tracking-wide">
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              className="border-[3px] border-ink bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-acid"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold uppercase tracking-wide">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="border-[3px] border-ink bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-acid"
            />
          </label>

          <div className="mt-2 flex flex-col gap-3">
            <button
              type="submit"
              formAction={signIn}
              className="hard-shadow-sm border-[3px] border-ink bg-acid px-4 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Sign in
            </button>
            <button
              type="submit"
              formAction={signUp}
              className="hard-shadow-sm border-[3px] border-ink bg-paper px-4 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Create account
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
