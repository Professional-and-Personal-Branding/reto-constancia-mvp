export type UserRole = 'PARTICIPANT' | 'ADMIN';

export type ChallengeStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED';

export type ExerciseType =
  | 'RUNNING'
  | 'ELLIPTICAL'
  | 'TREADMILL'
  | 'CYCLING'
  | 'OTHER';

export type ActivityStatus = 'PENDING' | 'VALIDATED' | 'REJECTED';

export type PhotoType = 'ACTIVITY' | 'HEART_RATE' | 'METRICS';

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: SafeUser;
  tokens: AuthTokens;
}

export interface Challenge {
  id: string;
  name: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  validDays: number[];
  minHeartRateMinutes: number;
  feePerParticipant: string;
  budgetTotal: string;
  currency: string;
  prizeDescription: string | null;
  status: ChallengeStatus;
  participants?: ChallengeParticipant[];
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  paid: boolean;
  paidAt: string | null;
  amountPaid: string | null;
  paymentProofUrl: string | null;
  paymentProofCloudinaryId: string | null;
  paymentProofUploadedAt: string | null;
  joinedAt: string;
  user: { id: string; name: string; email: string };
}

export interface ActivityPhoto {
  id: string;
  url: string;
  cloudinaryId: string;
  type: PhotoType;
  uploadedAt: string;
}

export interface DailyActivity {
  id: string;
  challengeId: string;
  userId: string;
  date: string;
  exerciseType: ExerciseType;
  durationMinutes: number;
  distanceKm: string | null;
  avgHeartRate: number | null;
  hasHeartRateProof: boolean;
  /** Minutos de registro de FC según la captura (regla minHeartRateMinutes) */
  heartRateMinutes: number | null;
  notes: string | null;
  status: ActivityStatus;
  rejectionReason: string | null;
  /** Nota del admin cuando validó con override una actividad que no cumple la regla de FC */
  validationNote: string | null;
  /** Derivado por la API: cumple la regla de FC del reto */
  heartRateCompliant: boolean;
  validatedAt: string | null;
  createdAt: string;
  photos: ActivityPhoto[];
  user?: { id: string; name: string; email: string };
}

export interface ParticipantRanking {
  userId: string;
  name: string;
  email: string;
  validatedDays: number;
  pendingDays: number;
  rejectedDays: number;
  totalKm: number;
  paid: boolean;
}

export interface ChallengeAward {
  userId: string;
  name: string;
  email: string;
  awardedAt: string;
  notes: string | null;
}

export interface ChallengeResults {
  challengeId: string;
  challengeName: string;
  status: ChallengeStatus;
  totalValidDays: number;
  ranking: ParticipantRanking[];
  topScore: number;
  tiedAtTop: ParticipantRanking[];
  winners: ParticipantRanking[];
  awards: ChallengeAward[];
  drawNeeded: boolean;
  notes: string[];
  /** Reparto del presupuesto entre ganadores (informativo) */
  payout: ChallengePayout;
}

export interface ChallengePayout {
  pot: number;
  winnersCount: number;
  perWinner: number;
  monetary: boolean;
}

export type PaymentState = 'paid' | 'partial' | 'unpaid';

export interface ParticipantFinance {
  userId: string;
  name: string;
  email: string;
  state: PaymentState;
  amountPaid: number;
  paidAt: string | null;
}

export interface ChallengeFinance {
  challengeId: string;
  challengeName: string;
  currency: string;
  feePerParticipant: number;
  budgetTotal: number;
  participantsTotal: number;
  counts: { paid: number; partial: number; unpaid: number };
  expectedTotal: number;
  collectedTotal: number;
  pendingTotal: number;
  budgetCovered: boolean;
  budgetDelta: number;
  participants: ParticipantFinance[];
}

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
}

export interface ImportPreviewRow {
  row: number;
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  valid: boolean;
}

export interface ImportPreviewResult {
  summary: { total: number; valid: number; invalid: number; warnings: number };
  rows: ImportPreviewRow[];
}

export interface ImportCommitResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  usersCreated: number;
  participantsCreated: number;
  errors: { row: number; message: string }[];
}
