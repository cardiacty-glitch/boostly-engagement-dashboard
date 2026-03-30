import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const auth = cookieStore.get("bd_auth")?.value;
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password || auth !== password) {
    redirect("/login");
  }

  return <>{children}</>;
}
