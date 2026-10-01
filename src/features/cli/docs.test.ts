import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { COMMANDS } from './commands';
import { renderHelp, renderSkill } from './docs';
import { renderMcp } from './mcp';

const root = join(__dirname, '../../..');

/** Embedded in the binary, which prints them without starting the app. `npm run cli:docs` rewrites them. */
const GENERATED = {
  'skills/statim/SKILL.md': renderSkill,
  'src-tauri/cli/help.txt': renderHelp,
  'src-tauri/cli/mcp.json': renderMcp,
};

describe.each(Object.entries(GENERATED))('%s', (path, render) => {
  const file = join(root, path);

  if (process.env.CLI_DOCS_WRITE) writeFileSync(file, render());

  it('is up to date with the commands', () => {
    expect(readFileSync(file, 'utf8')).toBe(render());
  });
});

it('describes every command in the skill', () => {
  const skill = renderSkill();
  for (const command of COMMANDS) expect(skill).toContain(`#### ${command.path}\n`);
});

it('lists every command in the help', () => {
  const help = renderHelp();
  for (const command of COMMANDS) expect(help).toContain(`  ${command.path} `);
});

it('gives every MCP tool a unique name and parameters AI apps accept', () => {
  const { tools } = JSON.parse(renderMcp());
  const names = tools.map((tool: { name: string }) => tool.name);
  expect(new Set(names).size).toBe(names.length);
  for (const tool of tools) {
    expect(tool.name).toMatch(/^\w{1,64}$/);
    for (const key of Object.keys(tool.inputSchema.properties)) expect(key).toMatch(/^\w{1,64}$/);
  }
});
