import { db } from './client';
import { schoolMemberships, schools, users } from './schema';

async function seed() {
  try {
    console.log('🌱 Seeding database...');

    const [school] = await db
      .insert(schools)
      .values({
        name: 'Demo School',
        slug: 'demo-school',
        localeDefault: 'en',
      })
      .returning();

    const [admin] = await db
      .insert(users)
      .values({
        phone: '+10000000000',
        email: 'admin@example.com',
        passwordHash: 'change-me',
        nameEn: 'Demo Admin',
        locale: 'en',
      })
      .returning();

    await db.insert(schoolMemberships).values({
      userId: admin.id,
      schoolId: school.id,
      role: 'admin',
      status: 'active',
    });

    console.log('✅ Seeding completed successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
