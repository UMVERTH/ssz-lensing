/**
 * Marca o desmarca admin en /users claims
 * Uso:
 *    node scripts/setAdmin.mjs <UID> true   # concede
 *    node scripts/setAdmin.mjs <UID> false  # revoca
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';

initializeApp({ credential: cert('./serviceAccountKey.json') });

(async () => {
  const [,, uid, flag] = process.argv;
  if (!uid) { console.error('Falta UID'); process.exit(1); }
  await getAuth().setCustomUserClaims(uid, { admin: flag !== 'false' });
  console.log(`UID ${uid} → admin = ${flag !== 'false'}`);
  process.exit();
})();
