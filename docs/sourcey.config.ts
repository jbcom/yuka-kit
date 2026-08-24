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
    // The default preset keeps the section map and in-page table of contents
    // visible. This is materially easier to use than a single long column for
    // a library with several independent integration surfaces.
    preset: 'default',
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
            { group: 'Getting started', pages: ['introduction', 'installation', 'architecture'] },
            {
              group: 'Build with Yuka Kit',
              pages: ['game-ai', 'persistence', 'agent-integration'],
            },
            { group: 'Reference', pages: ['api-reference'] },
            { group: 'Maintainers', pages: ['guides/releasing'] },
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
