import useGraphStore from '../store/useGraphStore';
import { getTheme } from '../constants/themes';

export const useTheme = () => {
  const themeId = useGraphStore(s => s.theme);
  return getTheme(themeId);
};

export default useTheme;
