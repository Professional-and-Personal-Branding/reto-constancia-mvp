import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, dirname, extname, join, resolve, sep } from 'path';

import { PrismaService } from '../prisma/prisma.service';
import {
  ALLOWED_FORMATS,
  allowedExtensions,
  DEFAULT_MAX_BYTES,
  folderFor,
  FORMAT_MESSAGE,
  isOwnedAsset,
  normalizeBase,
  parseFolder,
  ParsedFolder,
  UploadPurpose,
} from './upload-policy';

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
  /** Formatos firmados: el cliente debe reenviarlos tal cual en `allowed_formats`. */
  allowedFormats: string;
  /** Tamaño máximo que el cliente valida antes de subir. */
  maxBytes: number;
  /** true cuando el backend simula Cloudinary guardando en disco (modo local/dev). */
  local?: boolean;
}

export type DeleteOutcome = 'deleted' | 'not_found';

export interface EvidenceOwner {
  challengeId: string;
  userId: string;
  purpose: UploadPurpose;
}

const OWNERSHIP_MESSAGE: Record<UploadPurpose, string> = {
  activity: 'La foto debe subirse desde la plataforma',
  'payment-proof': 'El comprobante debe subirse desde la plataforma',
};

export interface LocalUploadResult {
  secure_url: string;
  public_id: string;
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private baseFolder!: string;
  private localMode = false;
  private publicBaseUrl!: string;
  private apiPrefix!: string;
  private cloudName?: string;
  private maxBytes = DEFAULT_MAX_BYTES;
  /** Carpeta física donde se guardan los archivos en modo local. */
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor(
    private readonly config: ConfigService,
    // Opcional para las pruebas que no tocan la base; en la app siempre lo inyecta Nest
    private readonly prisma?: PrismaService,
  ) {}

  onModuleInit(): void {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    this.baseFolder = normalizeBase(
      this.config.get<string>('CLOUDINARY_FOLDER') || 'reto-constancia',
    );
    const maxBytes = Number(this.config.get<string>('UPLOAD_MAX_BYTES'));
    if (Number.isInteger(maxBytes) && maxBytes > 0) this.maxBytes = maxBytes;
    this.apiPrefix = this.config.get<string>('API_PREFIX', 'api');
    const port = this.config.get<number>('PORT', 3000);
    this.publicBaseUrl =
      this.config.get<string>('PUBLIC_URL') ?? `http://localhost:${port}`;

    if (!cloud || !apiKey || !apiSecret) {
      // En producción el simulador local queda deshabilitado: dejaría /upload/local
      // aceptando archivos en un servidor público y los archivos no sobrevivirían al redeploy.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.localMode = false;
        this.logger.error(
          'Cloudinary NO está configurado en producción: la subida de archivos queda deshabilitada. ' +
            'Define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET.',
        );
        return;
      }
      this.localMode = true;
      this.logger.warn(
        'Cloudinary no está configurado: usando almacenamiento LOCAL en /uploads (modo dev).',
      );
      return;
    }

    this.cloudName = cloud;
    cloudinary.config({
      cloud_name: cloud,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    this.logger.log(`Cloudinary configurado en folder ${this.baseFolder}`);
  }

  get isLocalMode(): boolean {
    return this.localMode;
  }

  get maxUploadBytes(): number {
    return this.maxBytes;
  }

  /**
   * Firma una subida directa para un reto, un participante y un propósito (spec
   * upload-guardrails). La carpeta la decide el servidor y los formatos van firmados.
   * - Con Cloudinary configurado: firma real hacia la API de Cloudinary.
   * - Sin Cloudinary (dev): apunta al endpoint local que simula el upload.
   */
  signUpload(challengeId: string, userId: string, purpose: UploadPurpose): CloudinarySignature {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = folderFor(this.baseFolder, challengeId, userId, purpose);
    const allowedFormats = ALLOWED_FORMATS[purpose];

    if (this.localMode) {
      return {
        signature: 'local',
        timestamp,
        apiKey: 'local',
        cloudName: 'local',
        folder,
        uploadUrl: `${this.publicBaseUrl}/${this.apiPrefix}/upload/local`,
        allowedFormats,
        maxBytes: this.maxBytes,
        local: true,
      };
    }

    const apiSecret = this.config.getOrThrow<string>('CLOUDINARY_API_SECRET');
    const apiKey = this.config.getOrThrow<string>('CLOUDINARY_API_KEY');
    const cloudName = this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME');

    // Para firmar, los parámetros deben estar ordenados alfabéticamente.
    const signature = cloudinary.utils.api_sign_request(
      { allowed_formats: allowedFormats, folder, timestamp },
      apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      // Siempre image: un PDF subido así se guarda como imagen y lo protege allowed_formats
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      allowedFormats,
      maxBytes: this.maxBytes,
    };
  }

  /** Lanza 400 si la evidencia no es un archivo propio del participante (spec upload-guardrails). */
  assertOwnedAsset(asset: { url: string; publicId: string }, owner: EvidenceOwner): void {
    const owned = isOwnedAsset(asset, {
      base: this.baseFolder,
      ...owner,
      cloudName: this.localMode ? undefined : this.cloudName,
      publicBaseUrl: this.publicBaseUrl,
    });
    if (!owned) throw new BadRequestException(OWNERSHIP_MESSAGE[owner.purpose]);
  }

  /**
   * Valida la carpeta de una subida local: solo carpetas derivadas y del propio usuario.
   * La participación la verifica el controlador con la regla del propósito.
   */
  parseLocalFolder(folder: string | undefined, userId: string): ParsedFolder {
    const parsed = folder ? parseFolder(this.baseFolder, folder) : null;
    if (!parsed) throw new BadRequestException('Carpeta de subida no válida');
    if (parsed.userId !== userId) {
      throw new ForbiddenException('No puedes subir archivos a la carpeta de otro usuario');
    }
    return parsed;
  }

  /**
   * Guarda un archivo en disco y devuelve una respuesta con el mismo shape
   * que Cloudinary ({ secure_url, public_id }). Solo en modo local/dev.
   */
  async saveLocal(
    file: Express.Multer.File,
    folder: string,
    purpose: UploadPurpose,
  ): Promise<LocalUploadResult> {
    let ext = (extname(file.originalname) || this.extFromMime(file.mimetype)).toLowerCase();
    // Igual que Cloudinary: los JPEG se guardan como jpg
    if (ext === '.jpeg') ext = '.jpg';
    if (!allowedExtensions(purpose).includes(ext.replace('.', ''))) {
      throw new BadRequestException(FORMAT_MESSAGE);
    }

    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '_');
    const targetDir = join(this.uploadsDir, safeFolder);
    await fs.mkdir(targetDir, { recursive: true });

    const id = randomUUID();
    const fileName = `${id}${ext}`;
    await fs.writeFile(join(targetDir, fileName), file.buffer);

    const publicId = `${safeFolder}/${id}`;
    const secureUrl = `${this.publicBaseUrl.replace(/\/+$/, '')}/uploads/${safeFolder}/${fileName}`;
    return { secure_url: secureUrl, public_id: publicId };
  }

  private extFromMime(mime?: string): string {
    switch (mime) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'image/heic':
        return '.heic';
      case 'image/gif':
        return '.gif';
      case 'application/pdf':
        return '.pdf';
      default:
        return '';
    }
  }

  /**
   * Borra un archivo guardado (spec upload-guardrails): 'deleted' si existía, 'not_found' si no;
   * cualquier otro resultado lanza. En modo local busca el archivo del id con su extensión y
   * nunca sale de la carpeta de subidas.
   */
  async deleteAsset(publicId: string): Promise<DeleteOutcome> {
    if (this.localMode) {
      const root = resolve(this.uploadsDir);
      const dir = resolve(root, dirname(publicId));
      if (dir !== root && !dir.startsWith(root + sep)) {
        throw new Error(`Ruta fuera de la carpeta de subidas: ${publicId}`);
      }
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'not_found';
        throw e;
      }
      const prefix = `${basename(publicId)}.`;
      const file = entries.find((f) => f.startsWith(prefix));
      if (!file) return 'not_found';
      await fs.rm(join(dir, file));
      return 'deleted';
    }
    // Los PDF de comprobantes también se suben como image (spec upload-guardrails)
    const res = (await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    })) as { result?: string };
    if (res?.result === 'ok') return 'deleted';
    if (res?.result === 'not found') return 'not_found';
    throw new Error(`destroy respondió ${res?.result ?? 'sin resultado'}`);
  }

  /** Solo archivos subidos por la plataforma: nunca las fotos importadas (import/...). */
  isManagedId(publicId: string): boolean {
    return publicId.startsWith(`${this.baseFolder}/`) && !publicId.includes('..');
  }

  /** Borrar comprobantes reemplazados exige activarlo (evidencia financiera, spec challenge-finance). */
  get deleteReplacedProofs(): boolean {
    return this.config.get<string>('UPLOAD_DELETE_REPLACED_PROOFS') === 'true';
  }

  /**
   * Libera archivos que ya nadie usa, después de que el cambio en la base se confirmó. Nunca
   * lanza ni bloquea al usuario: el llamador no la espera. Omite los ids que otra foto o un
   * comprobante siguen usando, y registra los fallos solo con el id (sin datos personales).
   */
  async deleteAssetsLater(publicIds: string[]): Promise<void> {
    const prisma = this.prisma;
    const ids = [...new Set(publicIds.filter((id) => !!id && this.isManagedId(id)))];
    if (!prisma || ids.length === 0) return;

    const outcomes = await Promise.allSettled(
      ids.map(async (id): Promise<DeleteOutcome | 'referenced'> => {
        const [photos, proofs] = await Promise.all([
          prisma.activityPhoto.count({ where: { cloudinaryId: id } }),
          prisma.challengeParticipant.count({ where: { paymentProofCloudinaryId: id } }),
        ]);
        if (photos + proofs > 0) return 'referenced';
        return this.deleteAsset(id);
      }),
    );
    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'rejected') {
        this.logger.warn(`No se pudo borrar el archivo ${ids[i]}: ${(outcome.reason as Error)?.message ?? outcome.reason}`);
      } else if (outcome.value === 'referenced') {
        this.logger.debug(`Archivo ${ids[i]} conservado: todavía está en uso`);
      } else if (outcome.value === 'not_found') {
        this.logger.debug(`Archivo ${ids[i]} ya no existía`);
      }
    });
  }
}
