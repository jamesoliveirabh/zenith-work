import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("mescla classes sem conflito", () => {
    expect(cn("px-2 py-1", "text-sm")).toBe("px-2 py-1 text-sm");
  });

  it("resolve conflitos do Tailwind mantendo a última classe", () => {
    expect(cn("px-2", "px-4", "font-medium", "font-bold")).toBe("px-4 font-bold");
  });
});
