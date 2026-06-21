import { PrismaClient } from "@prisma/client";

// Prints the number of rows in `laws` (0 if empty or unreachable). Used by the
// Docker entrypoint to decide whether to run the one-time sample seed.
const prisma = new PrismaClient();
const count = await prisma.law.count().catch(() => 0);
process.stdout.write(String(count));
await prisma.$disconnect().catch(() => {});
