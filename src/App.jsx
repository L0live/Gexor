import NexReecGraph from './NexReecGraph';
// import JSONfile from '../data/epoque_moderne_reecs.json';
import JSONfile from '../data/reecs_ultra_massive_v2.json';

function App() {
  return <NexReecGraph initialData={JSONfile} />;
}

export default App;