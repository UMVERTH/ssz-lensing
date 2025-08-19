// ───────────────────────── pages/_app.js ─────────────────────────
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import 'rc-slider/assets/index.css';
import 'sweetalert2/dist/sweetalert2.min.css';


import '@/styles/globals.css';
import '@/styles/Popup.css';
import '@/styles/users-page.css';     // ← ya lo tenías
import '@/styles/searchbar.css';      // ← añade tu hoja del buscador

import { AuthProvider } from '@/hooks/useAuth';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
