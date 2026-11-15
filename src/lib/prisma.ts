import { PrismaClient } from "../../node_modules/.prisma/client";

const globalForPrisma = globalThis as unknown as { iiumPrismaClient?: PrismaClient };
export const prisma = globalForPrisma.iiumPrismaClient ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.iiumPrismaClient = prisma;
