import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { listDepartments, listEmployees, listJournalEntries, listTasks } from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  crm: router({
    employees: publicProcedure.query(() => listEmployees()),
    journal: publicProcedure.query(() => listJournalEntries()),
    tasks: publicProcedure.query(() => listTasks()),
    departments: publicProcedure.query(() => listDepartments()),
  }),
});

export type AppRouter = typeof appRouter;
