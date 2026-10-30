import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldShell } from "@/components/forms/field-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
  type PhoneOtpRequestValues,
  type PhoneOtpVerifyValues
} from "@/features/auth/schemas";
import { useAuthStore } from "@/store/auth-store";

export function PhoneAuthForm({ disabled }: { disabled?: boolean }) {
  const signInWithPhoneOtp = useAuthStore((state) => state.signInWithPhoneOtp);
  const verifyPhoneOtp = useAuthStore((state) => state.verifyPhoneOtp);
  const [targetPhone, setTargetPhone] = useState<string | null>(null);

  const phoneForm = useForm<PhoneOtpRequestValues>({
    resolver: zodResolver(phoneOtpRequestSchema),
    defaultValues: { phone: "" }
  });

  const otpForm = useForm<PhoneOtpVerifyValues>({
    resolver: zodResolver(phoneOtpVerifySchema),
    defaultValues: { phone: "", token: "" }
  });

  async function onRequestOtp(values: PhoneOtpRequestValues) {
    try {
      await signInWithPhoneOtp(values.phone);
      setTargetPhone(values.phone);
      otpForm.setValue("phone", values.phone);
    } catch (error) {
      phoneForm.setError("root", {
        message: error instanceof Error ? error.message : "Failed to send verification code."
      });
    }
  }

  async function onVerifyOtp(values: PhoneOtpVerifyValues) {
    try {
      await verifyPhoneOtp(values.phone, values.token);
    } catch (error) {
      otpForm.setError("root", {
        message: error instanceof Error ? error.message : "Invalid or expired verification code."
      });
    }
  }

  if (targetPhone) {
    return (
      <form className="grid gap-4" onSubmit={otpForm.handleSubmit(onVerifyOtp)}>
        {otpForm.formState.errors.root ? (
          <p className="text-sm font-medium text-destructive">
            {otpForm.formState.errors.root.message}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Enter the 6-digit code sent to <strong className="text-foreground">{targetPhone}</strong>.
        </p>

        <FieldShell label="Verification Code (OTP)" error={otpForm.formState.errors.token?.message}>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            disabled={otpForm.formState.isSubmitting || disabled}
            {...otpForm.register("token")}
          />
        </FieldShell>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setTargetPhone(null);
              otpForm.reset();
            }}
          >
            Use different number
          </button>
          <Button type="submit" disabled={otpForm.formState.isSubmitting || disabled}>
            {otpForm.formState.isSubmitting ? "Verifying..." : "Verify & Continue"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={phoneForm.handleSubmit(onRequestOtp)}>
      {phoneForm.formState.errors.root ? (
        <p className="text-sm font-medium text-destructive">
          {phoneForm.formState.errors.root.message}
        </p>
      ) : null}

      <FieldShell
        label="Phone Number"
        hint="Include country code (e.g. +237...)"
        error={phoneForm.formState.errors.phone?.message}
      >
        <Input
          type="tel"
          autoComplete="tel"
          placeholder="+237 670 000 000"
          disabled={phoneForm.formState.isSubmitting || disabled}
          {...phoneForm.register("phone")}
        />
      </FieldShell>

      <Button type="submit" disabled={phoneForm.formState.isSubmitting || disabled}>
        {phoneForm.formState.isSubmitting ? "Sending OTP..." : "Send Verification Code"}
      </Button>
    </form>
  );
}
