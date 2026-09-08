import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '../backend/.env' });

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    headless: true,
  },
});
