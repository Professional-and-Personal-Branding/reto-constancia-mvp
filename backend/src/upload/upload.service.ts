import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { UploadResourceType } from './dto/sign-upload.dto';

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
  /** true cuando el backend simula Cloudinary guardando en disco (modo local/dev). */
  local?: boolean;
}

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
  /** Carpeta física donde se guardan los archivos en modo local. */
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    this.baseFolder =
      this.config.get<string>('CLOUDINARY_FOLDER') ?? 'reto-constancia';
    this.apiPrefix = this.config.get<string>('API_PREFIX', 'api');
    const port = this.config.get<number>('PORT', 3000);
    this.publicBaseUrl =
      this.config.get<string>('PUBLIC_URL') ?? `http://localhost:${port}`;

    if (!cloud || !apiKey || !apiSecret) {
      this.localMode = true;
      this.logger.warn(
        'Cloudinary no está configurado: usando almacenamiento LOCAL en /uploads (modo dev).',
      );
      return;
    }

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

  /**
   * Genera una firma para upload directo desde el cliente.
   * - Con Cloudinary configurado: firma real hacia la API de Cloudinary.
   * - Sin Cloudinary (dev): apunta al endpoint local que simula el upload.
   */
  signUpload(
    folder?: string,
    resourceType: UploadResourceType = 'image',
  ): CloudinarySignature {
    const timestamp = Math.round(Date.now() / 1000);
    const fullFolder = folder
      ? `${this.baseFolder}/${folder}`
      : this.baseFolder;

    if (this.localMode) {
      return {
        signature: 'local',
        timestamp,
        apiKey: 'local',
        cloudName: 'local',
        folder: fullFolder,
        uploadUrl: `${this.publicBaseUrl}/${this.apiPrefix}/upload/local`,
        local: true,
      };
    }

    const apiSecret = this.config.getOrThrow<string>('CLOUDINARY_API_SECRET');
    const apiKey = this.config.getOrThrow<string>('CLOUDINARY_API_KEY');
    const cloudName = this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME');

    // Para firmar, los parámetros deben estar ordenados alfabéticamente.
    const signature = cloudinary.utils.api_sign_request(
      { folder: fullFolder, timestamp },
      apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder: fullFolder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    };
  }

  /**
   * Guarda un archivo en disco y devuelve una respuesta con el mismo shape
   * que Cloudinary ({ secure_url, public_id }). Solo en modo local/dev.
   */
  async saveLocal(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<LocalUploadResult> {
    const safeFolder = (folder ?? this.baseFolder).replace(/[^a-zA-Z0-9/_-]/g, '_');
    const targetDir = join(this.uploadsDir, safeFolder);
    await fs.mkdir(targetDir, { recursive: true });

    const id = randomUUID();
    const ext = extname(file.originalname) || this.extFromMime(file.mimetype);
    const fileName = `${id}${ext}`;
    await fs.writeFile(join(targetDir, fileName), file.buffer);

    const publicId = `${safeFolder}/${id}`;
    const secureUrl = `${this.publicBaseUrl}/uploads/${safeFolder}/${fileName}`;
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
