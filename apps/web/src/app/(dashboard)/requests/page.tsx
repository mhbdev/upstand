"use client";

import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function RequestsRedirectPage() {
  useEffect(() => {
    redirect("/observation?tab=requests" as any);
  }, []);

  return null;
}
