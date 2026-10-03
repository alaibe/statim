import { COMMANDS } from './commands';
import { renderHelp, renderSkill } from './docs';
import { renderMcp } from './mcp';

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
