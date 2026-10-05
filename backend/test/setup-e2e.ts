/*
 * Entorno de las suites e2e de API (registrado en jest-e2e.json, setupFiles).
 *
 * Fuerza el modo local de subidas para que las pruebas no dependan del .env de cada
 * desarrollador: con claves reales de Cloudinary, la evidencia local de las fixtures sería
 * rechazada. Se usan cadenas vacías y no `delete`: dotenv no sobrescribe variables que ya
 * existen en process.env, así que el valor vacío es lo que deja fuera las claves reales.
 */
import { TEST_BASE_FOLDER, TEST_PUBLIC_URL } from './helpers/assets';

process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.CLOUDINARY_FOLDER = TEST_BASE_FOLDER;
process.env.PUBLIC_URL = TEST_PUBLIC_URL;
// Las suites firman muchas subidas desde la misma IP; el 429 se prueba en su propia app.
process.env.UPLOAD_SIGN_LIMIT = process.env.UPLOAD_SIGN_LIMIT || '1000';
