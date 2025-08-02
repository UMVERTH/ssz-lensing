const functions = require('firebase-functions');
const admin     = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

/**
 * createUserByEmail({ email, admin }) → { uid }
 * • Si el correo YA existe en Auth -> devuelve su UID.
 * • Si no existe -> crea user con clave temporal “Temporal123*”.
 * • Siempre crea /usuarios/UID con { email, admin }.
 * • Sólo permitido si el caller tiene superAdmin:true.
 */
exports.createUserByEmail = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth?.token?.superAdmin)
    throw new functions.https.HttpsError('permission‑denied', 'Sólo superAdmin');

  const { email, admin: isAdm = false } = data;
  if (!email) throw new functions.https.HttpsError('invalid‑argument', 'email requerido');

  let userRec;
  try { userRec = await admin.auth().getUserByEmail(email); }
  catch { userRec = await admin.auth().createUser({ email, password: 'Temporal123*' }); }

  await db.doc(`usuarios/${userRec.uid}`).set({ email, admin: isAdm }, { merge:true });

  return { uid: userRec.uid };
});
