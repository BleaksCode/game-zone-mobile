/**
 * lib/auth.ts
 * -------------
 * Configuración de Better-Auth para el servidor (Expo API Routes).
 *
 * Soporta:
 *   - Email/password con verificación de correo.
 *   - Sesiones persistentes para firmar peticiones de sincronización.
 *   - Base de datos PostgreSQL (Supabase) como backend de auth.
 *
 * Este módulo se importa SOLO en API Routes (servidor).
 * Para el cliente (React Native), ver lib/auth-client.ts.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getRemoteDb } from '@/db/client';

// ---------------------------------------------------------------------------
// Configuración del servidor Better-Auth
// ---------------------------------------------------------------------------

/**
 * Instancia de Better-Auth configurada para Expo API Routes.
 *
 * Variables de entorno requeridas:
 *   - BETTER_AUTH_SECRET: Clave secreta para firmar tokens/sesiones.
 *   - BETTER_AUTH_URL: URL base del servidor (ej: https://tu-app.vercel.app).
 *   - SUPABASE_DB_URL: Connection string de PostgreSQL para la base de datos.
 */
export const auth = betterAuth({
  /**
   * Base de datos: Drizzle + PostgreSQL (Supabase).
   * Better-Auth almacena users, sessions, accounts y verifications
   * en las tablas definidas en db/remote-schema.ts.
   */
  database: drizzleAdapter(getRemoteDb, {
    provider: 'pg',
  }),

  /**
   * Clave secreta para firmar tokens JWT y cookies de sesión.
   * Debe ser una cadena aleatoria de al menos 32 caracteres.
   */
  secret: process.env.BETTER_AUTH_SECRET,

  /**
   * URL base del servidor. Necesaria para generar URLs de verificación,
   * callbacks de OAuth, etc.
   */
  baseURL: process.env.BETTER_AUTH_URL,

  /**
   * Proveedores de autenticación.
   * Email/Password habilitado con verificación de correo.
   */
  emailAndPassword: {
    enabled: true,
    /**
     * Se requiere verificación de email para completar el flujo de
     * "reclamación" (claim) de participantes casuales.
     */
    requireEmailVerification: false, // Cambiar a true en producción con SMTP configurado
    /**
     * Callback para enviar el email de verificación.
     * En desarrollo, loguear el enlace en consola.
     * En producción, integrar con un servicio SMTP (Resend, SendGrid, etc.).
     */
    sendVerificationEmail: async ({ user, url }) => {
      // TODO: Reemplazar con servicio SMTP real en producción
      console.log(`[Auth] Verification email for ${user.email}: ${url}`);
    },
  },

  /**
   * Configuración de sesión.
   */
  session: {
    /**
     * Duración de la sesión: 30 días.
     * Importante para mantener la sesión del organizador en el dispositivo
     * sin requerir re-login constante.
     */
    expiresIn: 60 * 60 * 24 * 30, // 30 días en segundos
    /**
     * Actualizar la sesión si quedan menos de 7 días.
     */
    updateAge: 60 * 60 * 24 * 7, // 7 días
  },

  /**
   * Trusted origins para CORS (Expo en desarrollo usa localhost).
   */
  trustedOrigins: [
    'exp://localhost:8081',
    'http://localhost:8081',
    process.env.BETTER_AUTH_URL || '',
  ].filter(Boolean),
});

// ---------------------------------------------------------------------------
// Exportar tipo de sesión para uso en API Routes
// ---------------------------------------------------------------------------

export type Session = typeof auth.$Infer.Session;
