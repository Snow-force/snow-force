import {
  getStaffManagementAccounts,
  grantStaffRoleAction,
  revokeStaffRoleAction,
  updateStaffRoleAction,
} from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

const errorCopy: Record<string, string> = {
  invalid: "Enter a valid email and role.",
  "invalid-role": "Choose a valid staff role.",
  "last-admin": "At least one admin must remain.",
  "unknown-user": "That email does not belong to an existing Supabase user.",
};

const controlClass =
  "block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-snow-500 focus:ring-2 focus:ring-snow-100";

export default async function AdminStaffPage(
  props: {
    searchParams: Promise<{ error?: string; saved?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const staffAccounts = await getStaffManagementAccounts();
  const message = searchParams.error
    ? errorCopy[searchParams.error] ?? "Staff access could not be updated."
    : searchParams.saved
      ? "Staff access updated."
      : "";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Staff permissions</h2>
          <p className="mt-1 text-sm text-gray-500">
            Grant dashboard access to existing Supabase Auth users.
          </p>
        </div>
        {message ? (
          <p className={`text-sm ${searchParams.error ? "text-red-600" : "text-green-600"}`}>
            {message}
          </p>
        ) : null}
      </div>

      <form action={grantStaffRoleAction} className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[minmax(260px,1fr)_180px_auto]">
        <div>
          <label className="label" htmlFor="staff-email">Existing user email</label>
          <input id="staff-email" name="email" type="email" className={controlClass} required />
        </div>
        <div>
          <label className="label" htmlFor="staff-role">Role</label>
          <select id="staff-role" name="role" className={controlClass} defaultValue="manager">
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0066cc] px-4 text-sm font-semibold text-white transition hover:bg-[#005bb8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc] md:w-auto">
            Grant access
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-400">
              <th className="py-3 pr-4">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="py-3 pl-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staffAccounts.map((account) => (
              <tr key={account.userId} className="align-middle hover:bg-gray-50">
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-900">{account.email}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{account.userId}</p>
                </td>
                <td className="px-4 py-3">
                  <form action={updateStaffRoleAction} className="flex max-w-xs gap-2">
                    <input type="hidden" name="userId" value={account.userId} />
                    <select name="role" className={controlClass} defaultValue={account.role}>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
                      Save
                    </button>
                  </form>
                </td>
                <td className="py-3 pl-4">
                  <form action={revokeStaffRoleAction}>
                    <input type="hidden" name="userId" value={account.userId} />
                    <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                      Revoke
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {staffAccounts.length === 0 ? (
              <tr>
                <td className="py-4 text-sm text-gray-400" colSpan={3}>
                  No staff accounts yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
