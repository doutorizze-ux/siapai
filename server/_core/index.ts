import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { handleAsaasWebhook } from "../routers/commerce";
import { registerExtensionRoutes } from "../extensionCompat";
import { registerExtension3Routes } from "../extensionCompat3";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initializeDatabase } from "./dbInit";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Rotas de compatibilidade da extensão SiapAI (POST /api/validar, /api/planejamento/sugerir, /api/log)
  registerExtensionRoutes(app);
  // Rotas de compatibilidade da extensão SiapAI v3.2.40 (auth por e-mail, catálogo, IA, Revisa, PEI)
  registerExtension3Routes(app);
  // Webhook do Asaas (POST /api/webhook/asaas)
  // O Asaas envia o token de autenticação do webhook no header X-ASAAS-TOKEN (API v3).
  // Se ASAAS_WEBHOOK_TOKEN estiver definido no servidor, o token é validado;
  // sem a env, o webhook aceita qualquer chamada (compatibilidade com configuração antiga).
  app.post("/api/webhook/asaas", (req, res) => {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
    if (expectedToken) {
      const received = req.headers["x-asaas-token"];
      const tokenValue = Array.isArray(received) ? received[0] : received;
      if (!tokenValue || tokenValue !== expectedToken) {
        res.status(401).json({ error: "webhook token invalid" });
        return;
      }
    }
    handleAsaasWebhook(req.body).then(() => {
      res.status(200).json({ received: true });
    }).catch((err) => {
      console.error("[Asaas webhook] erro:", err);
      res.status(500).json({ error: "webhook processing failed" });
    });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Diagnóstico: mostrar quais envs críticas estão disponíveis (sem revelar valores)
  console.log(`[env check] ASAAS_API_KEY: ${process.env.ASAAS_API_KEY ? "OK (length=" + process.env.ASAAS_API_KEY.replace(/[\s\uFEFF]+/g, "").length + ")" : "MISSING"}`);
  console.log(`[env check] ADMIN_EMAIL: ${process.env.ADMIN_EMAIL ? "OK" : "MISSING"}`);
  console.log(`[env check] ADMIN_PASSWORD: ${process.env.ADMIN_PASSWORD ? "OK" : "MISSING"}`);
  console.log(`[env check] DATABASE_URL: ${process.env.DATABASE_URL ? "OK" : "MISSING"}`);
  console.log(`[env check] JWT_SECRET: ${process.env.JWT_SECRET ? "OK" : "MISSING"}`);
  console.log(`[env check] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[env check] PORT: ${process.env.PORT}`);

  // Inicializa o schema do banco em paralelo ao servidor já ouvindo a porta
  // (retry interno do dbInit cobre o cold start do MySQL em compose).
  initializeDatabase().catch(err => {
    console.error("[dbInit] falha ao inicializar o banco (o servidor continuará):", err);
  });
}

startServer().catch(console.error);
