// src/pages/login.jsx
import { useEffect, useState } from "react";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/router";
import { app } from "../auth/firebase";

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Lista de UIDs permitidos
const UID_AUTORIZADOS = [
  "uc6Rytqq0TUMzktLN2UOHnIXSrV2", // tu UID
  // agrega más si deseas
];

export default function LoginPage() {
  const [usuario, setUsuario] = useState(null);
  const [noAutorizado, setNoAutorizado] = useState(false);
  const router = useRouter();

  const loginConGoogle = async () => {
    try {
      const resultado = await signInWithPopup(auth, provider);
      const uid = resultado.user.uid;

      if (UID_AUTORIZADOS.includes(uid)) {
        setUsuario(resultado.user);
        router.push("/mapa");
      } else {
        await signOut(auth);
        setUsuario(null);
        setNoAutorizado(true);
      }
    } catch (error) {
      console.error("Error en login:", error);
    }
  };

  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      if (user && UID_AUTORIZADOS.includes(user.uid)) {
        router.push("/mapa");
      }
    });
  }, []);

  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h1>Bienvenido a M-APPS</h1>
      <button onClick={loginConGoogle} style={{ padding: "10px 20px", fontSize: "18px" }}>
        Iniciar sesión con Google
      </button>
      {noAutorizado && (
        <p style={{ color: "red", marginTop: "20px" }}>
          Correo no autorizado
        </p>
      )}
    </div>
  );
}
