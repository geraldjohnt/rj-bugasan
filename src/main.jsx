/* Entry point. React and ReactDOM are globals loaded from vendor/ (UMD), so nothing is imported at runtime. */
import { App } from './app/App.jsx';
import { selectAdapter } from './data/adapter.js';

const adapter = selectAdapter(window);
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App adapter={adapter} />);
