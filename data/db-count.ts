import { PrismaClient } from "@prisma/client";

// Prints the number of rows in `laws`; query failures exit nonzero. Used by the
// Docker entrypoint to decide whether to run the one-time sample seed.
const prisma = new PrismaClient();
try {
  process.stdout.write(String(await prisma.law.count()));
} catch {
  // Do not expose a connection string or treat an unreadable database as empty.
  process.stderr.write("Unable to count laws; check database connectivity and migrations.\n");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}
