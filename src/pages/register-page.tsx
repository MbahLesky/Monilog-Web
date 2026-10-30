import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { FieldShell } from "@/components/forms/field-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuthDivider } from "@/features/auth/auth-divider";
import { AuthLayout } from "@/features/auth/auth-layout";
import { GoogleAuthButton } from "@/features/auth/google-auth-button";
import { registerSchema, type RegisterFormValues } from "@/features/auth/schemas";
import { ROUTES } from "@/routes/route-constants";
import { useAuthStore } from "@/store/auth-store";

export function RegisterPage() {
  const authAvailable = useAuthStore((state) => state.authAvailable);
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const error = useAuthStore((state) => state.error);
  const notice = useAuthStore((state) => state.notice);
  const clearMessages = useAuthStore((state) => state.clearMessages);
  const [googleLoading, setGoogleLoading] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  useEffect(() => {
    return () => clearMessages();
  }, [clearMessages]);

  async function onSubmit(values: RegisterFormValues) {
    try {
      await signUp(values.fullName, values.email, values.password);
    } catch (submitError) {
      form.setError("root", {
        message: submitError instanceof Error ? submitError.message : "Unable to register."
      });
    }
  }

  async function handleGoogle() {
    form.clearErrors("root");
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (submitError) {
      form.setError("root", {
        message: submitError instanceof Error ? submitError.message : "Google sign-in failed."
      });
    } finally {
      setGoogleLoading(false);
    }
  }

  const formError = form.formState.errors.root?.message ?? error;

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your Moniilog account"
      description="Create your account to manage accounts, track expenses, and sync your financial ledger."
    >
      <div className="grid gap-5">
        {!authAvailable ? (
          <Card className="border-dashed border-accent/30 bg-accent/5">
            <CardContent className="p-4 text-sm leading-6 text-muted-foreground">
              Authentication configuration is required.
            </CardContent>
          </Card>
        ) : null}

        {notice ? (
          <Card className="border-secondary/20 bg-secondary/5">
            <CardContent className="p-4 text-sm text-secondary">{notice}</CardContent>
          </Card>
        ) : null}

        {formError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">{formError}</CardContent>
          </Card>
        ) : null}

        <GoogleAuthButton onClick={handleGoogle} disabled={!authAvailable} loading={googleLoading} />

        <AuthDivider label="Or register with email" />

        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldShell label="Full name" error={form.formState.errors.fullName?.message}>
            <Input
              autoComplete="name"
              placeholder="Your name"
              disabled={form.formState.isSubmitting}
              {...form.register("fullName")}
            />
          </FieldShell>

          <FieldShell label="Email" error={form.formState.errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              disabled={form.formState.isSubmitting}
              {...form.register("email")}
            />
          </FieldShell>

          <FieldShell label="Password" error={form.formState.errors.password?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              disabled={form.formState.isSubmitting}
              {...form.register("password")}
            />
          </FieldShell>

          <FieldShell label="Confirm password" error={form.formState.errors.confirmPassword?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              disabled={form.formState.isSubmitting}
              {...form.register("confirmPassword")}
            />
          </FieldShell>

          <Button type="submit" disabled={form.formState.isSubmitting || !authAvailable}>
            {form.formState.isSubmitting ? "Creating account..." : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to={ROUTES.login} className="font-medium text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}
