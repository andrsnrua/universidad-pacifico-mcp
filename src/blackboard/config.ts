import os from 'node:os';
import path from 'node:path';

// Este paquete atiende únicamente el Aula Virtual de la UP de Perú.
export const BLACKBOARD_BASE_URL = 'https://aulavirtual.up.edu.pe';
export const BLACKBOARD_HOST = new URL(BLACKBOARD_BASE_URL).host;
export const BLACKBOARD_LOGIN_URL = `${BLACKBOARD_BASE_URL}/ultra`;
export const SESSION_DIR = path.resolve(
  process.env.UP_MCP_SESSION_DIR?.trim() || path.join(os.homedir(), '.upacifico-mcp'),
);
export const PROFILE_DIR = path.join(SESSION_DIR, 'browser-profile');
