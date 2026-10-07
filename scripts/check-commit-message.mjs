import { readFileSync } from 'node:fs';

const message = readFileSync(process.argv[2], 'utf8');
if (!/^(?:Merge |Revert "|(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([^)]+\))?!?: .+)/.test(message)) {
  console.error('Commit subject must follow Conventional Commits.');
  process.exitCode = 1;
}
