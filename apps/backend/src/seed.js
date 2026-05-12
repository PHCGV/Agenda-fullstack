import { prisma } from "./db/prisma.js";
import { config } from "./config/env.js";
import { hashPassword } from "./utils/auth.js";
import { buildDefaultAvailabilityRules } from "./utils/defaultAvailability.js";

async function main() {
  if (!config.adminEmail || !config.adminPassword) {
    console.warn("ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding.");
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: config.adminEmail }
  });

  let user = existing;
  if (!existing) {
    user = await prisma.user.create({
      data: {
        email: config.adminEmail,
        name: "Admin",
        role: "ADMIN",
        passwordHash: await hashPassword(config.adminPassword)
      }
    });
  }

  const rules = buildDefaultAvailabilityRules(user.id);

  await prisma.availabilityRule.deleteMany({ where: { userId: user.id } });
  await prisma.availabilityRule.createMany({ data: rules });

  const spaceCount = await prisma.space.count();
  if (spaceCount === 0) {
    await prisma.space.create({
      data: {
        name: "Sala Principal",
        capacity: 1,
        description: "Sala padrao"
      }
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: "globalAvatarIcon" },
    update: {},
    create: {
      key: "globalAvatarIcon",
      value: "dot"
    }
  });

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
