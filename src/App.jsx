import Gexor from './Gexor';
import StartScreen from './components/UI/StartScreen';
import useGraphStore from './store/useGraphStore';

function App() {
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const hasData = Object.keys(loadedNodes).length > 0;

  return hasData ? <Gexor /> : <StartScreen />;
}

export default App;