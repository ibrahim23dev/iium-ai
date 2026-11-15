import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import ProfilePreferences from "@/components/profile-preferences";
import ProfilePrivacyControls from "@/components/profile-privacy-controls";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, include: { accounts: { select: { provider: true } } } });
  if (!user) redirect("/");
  return <main className="profile-page"><header className="profile-page-header"><Link href="/" className="profile-brand"><Image src="/icon.png" alt="IIUM AI" width={39} height={32} /><span>IIUM AI</span></Link><Link className="profile-back" href="/">Back to chat</Link></header><section className="profile-card"><div className="profile-page-title"><span>ACCOUNT</span><h1>My profile</h1><p>Manage your account details and preferences.</p></div><div className="profile-identity"><Image src={user.image || "/icon.png"} alt="Profile picture" width={72} height={72} className="profile-photo" unoptimized={!user.image} /><div><h2>{user.name || "IIUM AI user"}</h2><p>{user.email || "No email available"}</p></div></div><dl className="profile-details"><div><dt>Account type</dt><dd>Google account</dd></div><div><dt>Authentication</dt><dd>{user.accounts.map((account) => account.provider).join(", ") || "Google"}</dd></div><div><dt>Member since</dt><dd>{user.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</dd></div><div><dt>Email verification</dt><dd>{user.emailVerified ? "Verified" : "Not verified"}</dd></div></dl><ProfilePreferences theme={user.theme} language={user.language} /><p className="profile-data-note">Conversations sync to your Google account or guest session when MongoDB is reachable. A browser copy is also kept; guest cloud conversations expire after 30 days.</p><ProfilePrivacyControls /></section></main>;
}
