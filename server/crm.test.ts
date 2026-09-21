import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("crm public procedures", () => {
  it("returns list-shaped data for each workspace collection", async () => {
    const caller = appRouter.createCaller(createContext());
    const [employees, journal, tasks, departments] = await Promise.all([
      caller.crm.employees(),
      caller.crm.journal(),
      caller.crm.tasks(),
      caller.crm.departments(),
    ]);

    expect(Array.isArray(employees)).toBe(true);
    expect(Array.isArray(journal)).toBe(true);
    expect(Array.isArray(tasks)).toBe(true);
    expect(Array.isArray(departments)).toBe(true);
  });
});
