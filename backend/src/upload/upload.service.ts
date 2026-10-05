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
import { extname, join } from 'path';
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

  constructor(private readonly config: ConfigService) {}

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

  async deleteAsset(publicId: string): Promise<void> {
    if (this.localMode) {
      try {
        await fs.rm(join(this.uploadsDir, publicId), { force: true });
      } catch (e) {
        this.logger.warn(
          `No se pudo borrar local ${publicId}: ${(e as Error).message}`,
        );
      }
      return;
    }
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (e) {
      this.logger.warn(`No se pudo borrar ${publicId}: ${(e as Error).message}`);
    }
  }
}
