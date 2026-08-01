import { AppShell } from "@/components/shell/AppShell";
import { currentBusiness, currentUser, PLAN_LIMITS } from "@/lib/session";

/**
 * Every authenticated surface renders inside this layout.
 *
 * The shell's data is resolved on the SERVER and passed down as props, so the
 * sidebar — including the credits meter — is present in the first HTML byte.
 * Fetching it client-side would give every page a visible layout shift on load
 * and would make the shell flash empty on every navigation.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const business = currentBusiness();
  const user = currentUser();

  return (
    <AppShell
      business={{
        name: business.name,
        planLabel: PLAN_LIMITS[business.plan].label,
        creditsUsed: business.creditsUsed,
        creditsLimit: business.creditsLimit,
        userName: user.name,
        userEmail: user.email,
      }}
    >
      {children}
    </AppShell>
  );
}
