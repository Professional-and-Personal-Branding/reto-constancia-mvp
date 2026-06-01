import {
  ActivityStatus,
  ChallengeStatus,
  ExerciseType,
  PhotoType,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'ChangeMe123!';

const testParticipants = [
  {
    email: 'ana@reto.local',
    name: 'Ana Constante',
    paid: true,
    amountPaid: 120,
    activities: [
      { date: '2026-05-01', exerciseType: ExerciseType.RUNNING, distanceKm: 5.2, status: ActivityStatus.VALIDATED },
      { date: '2026-05-02', exerciseType: ExerciseType.ELLIPTICAL, distanceKm: 4.1, status: ActivityStatus.VALIDATED },
      { date: '2026-05-04', exerciseType: ExerciseType.RUNNING, distanceKm: 5.8, status: ActivityStatus.VALIDATED },
      { date: '2026-05-05', exerciseType: ExerciseType.TREADMILL, distanceKm: 4.6, status: ActivityStatus.PENDING },
    ],
  },
  {
    email: 'bruno@reto.local',
    name: 'Bruno Kilometros',
    paid: true,
    amountPaid: 120,
    activities: [
      { date: '2026-05-01', exerciseType: ExerciseType.CYCLING, distanceKm: 8.5, status: ActivityStatus.VALIDATED },
      { date: '2026-05-02', exerciseType: ExerciseType.RUNNING, distanceKm: 6.1, status: ActivityStatus.VALIDATED },
      { date: '2026-05-04', exerciseType: ExerciseType.RUNNING, distanceKm: 3.9, status: ActivityStatus.PENDING },
    ],
  },
  {
    email: 'carla@reto.local',
    name: 'Carla Disciplina',
    paid: false,
    amountPaid: null,
    activities: [
      { date: '2026-05-01', exerciseType: ExerciseType.ELLIPTICAL, distanceKm: 4.7, status: ActivityStatus.VALIDATED },
      { date: '2026-05-02', exerciseType: ExerciseType.TREADMILL, distanceKm: 4.2, status: ActivityStatus.REJECTED },
    ],
  },
  {
    email: 'diego@reto.local',
    name: 'Diego Sin Excusas',
    paid: true,
    amountPaid: 120,
    activities: [
      { date: '2026-05-01', exerciseType: ExerciseType.RUNNING, distanceKm: 5.5, status: ActivityStatus.VALIDATED },
      { date: '2026-05-05', exerciseType: ExerciseType.OTHER, distanceKm: 3.2, status: ActivityStatus.PENDING },
    ],
  },
  {
    email: 'elena@reto.local',
    name: 'Elena Manada',
    paid: false,
    amountPaid: null,
    activities: [
      { date: '2026-05-02', exerciseType: ExerciseType.RUNNING, distanceKm: 4.9, status: ActivityStatus.PENDING },
    ],
  },
];

function activityDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function photoSeed(userEmail: string, date: string, type: PhotoType) {
  const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const suffix = type.toLowerCase().replace('_', '-');
  const label = encodeURIComponent(
    type === PhotoType.HEART_RATE
      ? `FC 142 bpm | 30 min | ${date}`
      : `Actividad ${date}`,
  );
  const url =
    type === PhotoType.HEART_RATE
      ? `https://placehold.co/900x600/111827/f8fafc.png?text=${label}`
      : `https://picsum.photos/seed/reto-${safeEmail}-${date}/900/600`;

  return {
    url,
    cloudinaryId: `seed/${safeEmail}/${date}-${suffix}`,
    type,
  };
}

function paymentProofSeed(userEmail: string) {
  const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const label = encodeURIComponent(`Pago reto mayo | ${userEmail} | 120 BOB`);

  return {
    url: `https://placehold.co/900x600/065f46/f8fafc.png?text=${label}`,
    cloudinaryId: `seed/payments/${safeEmail}-may-2026`,
  };
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@reto.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? TEST_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Administrador';

  const [adminPasswordHash, testPasswordHash] = await Promise.all([
    argon2.hash(adminPassword),
    argon2.hash(TEST_PASSWORD),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      active: true,
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
  });

  console.log(`✅ Admin: ${admin.email}`);

  const year = 2026;
  const challenge = await prisma.challenge.upsert({
    where: { month_year: { month: 5, year } },
    update: {
      name: `Reto Mayo ${year}`,
      startDate: new Date(`${year}-05-01T00:00:00Z`),
      endDate: new Date(`${year}-05-31T23:59:59Z`),
      validDays: [1, 2, 3, 4, 5, 6],
      minHeartRateMinutes: 20,
      feePerParticipant: 120,
      budgetTotal: 600,
      currency: 'BOB',
      prizeDescription: 'Suplemento para gym al ganador (o sorteo en caso de empate)',
      status: ChallengeStatus.ACTIVE,
    },
    create: {
      name: `Reto Mayo ${year}`,
      month: 5,
      year,
      startDate: new Date(`${year}-05-01T00:00:00Z`),
      endDate: new Date(`${year}-05-31T23:59:59Z`),
      validDays: [1, 2, 3, 4, 5, 6],
      minHeartRateMinutes: 20,
      feePerParticipant: 120,
      budgetTotal: 600,
      currency: 'BOB',
      prizeDescription: 'Suplemento para gym al ganador (o sorteo en caso de empate)',
      status: ChallengeStatus.ACTIVE,
    },
  });

  console.log(`✅ Reto: ${challenge.name}`);

  await prisma.challengeAward.deleteMany({ where: { challengeId: challenge.id } });

  await prisma.user.deleteMany({
    where: {
      email: {
        startsWith: 'e2e+',
        endsWith: '@reto.local',
      },
    },
  });

  for (const participantSeed of testParticipants) {
    const user = await prisma.user.upsert({
      where: { email: participantSeed.email },
      update: {
        name: participantSeed.name,
        passwordHash: testPasswordHash,
        role: UserRole.PARTICIPANT,
        active: true,
      },
      create: {
        email: participantSeed.email,
        name: participantSeed.name,
        passwordHash: testPasswordHash,
        role: UserRole.PARTICIPANT,
      },
    });

    await prisma.challengeParticipant.upsert({
      where: {
        challengeId_userId: {
          challengeId: challenge.id,
          userId: user.id,
        },
      },
      update: {
        paid: participantSeed.paid,
        paidAt: participantSeed.paid ? new Date(`${year}-05-03T12:00:00Z`) : null,
        amountPaid: participantSeed.amountPaid,
        paymentProofUrl: participantSeed.paid
          ? paymentProofSeed(participantSeed.email).url
          : null,
        paymentProofCloudinaryId: participantSeed.paid
          ? paymentProofSeed(participantSeed.email).cloudinaryId
          : null,
        paymentProofUploadedAt: participantSeed.paid
          ? new Date(`${year}-05-03T12:00:00Z`)
          : null,
      },
      create: {
        challengeId: challenge.id,
        userId: user.id,
        paid: participantSeed.paid,
        paidAt: participantSeed.paid ? new Date(`${year}-05-03T12:00:00Z`) : null,
        amountPaid: participantSeed.amountPaid,
        paymentProofUrl: participantSeed.paid
          ? paymentProofSeed(participantSeed.email).url
          : null,
        paymentProofCloudinaryId: participantSeed.paid
          ? paymentProofSeed(participantSeed.email).cloudinaryId
          : null,
        paymentProofUploadedAt: participantSeed.paid
          ? new Date(`${year}-05-03T12:00:00Z`)
          : null,
      },
    });

    for (const seededActivity of participantSeed.activities) {
      const date = activityDate(seededActivity.date);
      const validated = seededActivity.status !== ActivityStatus.PENDING;

      await prisma.dailyActivity.upsert({
        where: {
          challengeId_userId_date: {
            challengeId: challenge.id,
            userId: user.id,
            date,
          },
        },
        update: {
          exerciseType: seededActivity.exerciseType,
          durationMinutes: 30,
          distanceKm: seededActivity.distanceKm,
          avgHeartRate: 142,
          hasHeartRateProof: true,
          notes: `Dato seed para pruebas locales (${seededActivity.status.toLowerCase()}).`,
          status: seededActivity.status,
          rejectionReason:
            seededActivity.status === ActivityStatus.REJECTED
              ? 'Captura incompleta para validar los 20 minutos de FC.'
              : null,
          validatedById: validated ? admin.id : null,
          validatedAt: validated ? new Date(`${year}-05-06T12:00:00Z`) : null,
          photos: {
            deleteMany: {},
            create: [
              photoSeed(user.email, seededActivity.date, PhotoType.ACTIVITY),
              photoSeed(user.email, seededActivity.date, PhotoType.HEART_RATE),
            ],
          },
        },
        create: {
          challengeId: challenge.id,
          userId: user.id,
          date,
          exerciseType: seededActivity.exerciseType,
          durationMinutes: 30,
          distanceKm: seededActivity.distanceKm,
          avgHeartRate: 142,
          hasHeartRateProof: true,
          notes: `Dato seed para pruebas locales (${seededActivity.status.toLowerCase()}).`,
          status: seededActivity.status,
          rejectionReason:
            seededActivity.status === ActivityStatus.REJECTED
              ? 'Captura incompleta para validar los 20 minutos de FC.'
              : null,
          validatedById: validated ? admin.id : null,
          validatedAt: validated ? new Date(`${year}-05-06T12:00:00Z`) : null,
          photos: {
            create: [
              photoSeed(user.email, seededActivity.date, PhotoType.ACTIVITY),
              photoSeed(user.email, seededActivity.date, PhotoType.HEART_RATE),
            ],
          },
        },
      });
    }

    console.log(`✅ Participante: ${user.email}`);
  }

  console.log(`🔐 Password pruebas: ${TEST_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
