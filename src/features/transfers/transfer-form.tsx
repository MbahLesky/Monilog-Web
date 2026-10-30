import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FieldShell } from "@/components/forms/field-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { settingsRepository } from "@/db/repositories/settings-repository";
import { transfersRepository } from "@/db/repositories/transfers-repository";
import { transferSchema, type TransferFormValues } from "@/features/transfers/transfer-schema";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { trackEvent } from "@/services/telemetry-service";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import type { TransferRecord } from "@/types";
import { toDateInputValue } from "@/utils/date-utils";
import { formatCurrency } from "@/utils/formatting";

interface TransferFormProps {
  initialValue?: TransferRecord;
  userId?: string | null;
  submitLabel?: string;
  onSubmitted?: () => void;
}

export function TransferForm({ initialValue, userId, submitLabel = "Save transfer", onSubmitted }: TransferFormProps) {
  const accounts = useLiveQuery(() => accountsRepository.listWithBalances(), []);
  const settings = useLiveQuery(() => settingsRepository.getSettings(), []);
  const currencyCode = settings?.currencyCode ?? DEFAULT_CURRENCY;

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    mode: "onChange",
    defaultValues: {
      fromAccountId: initialValue?.fromAccountId ?? "",
      toAccountId: initialValue?.toAccountId ?? "",
      amount: initialValue?.amount ?? 0,
      sourceFee: initialValue?.sourceFee ?? 0,
      destinationFee: initialValue?.destinationFee ?? 0,
      transferDate: initialValue?.transferDate ?? toDateInputValue(),
      description: initialValue?.description ?? ""
    }
  });

  const fromAccountId = form.watch("fromAccountId");
  const toAccountId = form.watch("toAccountId");
  const amount = Number(form.watch("amount") ?? 0);
  const sourceFee = Number(form.watch("sourceFee") ?? 0);
  const destinationFee = Number(form.watch("destinationFee") ?? 0);

  useEffect(() => {
    if (!accounts?.length || initialValue) {
      return;
    }

    const currentFromAccount = form.getValues("fromAccountId");
    const currentToAccount = form.getValues("toAccountId");

    if (!currentFromAccount) {
      form.setValue("fromAccountId", accounts[0].id, { shouldValidate: true });
    }

    if (!currentToAccount) {
      const fallbackDestination = accounts.find((account) => account.id !== accounts[0].id);
      if (fallbackDestination) {
        form.setValue("toAccountId", fallbackDestination.id, { shouldValidate: true });
      }
    }
  }, [accounts, form, initialValue]);

  const fromAccount = useMemo(
    () => (accounts ?? []).find((account) => account.id === fromAccountId),
    [accounts, fromAccountId]
  );

  // When editing, the existing transfer's debit is still reflected in currentBalance,
  // so add it back to evaluate available balance as if this transfer didn't exist.
  const editingAddback =
    initialValue && initialValue.fromAccountId === fromAccountId
      ? initialValue.amount + initialValue.sourceFee
      : 0;
  const sourceBalance = (fromAccount?.currentBalance ?? 0) + editingAddback;
  const totalDebit = amount + sourceFee;
  const insufficientBalance = totalDebit > sourceBalance;
  const amountError =
    form.formState.errors.amount?.message ??
    (insufficientBalance ? "Insufficient source balance for amount plus source fee." : undefined);

  async function onSubmit(values: TransferFormValues) {
    if (insufficientBalance) {
      form.setError("amount", {
        message: "Insufficient source balance for amount plus source fee."
      });
      return;
    }

    try {
      if (initialValue) {
        await transfersRepository.updateTransfer(initialValue.id, { ...values, userId });
        toast.success("Transfer updated.");
      } else {
        await transfersRepository.createTransfer({ ...values, userId });
        toast.success("Transfer saved locally.");
        // Fee presence is useful signal; the amounts themselves are not sent.
        trackEvent(ANALYTICS_EVENTS.transferCreated, {
          has_source_fee: Number(values.sourceFee) > 0,
          has_destination_fee: Number(values.destinationFee) > 0
        });
        form.reset({
          ...values,
          amount: 0,
          sourceFee: 0,
          destinationFee: 0,
          description: "",
          transferDate: toDateInputValue()
        });
      }
      onSubmitted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save this transfer.");
    }
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-5 md:grid-cols-2">
        <FieldShell
          label="From account"
          htmlFor="fromAccountId"
          hint={fromAccount ? `Available ${formatCurrency(sourceBalance, currencyCode)}` : undefined}
          error={form.formState.errors.fromAccountId?.message}
        >
          <Select
            value={fromAccountId}
            onValueChange={(value) => {
              form.setValue("fromAccountId", value, { shouldValidate: true });
              if (value === toAccountId) {
                const fallbackDestination = (accounts ?? []).find((account) => account.id !== value);
                form.setValue("toAccountId", fallbackDestination?.id ?? "", { shouldValidate: true });
              }
            }}
          >
            <SelectTrigger id="fromAccountId">
              <SelectValue placeholder="Choose source account" />
            </SelectTrigger>
            <SelectContent>
              {(accounts ?? []).map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({formatCurrency(account.currentBalance, currencyCode)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>

        <FieldShell label="To account" htmlFor="toAccountId" error={form.formState.errors.toAccountId?.message}>
          <Select
            value={toAccountId}
            onValueChange={(value) => form.setValue("toAccountId", value, { shouldValidate: true })}
          >
            <SelectTrigger id="toAccountId">
              <SelectValue placeholder="Choose destination account" />
            </SelectTrigger>
            <SelectContent>
              {(accounts ?? [])
                .filter((account) => account.id !== fromAccountId)
                .map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FieldShell>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <FieldShell label="Amount" htmlFor="amount" error={amountError}>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            hasError={Boolean(amountError)}
            {...form.register("amount")}
          />
        </FieldShell>

        <FieldShell label="Source fee" htmlFor="sourceFee" error={form.formState.errors.sourceFee?.message}>
          <Input
            id="sourceFee"
            type="number"
            step="0.01"
            min="0"
            hasError={Boolean(form.formState.errors.sourceFee)}
            {...form.register("sourceFee")}
          />
        </FieldShell>

        <FieldShell
          label="Destination fee"
          htmlFor="destinationFee"
          error={form.formState.errors.destinationFee?.message}
        >
          <Input
            id="destinationFee"
            type="number"
            step="0.01"
            min="0"
            hasError={Boolean(form.formState.errors.destinationFee)}
            {...form.register("destinationFee")}
          />
        </FieldShell>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <FieldShell label="Date" htmlFor="transferDate" error={form.formState.errors.transferDate?.message}>
          <Input
            id="transferDate"
            type="date"
            hasError={Boolean(form.formState.errors.transferDate)}
            {...form.register("transferDate")}
          />
        </FieldShell>

        <FieldShell label="Transfer impact" htmlFor="summary">
          <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
            Source debit{" "}
            <span className="font-semibold text-foreground">{formatCurrency(totalDebit, currencyCode)}</span> ·
            Destination credit{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(Math.max(amount - destinationFee, 0), currencyCode)}
            </span>
          </div>
        </FieldShell>
      </div>

      <FieldShell label="Note" htmlFor="description" error={form.formState.errors.description?.message}>
        <Textarea
          id="description"
          placeholder="Optional context for this transfer."
          hasError={Boolean(form.formState.errors.description)}
          {...form.register("description")}
        />
      </FieldShell>

      <Button
        type="submit"
        isLoading={form.formState.isSubmitting}
        disabled={!form.formState.isValid || insufficientBalance || (accounts?.length ?? 0) < 2}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
