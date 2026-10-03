import { loginStaff } from "@/lib/auth/admin";

export default async function StaffLoginPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const errorMessage =
    searchParams.error === "unauthorized"
      ? "This account is not authorized for staff access."
      : "Staff credentials are not valid or are not configured.";

  return (
    <div className="py-20">
      <div className="mx-auto max-w-sm px-4">
        <h1 className="text-center text-2xl font-bold text-gray-900">Staff Admin</h1>
        <form action={loginStaff} className="card mt-8 space-y-4">
          <div>
            <label className="label" htmlFor="staff-email">Email</label>
            <input id="staff-email" name="email" type="email" className="input-field" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="staff-password">Password</label>
            <input id="staff-password" name="password" type="password" className="input-field" autoComplete="current-password" required />
          </div>
          {searchParams.error ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
          ) : null}
          <button type="submit" className="btn-primary w-full">Sign in</button>
        </form>
      </div>
    </div>
  );
}
