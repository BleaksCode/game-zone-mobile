import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";  // 🔴 FALTABA
import { getRemoteDb } from "@/src/db/remote-client"; 
import * as remoteSchema from "@/src/db/remote-schema"; 

export const auth = betterAuth({
  plugins: [expo()],   // 🔴 ESTO SOLUCIONA TU ERROR

  database: drizzleAdapter(getRemoteDb(), {
    provider: "pg", 
    schema: {
      user: remoteSchema.users,
      session: remoteSchema.sessions,
      account: remoteSchema.accounts,
      verification: remoteSchema.verifications,
    }
  }),

  trustedOrigins: [
    "gamezone://",         // mejor sin wildcard
    "http://localhost:8081",
    "http://10.0.2.2:8081",
  ],

  emailAndPassword: { 
    enabled: true, 
    requireEmailVerification: false 
  },
});
