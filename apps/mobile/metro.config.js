const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro em monorepo npm workspaces.
 *
 * O Metro precisa observar a raiz (onde ficam packages/ e o node_modules
 * hoisted) e procurar módulos nos dois níveis; sem isso, importar @ff/domain
 * dentro do app falha em tempo de bundle.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.join(projectRoot, 'node_modules'),
      path.join(workspaceRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
