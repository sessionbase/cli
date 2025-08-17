import keytar from 'keytar';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir } from './utils/paths.js';

const SERVICE_NAME = 'sessionbase-cli';
const ACCOUNT_NAME = 'default';
const CONFIG_DIR = join(getConfigDir(), 'sessionbase');
const TOKEN_FILE = join(CONFIG_DIR, 'token.json');

/**
 * Get the authentication token with priority:
 * 1. SESSIONBASE_TOKEN environment variable
 * 2. Keytar secure storage
 * 3. Fallback JSON file in ~/.config/sessionbase
 */
export async function getToken(): Promise<string | null> {
  // Highest priority: environment variable
  const envToken = process.env.SESSIONBASE_TOKEN;
  if (envToken) {
    return envToken;
  }

  try {
    // Try keytar first (secure storage)
    const keytarToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (keytarToken) {
      return keytarToken;
    }
  } catch (error) {
    // Keytar might not be available on all systems, continue to fallback
    console.warn('Warning: Secure storage unavailable, using fallback file storage');
  }

  // Fallback: JSON file
  try {
    if (existsSync(TOKEN_FILE)) {
      const tokenData = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
      return tokenData.token || null;
    }
  } catch (error) {
    // File doesn't exist or is corrupted, return null
  }

  return null;
}

/**
 * Store the authentication token securely
 */
export async function storeToken(token: string): Promise<void> {
  try {
    // Try to store in keytar first
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
  } catch (error) {
    // If keytar fails, fall back to file storage
    console.warn('Warning: Secure storage unavailable, using fallback file storage');
    
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Store in JSON file
    const tokenData = { token, storedAt: new Date().toISOString() };
    writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  }
}

/**
 * Remove the stored authentication token
 */
export async function clearToken(): Promise<void> {
  try {
    // Try to remove from keytar
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch (error) {
    // Keytar might not be available, continue to file cleanup
  }

  // Also remove the fallback file if it exists
  try {
    if (existsSync(TOKEN_FILE)) {
      const fs = await import('node:fs/promises');
      await fs.unlink(TOKEN_FILE);
    }
  } catch (error) {
    // File might not exist, that's okay
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return token !== null && token.length > 0;
}
