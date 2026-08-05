import { changeMemberPassword } from "@/lib/members/actions";

export function SecurityForm() {
  return (
    <form id="security" action={changeMemberPassword} className="card space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Security</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          Change your member login password. This does not change past event registration details.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="change-password">New password</label>
          <input id="change-password" name="password" type="password" className="input-field" minLength={8} required />
        </div>
        <div>
          <label className="label" htmlFor="change-confirm-password">Confirm password</label>
          <input id="change-confirm-password" name="confirmPassword" type="password" className="input-field" minLength={8} required />
        </div>
      </div>
      <button className="btn-secondary w-full sm:w-auto">Change password</button>
    </form>
  );
}
