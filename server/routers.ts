import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminRouter, commerceRouter } from "./routers/commerce";
import { createLocalAdminSessionToken, getLocalAdminOpenId, isLocalAdminEnabled, verifyLocalAdminPassword } from "./_core/localAdmin";
import * as db from "./db";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Login local do admin (deploy externo sem OAuth Manus):
    // ADMIN_EMAIL + ADMIN_PASSWORD definidos nas envs do servidor.
    localLogin: publicProcedure
      .input(z.object({ email: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!isLocalAdminEnabled()) {
          throw new Error("O login local não está configurado neste servidor.");
        }
        const valid = await verifyLocalAdminPassword(input.email, input.password);
        if (!valid) throw new Error("E-mail ou senha incorretos.");
        const email = input.email.trim().toLowerCase();
        const openId = getLocalAdminOpenId(email);
        let user = await db.getUserByOpenId(openId);
        if (!user) {
          await db.upsertUser({ openId, name: "Administrador", email, loginMethod: "local", role: "admin", lastSignedIn: new Date() });
          user = await db.getUserByOpenId(openId);
        } else if (user.role !== "admin") {
          await db.upsertUser({ openId: user.openId, role: "admin" });
          user = await db.getUserByOpenId(openId);
        }
        const token = await createLocalAdminSessionToken(email, user?.name || "Administrador");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
        return { ok: true, user: { email, name: user?.name || "Administrador", role: "admin" } } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  commerce: commerceRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
