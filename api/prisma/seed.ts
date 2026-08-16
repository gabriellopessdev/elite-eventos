import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/auth/password.js';

const prisma = new PrismaClient();

const seedUsers: Array<{
  email: string;
  password: string;
  name: string;
  role: Role;
}> = [
  {
    email: 'org@elite.local',
    password: 'org12345',
    name: 'Organizador Demo',
    role: Role.ORGANIZER,
  },
  {
    email: 'cliente1@elite.local',
    password: 'cli12345',
    name: 'Cliente Um',
    role: Role.CUSTOMER,
  },
  {
    email: 'cliente2@elite.local',
    password: 'cli12345',
    name: 'Cliente Dois',
    role: Role.CUSTOMER,
  },
  {
    email: 'portaria@elite.local',
    password: 'door12345',
    name: 'Portaria Demo',
    role: Role.DOOR,
  },
];

async function main() {
  for (const row of seedUsers) {
    const passwordHash = await hashPassword(row.password);
    await prisma.user.upsert({
      where: { email: row.email },
      create: {
        email: row.email,
        passwordHash,
        name: row.name,
        role: row.role,
      },
      update: {
        passwordHash,
        name: row.name,
        role: row.role,
      },
    });
  }
  console.log(`Seeded ${seedUsers.length} users`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
