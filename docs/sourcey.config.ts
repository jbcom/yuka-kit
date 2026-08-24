import { defineConfig, markdown } from 'sourcey';

export default defineConfig({
  name: 'Yuka Kit',
  siteUrl: 'https://jonbogaty.com',
  baseUrl: '/yuka-kit',
  repo: 'https://github.com/jbcom/yuka-kit',
  editBranch: 'main',
  editBasePath: 'docs',
  prettyUrls: 'slash',
  theme: {
    preset: 'minimal',
    colors: {
      primary: '#1f6feb',
      light: '#58a6ff',
      dark: '#0d419d',
    },
  },
  navigation: {
    tabs: [
      {
        tab: 'Documentation',
        slug: '',
        source: markdown({
          groups: [
            { group: 'Getting started', pages: ['introduction', 'installation'] },
            { group: 'Guides', pages: ['game-ai', 'persistence', 'guides/releasing'] },
          ],
        }),
      },
    ],
  },
  navbar: {
    links: [{ type: 'github', href: 'https://github.com/jbcom/yuka-kit' }],
  },
  footer: {
    links: [{ type: 'github', href: 'https://github.com/jbcom/yuka-kit' }],
  },
});
