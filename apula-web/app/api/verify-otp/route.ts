// /app/api/verify-otp/route.ts
import { NextResponse } from "next/server";
import { verifyOtp } from "../otp-store";

export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // ✅ Check OTP validity only
    const isValid = verifyOtp(email, otp);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    // ✅ OTP verified — no Firestore write yet
    // The frontend can now proceed to the password setup step
    return NextResponse.json({
      success: true,
      message: "OTP verified successfully. Proceed to set password.",
    });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    return NextResponse.json({ error: "Failed to verify OTP" }, { status: 500 });
  }
}
