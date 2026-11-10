import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "@/lib/live-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { categoriesRepository } from "@/db/repositories/categories-repository";
import { accountsRepository } from "@/db/repositories/accounts-repository";
import { transactionsRepository } from "@/db/repositories/transactions-repository";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { trackEvent } from "@/services/telemetry-service";
import { FieldShell } from "@/components/forms/field-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { transactionSchema, type TransactionFormValues } from "@/features/transactions/transaction-schema";
import { toDateInputValue } from "@/utils/date-utils";
import type { TransactionRecord } from "@/types";

interface TransactionFormProps {
  initialValue?: TransactionRecord;
  userId?: string | null;
  submitLabel?: string;
  onSubmitted?: () => void;
}

export function TransactionForm({
  initialValue,
  userId,
  submitLabel = "Save transaction",
  onSubmitted
}: TransactionFormProps) {
  const accounts = useLiveQuery(() => accountsRepository.listActive(), []);
  const categories = useLiveQuery(() => categoriesRepository.listActive(), []);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: initialValue?.amount ?? 0,
      type: initialValue?.type ?? "expense",
      categoryId: initialValue?.categoryId ?? "",
      accountId: initialValue?.accountId ?? "",
      description: initialValue?.description ?? "",
      affectsAccountBalance: initialValue?.affectsAccountBalance ?? true,
      transactionDate: initialValue?.transactionDate ?? toDateInputValue()
    }
  });

  const selectedType = form.watch("type");
  const typeCategories = (categories ?? []).filter((category) => category.type === selectedType);

  useEffect(() => {
    if (!form.getValues("accountId") && accounts?.[0]?.id) {
      form.setValue("accountId", accounts[0].id);
    }
  }, [accounts, form]);

  useEffect(() => {
    if (!typeCategories.length) {
      return;
    }

    const currentCategoryId = form.getValues("categoryId");
    const categoryStillValid = typeCategories.some((category) => category.id === currentCategoryId);

    if (!categoryStillValid) {
      form.setValue("categoryId", typeCategories[0].id);
    }
  }, [form, typeCategories]);

  async function onSubmit(values: TransactionFormValues) {
    try {
      if (initialValue) {
        await transactionsRepository.updateTransaction(initialValue.id, {
          ...values,
          userId
        });
        toast.success("Transaction updated.");
      } else {
        await transactionsRepository.createTransaction({
          ...values,
          userId
        });
        toast.success("Transaction saved to database.");
        // Amount is deliberately omitted — event parameters must not carry a
        // user's actual financial figures.
        trackEvent(ANALYTICS_EVENTS.transactionAdded, {
          type: values.type,
          affects_balance: values.affectsAccountBalance,
          has_description: Boolean(values.description?.trim())
        });
        form.reset({
          amount: 0,
          type: values.type,
          categoryId: values.categoryId,
          accountId: values.accountId,
          description: "",
          affectsAccountBalance: values.affectsAccountBalance,
          transactionDate: toDateInputValue()
        });
      }

      onSubmitted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save this transaction.");
    }
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-5 md:grid-cols-2">
        <FieldShell label="Amount" htmlFor="amount" error={form.formState.errors.amount?.message}>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            hasError={Boolean(form.formState.errors.amount)}
            {...form.register("amount")}
          />
        </FieldShell>

        <FieldShell label="Type" htmlFor="type" error={form.formState.errors.type?.message}>
          <Select
            value={form.watch("type")}
            onValueChange={(value) => form.setValue("type", value as TransactionFormValues["type"])}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
        </FieldShell>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <FieldShell label="Category" htmlFor="categoryId" error={form.formState.errors.categoryId?.message}>
          <Select
            value={form.watch("categoryId")}
            onValueChange={(value) => form.setValue("categoryId", value)}
          >
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {typeCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>

        <FieldShell label="Account" htmlFor="accountId" error={form.formState.errors.accountId?.message}>
          <Select
            value={form.watch("accountId")}
            onValueChange={(value) => form.setValue("accountId", value)}
          >
            <SelectTrigger id="accountId">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {(accounts ?? []).map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      </div>

      <FieldShell label="Date" htmlFor="transactionDate" error={form.formState.errors.transactionDate?.message}>
        <Input
          id="transactionDate"
          type="date"
          hasError={Boolean(form.formState.errors.transactionDate)}
          {...form.register("transactionDate")}
        />
      </FieldShell>

      <FieldShell label="Note" htmlFor="description" error={form.formState.errors.description?.message}>
        <Textarea
          id="description"
          placeholder="Add a short note if it helps later."
          hasError={Boolean(form.formState.errors.description)}
          {...form.register("description")}
        />
      </FieldShell>

      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Affects account balance</p>
          <p className="text-xs text-muted-foreground">
            Turn off to record a transaction without moving the account balance.
          </p>
        </div>
        <Switch
          checked={form.watch("affectsAccountBalance")}
          onCheckedChange={(checked) => form.setValue("affectsAccountBalance", checked)}
        />
      </div>

      <Button type="submit" isLoading={form.formState.isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
