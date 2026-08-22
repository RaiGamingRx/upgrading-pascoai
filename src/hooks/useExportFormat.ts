import { useEffect, useState } from "react";

export type ExportFormat = "json" | "txt";

function readFormat(): ExportFormat {
  const v = localStorage.getItem("pasco_export_format");
  return v === "txt" ? "txt" : "json";
}

export function useExportFormat() {
  const [format, setFormat] = useState<ExportFormat>("json");

  useEffect(() => {
    setFormat(readFormat());

    const onStorage = (e: StorageEvent) => {
      if (e.key === "pasco_export_format") {
        setFormat(readFormat());
      }
    };

    const onCustom = () => setFormat(readFormat());

    window.addEventListener("storage", onStorage);
    window.addEventListener(
      "pasco_export_format_changed",
      onCustom as EventListener
    );

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "pasco_export_format_changed",
        onCustom as EventListener
      );
    };
  }, []);

  return format;
}