import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.")
});

export const registerSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name."),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm your password.")
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match."
  });

export const phoneOtpRequestSchema = z.object({
  phone: z.string().min(8, "Enter a valid phone number with country code (e.g. +237670000000).")
});

export const phoneOtpVerifySchema = z.object({
  phone: z.string().min(8, "Enter a valid phone number."),
  token: z.string().min(6, "Enter the 6-digit OTP code.")
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type PhoneOtpRequestValues = z.infer<typeof phoneOtpRequestSchema>;
export type PhoneOtpVerifyValues = z.infer<typeof phoneOtpVerifySchema>;
