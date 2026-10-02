"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button onClick={() => window.print()} data-testid="print-now">
      <Printer className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
