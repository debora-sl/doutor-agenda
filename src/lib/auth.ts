import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { type NextRequest } from "next/server";

import { db } from "@/db";
import {
  accountsTable,
  sessionsTable,
  usersTable,
  verificationsTable,
} from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  user: {
    modelName: "usersTable",
  },
  session: {
    modelName: "sessionsTable",
  },
  account: {
    modelName: "accountsTable",
  },
  verification: {
    modelName: "verificationsTable",
  },
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: ["http://localhost:3000", "http://localhost:3001"],
});

export type AuthRequest = NextRequest & {
  auth: {
    userId: string;
  };
};
