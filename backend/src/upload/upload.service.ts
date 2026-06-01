import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { UploadResourceType } from './dto/sign-upload.dto';

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private baseFolder!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    this.baseFolder =
      this.config.get<string>('CLOUDINARY_FOLDER') ?? 'reto-constancia';

    if (!cloud || !apiKey || !apiSecret) {
      this.logger.warn(
        'Cloudinary no está configurado completamente. Los uploads firmados fallarán.',
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

  /**
   * Genera una firma para upload directo desde el cliente.
   * El cliente sube el archivo directo a Cloudinary, sin pasar por la API.
   */
  signUpload(folder?: string, resourceType: UploadResourceType = 'image'): CloudinarySignature {
    const timestamp = Math.round(Date.now() / 1000);
    const fullFolder = folder
      ? `${this.baseFolder}/${folder}`
      : this.baseFolder;

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

  async deleteAsset(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (e) {
      this.logger.warn(`No se pudo borrar ${publicId}: ${(e as Error).message}`);
    }
  }
}
