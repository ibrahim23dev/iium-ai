import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import ProfilePreferences from "@/components/profile-preferences";
import ProfilePrivacyControls from "@/components/profile-privacy-controls";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true, email: true, image: true, theme: true, language: true,
      createdAt: true, emailVerified: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) redirect("/");

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/icon.png" alt="IIUM AI" width={30} height={25} />
            <span className="font-bold">IIUM AI</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
            <ArrowLeft size={15} /> Back to chat
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-brand-600">ACCOUNT</p>
          <h1 className="mt-1 text-3xl font-bold">My profile</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">Manage your account details and preferences.</p>
        </div>

        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="flex items-center gap-4">
            <Image
              src={user.image || "/icon.png"}
              alt="Profile"
              width={72} height={72}
              className="rounded-full object-cover ring-2 ring-[var(--border)]"
              unoptimized={!user.image}
            />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">{user.name || "IIUM AI user"}</h2>
              <p className="text-sm text-[var(--fg-muted)] truncate">{user.email || "No email"}</p>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Detail label="Account type" value={user.accounts.length ? "Google account" : "Email account"} />
            <Detail label="Authentication" value={user.accounts.map((a) => a.provider).join(", ") || "Email and password"} />
            <Detail
              label="Member since"
              value={user.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            />
            <Detail label="Email verification" value={user.emailVerified ? "Verified" : "Not verified"} />
          </dl>
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <ProfilePreferences theme={user.theme} language={user.language} />
        </div>

        <p className="mt-4 text-xs text-[var(--fg-muted)]">
          Conversations sync to your account or guest session when MongoDB is reachable.
          A browser copy is also kept; guest cloud conversations expire after 30 days.
        </p>

        <div className="mt-6 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-6">
          <ProfilePrivacyControls />
        </div>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--fg-muted)]">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
