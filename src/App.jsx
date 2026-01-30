import NexReecGraph from './NexReecGraph';
// import JSONfile from '../data/epoque_moderne_reecs.json'; // fichier de test json
// import JSONfile from '../data/tests_reecs.json'; // fichier de test json
// import JSONfile from '../data/tests_reecs2.json'; // fichier de test json
import JSONfile from '../data/tests_reecs3.json'; // fichier de test json
// import JSONfile from '../data/tests_reecs4.json'; // fichier de test json

function App() {
  return <NexReecGraph initialData={JSONfile} />;
}

export default App;