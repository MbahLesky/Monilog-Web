import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { FieldShell } from "@/components/forms/field-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthDivider } from "@/features/auth/auth-divider";
import { AuthLayout } from "@/features/auth/auth-layout";
import { GoogleAuthButton } from "@/features/auth/google-auth-button";
import { PhoneAuthForm } from "@/features/auth/phone-auth-form";
import { ROUTES } from "@/routes/route-constants";
import { loginSchema, type LoginFormValues } from "@/features/auth/schemas";
import { useAuthStore } from "@/store/auth-store";

export function LoginPage() {
  const authAvailable = useAuthStore((state) => state.authAvailable);
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const error = useAuthStore((state) => state.error);
  const notice = useAuthStore((state) => state.notice);
  const clearMessages = useAuthStore((state) => state.clearMessages);
  const [googleLoading, setGoogleLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  useEffect(() => {
    return () => clearMessages();
  }, [clearMessages]);

  async function onSubmit(values: LoginFormValues) {
    try {
      await signIn(values.email, values.password);
    } catch (submitError) {
      form.setError("root", {
        message: submitError instanceof Error ? submitError.message : "Unable to log in."
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

  async function handleForgotPassword() {
    const email = form.getValues("email");
    if (!email) {
      form.setError("email", { message: "Enter your email first to reset your password." });
      return;
    }

    try {
      await resetPassword(email);
    } catch (submitError) {
      form.setError("root", {
        message: submitError instanceof Error ? submitError.message : "Unable to send reset email."
      });
    }
  }

  const formError = form.formState.errors.root?.message ?? error;

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Log in to Moniilog"
      description="Access your accounts, sync your financial ledger across web and mobile, and connect your WhatsApp number."
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
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 text-sm text-primary">{notice}</CardContent>
          </Card>
        ) : null}

        {formError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">{formError}</CardContent>
          </Card>
        ) : null}

        <GoogleAuthButton label="Continue with Google" onClick={handleGoogle} disabled={!authAvailable} isLoading={googleLoading} />

        <AuthDivider label="Or sign in with" />

        <Tabs defaultValue="email" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="phone" className="gap-1.5">
              <span>Phone</span>
              <span className="rounded bg-amber-500/15 px-1 py-0.2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                Soon
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="phone" className="pt-2">
            <PhoneAuthForm disabled={!authAvailable} />
          </TabsContent>

          <TabsContent value="email" className="pt-2">
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
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
                  autoComplete="current-password"
                  placeholder="Your password"
                  disabled={form.formState.isSubmitting}
                  {...form.register("password")}
                />
              </FieldShell>

              <div className="flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={handleForgotPassword}
                >
                  Forgot password?
                </button>
                <Link
                  to={ROUTES.register}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Create account
                </Link>
              </div>

              <Button type="submit" disabled={form.formState.isSubmitting || !authAvailable}>
                {form.formState.isSubmitting ? "Logging in..." : "Log in"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </AuthLayout>
  );
}
