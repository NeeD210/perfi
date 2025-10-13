import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Health check endpoint for production monitoring
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      // Test critical functions
      const accounts = await ctx.runQuery(internal.ledger.accounts.listActiveAccounts);
      
      return new Response(JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        accounts: accounts.length,
        version: "1.0.0"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  })
});

export default http;
