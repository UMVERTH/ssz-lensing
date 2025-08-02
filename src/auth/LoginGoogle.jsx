// src/auth/LoginGoogle.jsx
import React from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, provider } from './firebase';

const LoginGoogle = ({ setUser }) => {
  const login = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user); // Aquí obtienes el UID: result.user.uid
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      alert("No se pudo iniciar sesión. Intenta de nuevo.");
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      <h2>Bienvenido a m-apps</h2>
      <button onClick={login} style={{ padding: '10px 20px', fontSize: '16px' }}>
        Iniciar sesión con Google
      </button>
    </div>
  );
};

export default LoginGoogle;
