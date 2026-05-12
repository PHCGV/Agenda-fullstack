import { prisma } from "../db/prisma.js";
import { processPendingReminders } from "../controllers/cronController.js";

try {
  const result = await processPendingReminders();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Failed to process reminders", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
