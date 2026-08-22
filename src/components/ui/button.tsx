import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none touch-manipulation [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground font-semibold hover:bg-primary/90 hover:shadow-[0_0_16px_hsl(var(--primary)/0.35)] active:shadow-none transition-shadow",
        cyber:
          "bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold shadow-sm hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_0_16px_hsl(var(--destructive)/0.35)]",
        outline:
          "border border-border/80 bg-card/40 backdrop-blur-sm text-foreground hover:bg-muted/80 hover:text-foreground hover:border-primary/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/85 hover:shadow-[0_0_16px_hsl(var(--secondary)/0.35)]",
        ghost:
          "hover:bg-muted/80 hover:text-foreground active:bg-muted",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto active:scale-100",
        success:
          "bg-success text-success-foreground font-semibold hover:bg-success/90 hover:shadow-[0_0_16px_hsl(var(--success)/0.35)]",
        subtle:
          "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40",
      },
      size: {
        default: "h-10 px-4 py-2 min-h-[40px] sm:min-h-[38px]",
        sm: "h-8.5 rounded-md px-3 text-xs min-h-[34px]",
        lg: "h-11 rounded-lg px-6 text-sm md:text-base min-h-[44px]",
        xl: "h-12 sm:h-13 rounded-lg px-8 text-base font-semibold min-h-[48px]",
        icon: "h-10 w-10 min-h-[40px] min-w-[40px]",
        iconSm: "h-8 w-8 min-h-[32px] min-w-[32px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
