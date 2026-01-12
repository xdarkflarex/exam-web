"use client";

import { ReactNode } from "react";
import { LoadingProvider } from "@/contexts/LoadingContext";
import LoadingPopup from "@/components/LoadingPopup";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LoadingProvider>
      {children}
      <LoadingPopup />
    </LoadingProvider>
  );
}
