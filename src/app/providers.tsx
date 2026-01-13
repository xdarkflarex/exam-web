"use client";

import { ReactNode } from "react";
import { LoadingProvider } from "@/contexts/LoadingContext";
import LoadingOverlay from "@/components/LoadingOverlay";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LoadingProvider>
      {children}
      <LoadingOverlay />
    </LoadingProvider>
  );
}
