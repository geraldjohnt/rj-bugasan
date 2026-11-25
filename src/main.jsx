/* Entry point. React, ReactDOM and firebase are globals loaded from vendor/ (UMD), so nothing is imported at runtime. */
import { App } from './app/App.jsx';
import { selectAdapter } from './data/adapter.js';
import { createFirebaseAuthService, createDemoAuthService } from './auth/authService.js';

const adapter = selectAdapter(window);
const authService = adapter.kind === 'firestore' ? createFirebaseAuthService(window.firebase, adapter.app) : createDemoAuthService();
ReactDOM.createRoot(document.getElementById('root')).render(<App adapter={adapter} authService={authService} />);
