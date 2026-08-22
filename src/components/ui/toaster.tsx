import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  // ✅ MOBILE DETECTION (simple & safe)
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    return null; // ❌ no toast on mobile
  }

  return (
    <ToastProvider duration={1000}>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && (
              <ToastDescription>{description}</ToastDescription>
            )}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}

      {/* Desktop only */}
      <ToastViewport className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm" />
    </ToastProvider>
  );
}
