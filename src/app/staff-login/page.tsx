import { loginAdmin } from "@/lib/auth/admin";

export default function StaffLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-sm px-4">
        <h1 className="text-center text-2xl font-bold text-gray-900">Staff Admin</h1>
        <form action={loginAdmin} className="card mt-8 space-y-4">
          <div>
            <label className="label" htmlFor="admin-password">Admin password</label>
            <input id="admin-password" name="password" type="password" className="input-field" required />
          </div>
          {searchParams.error ? (
            <p className="text-sm text-red-600">Admin credentials are not valid or are not configured.</p>
          ) : null}
          <button type="submit" className="btn-primary w-full">Sign in</button>
        </form>
      </div>
    </div>
  );
}
