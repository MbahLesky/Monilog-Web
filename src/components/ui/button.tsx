import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-card hover:-translate-y-0.5 hover:bg-primary/92",
        secondary:
          "bg-secondary text-secondary-foreground shadow-soft hover:-translate-y-0.5 hover:bg-secondary/92",
        accent: "bg-accent text-accent-foreground hover:bg-accent/92",
        ghost:
          "bg-transparent text-foreground hover:bg-primary/6 hover:text-primary dark:hover:bg-primary/14",
        outline:
          "border border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5",
        subtle:
          "bg-surface-tint text-primary hover:bg-primary/10 dark:bg-surface-tint dark:text-primary-foreground"
      },
      size: {
        default: "h-9 px-3.5 text-xs sm:text-sm",
        sm: "h-8 rounded-md px-2.5 text-xs",
        lg: "h-10 rounded-lg px-4 text-sm",
        icon: "h-9 w-9 rounded-full"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={props.disabled || isLoading}
        {...props}
      >
        {isLoading ? <LoaderCircle className="animate-spin" /> : null}
        {children}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };

