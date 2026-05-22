import Link from "next/link";
import { getRegistrationsByMember } from "@/lib/registrations/repository";
import {
  getCurrentMemberProfile,
  loginMemberProfile,
  logoutMember,
  registerMemberProfile,
  saveMemberProfile,
} from "@/lib/members/actions";

export default async function MemberPage({
  searchParams,
}: {
  searchParams: { error?: string; registered?: string };
}) {
  const profile = await getCurrentMemberProfile();

  if (!profile) {
    return (
      <div className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h1 className="section-title text-center">SnowForce 会员</h1>
          <p className="mt-2 text-center text-gray-500">
            注册会员后可保存报名资料并查看活动记录。已有会员可直接登录。
          </p>
          {searchParams.registered ? (
            <p className="mx-auto mt-5 max-w-2xl rounded-lg bg-green-50 px-4 py-3 text-center text-sm text-green-700">
              注册已提交，请先打开验证邮件完成邮箱确认，然后回到这里登录。
            </p>
          ) : null}
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <form action={registerMemberProfile} className="card space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">注册会员</h2>
                <p className="mt-1 text-sm text-gray-500">Create a member profile for future SnowForce events.</p>
              </div>
              <div>
                <label className="label" htmlFor="register-member-name">姓名</label>
                <input id="register-member-name" name="displayName" className="input-field" required />
              </div>
              <div>
                <label className="label" htmlFor="register-member-email">邮箱</label>
                <input id="register-member-email" name="email" type="email" className="input-field" required />
              </div>
              <div>
                <label className="label" htmlFor="register-member-password">密码</label>
                <input id="register-member-password" name="password" type="password" className="input-field" minLength={6} required />
              </div>
              {searchParams.error === "register" ? (
                <p className="text-sm text-red-600">请填写姓名和有效邮箱后注册。</p>
              ) : null}
              <button className="btn-primary w-full">注册 SnowForce 会员</button>
            </form>
            <form action={loginMemberProfile} className="card space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">会员登录</h2>
                <p className="mt-1 text-sm text-gray-500">Use the email you registered with.</p>
              </div>
              <div>
                <label className="label" htmlFor="login-member-email">注册邮箱</label>
                <input id="login-member-email" name="email" type="email" className="input-field" required />
              </div>
              <div>
                <label className="label" htmlFor="login-member-password">密码</label>
                <input id="login-member-password" name="password" type="password" className="input-field" required />
              </div>
              {searchParams.error === "login" ? (
                <p className="text-sm text-red-600">登录失败，请确认邮箱已验证并检查密码。</p>
              ) : null}
              <button className="btn-secondary w-full">登录</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const registrations = await getRegistrationsByMember(profile.id);

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="section-title">Member Area</h1>
          <form action={logoutMember}><button className="btn-secondary">Sign out</button></form>
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form action={saveMemberProfile} className="card space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Saved profile</h2>
            <div>
              <label className="label" htmlFor="profile-name">Display name</label>
              <input id="profile-name" name="displayName" defaultValue={profile.displayName} className="input-field" required />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={profile.email} className="input-field" disabled />
            </div>
            <div>
              <label className="label" htmlFor="profile-phone">Phone</label>
              <input id="profile-phone" name="phone" defaultValue={profile.phone} className="input-field" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="profile-level-en">Rider level EN</label>
                <input id="profile-level-en" name="riderLevelEn" defaultValue={profile.riderLevel.en} className="input-field" />
              </div>
              <div>
                <label className="label" htmlFor="profile-level-zh">Rider level ZH</label>
                <input id="profile-level-zh" name="riderLevelZh" defaultValue={profile.riderLevel.zh} className="input-field" />
              </div>
            </div>
            <button className="btn-primary">Save profile</button>
          </form>
          <section className="card">
            <h2 className="text-lg font-semibold text-gray-900">Registration history</h2>
            {registrations.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                No member-linked registrations yet. <Link href="/events" className="text-snow-600">Browse events</Link>.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-gray-100">
                {registrations.map((registration) => (
                  <li key={registration.id} className="py-3">
                    <p className="font-medium text-gray-900">{registration.eventSlug}</p>
                    <p className="text-sm text-gray-500">{registration.status} - {new Date(registration.createdAt).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
