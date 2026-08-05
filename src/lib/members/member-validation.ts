export type PasswordValidation = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  valid: boolean;
};

const memberEmailPattern = /^[^\s@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function normalizeMemberEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidMemberEmail(value: string) {
  const email = normalizeMemberEmail(value);
  const domain = email.split("@")[1] ?? "";
  const suffix = domain.split(".").at(-1) ?? "";

  return memberEmailPattern.test(email) && /^[A-Za-z]{2,}$/.test(suffix);
}

export function validatePassword(password: string): PasswordValidation {
  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  };

  return {
    ...requirements,
    valid: Object.values(requirements).every(Boolean),
  };
}
