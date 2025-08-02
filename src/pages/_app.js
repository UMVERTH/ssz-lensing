import 'mapbox-gl/dist/mapbox-gl.css';
import '@/styles/globals.css';
import '@/styles/Popup.css';
import '@/styles/users-page.css';      // ← nuevo

import { AuthProvider } from '@/hooks/useAuth';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
