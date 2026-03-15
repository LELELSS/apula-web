const otpStore = new Map<string, string>();

export function saveOtp(email: string, otp: string) {
  otpStore.set(email, otp);
}

export function verifyOtp(email: string, otp: string) {
  return otpStore.get(email) === otp;
}
