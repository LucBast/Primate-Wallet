/**
 * Mocks de módulos nativos que não existem no ambiente de teste.
 * O objetivo é testar comportamento de UI e regras — não a ponte nativa.
 */

/**
 * lucide-react-native é publicado só em ESM (.mjs) na condição "react-native",
 * que o Jest não transforma. Como nenhum teste inspeciona o desenho do ícone —
 * eles verificam layout, cor e copy —, cada ícone vira um componente vazio.
 */
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = (props) => React.createElement(View, props);
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : stub),
    },
  );
});

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
  setGenericPassword: jest.fn(async () => true),
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
}));

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
