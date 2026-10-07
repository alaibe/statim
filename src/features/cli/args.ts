import {
  COMMANDS,
  GLOBAL_FLAGS,
  type CliArg,
  type CliCommandSpec,
  type CliFlag,
  type CommandPath,
} from './commands';
import { CliError } from './errors';

export interface ParsedArgs {
  spec: Spec;
  args: Record<string, string | undefined>;
  rest: string[];
  flags: Record<string, string | true | undefined>;
  help: boolean;
}

type Spec = CliCommandSpec & { path: CommandPath };

export function findCommand(argv: readonly string[]): Spec | undefined {
  let best: Spec | undefined;
  for (const spec of COMMANDS) {
    const words = spec.path.split(' ');
    const matches = words.every((word, i) => argv[i] === word);
    if (matches && (!best || words.length > best.path.split(' ').length)) best = spec;
  }
  return best;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const spec = findCommand(argv);
  if (!spec) {
    throw new CliError(
      argv.length ? `Unknown command "${argv[0]}". Run statim help.` : 'No command given.',
      'usage'
    );
  }
  const { positionals, flags } = splitTokens(spec, argv.slice(spec.path.split(' ').length));
  const declared = spec.args ?? [];
  const { args, rest, extra } = bindArgs(declared, positionals);
  const help = flags.help === true;
  if (!help) {
    const missing = declared.find((a) => !a.optional && args[a.name] === undefined);
    if (missing) throw new CliError(`Missing <${missing.name}>. ${usage(spec)}`, 'usage');
    if (extra !== undefined) throw new CliError(`Unexpected "${extra}". ${usage(spec)}`, 'usage');
  }

  return { spec, args, rest, flags, help };
}

function splitTokens(spec: Spec, tail: readonly string[]) {
  const known = new Map([...GLOBAL_FLAGS, ...(spec.flags ?? [])].map((f) => [f.name, f]));
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  let literal = false;
  for (let i = 0; i < tail.length; i++) {
    const token = tail[i];
    if (token === '--' && !literal) {
      literal = true;
      continue;
    }
    if (literal || !token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [name, inline] = splitFlag(token.slice(2));
    const flag = known.get(name);
    if (!flag && spec.passthrough) {
      positionals.push(token);
      continue;
    }
    if (!flag) throw new CliError(`Unknown option --${name} for "${spec.path}".`, 'usage');
    if (!flag.value) {
      flags[name] = true;
      continue;
    }
    const value = inline ?? tail[++i];
    if (value === undefined) throw new CliError(`--${name} needs a ${flag.value}.`, 'usage');
    flags[name] = value;
  }
  return { positionals, flags };
}

function bindArgs(declared: readonly CliArg[], positionals: readonly string[]) {
  const args: Record<string, string | undefined> = {};
  let rest: string[] = [];
  const required = declared.filter((a) => !a.optional).length;
  // An optional argument before a required one is only filled when there are enough words for both.
  let spare = Math.max(0, positionals.length - required);
  let at = 0;
  for (const arg of declared) {
    if (arg.variadic) {
      rest = positionals.slice(at);
      args[arg.name] = rest.length ? rest.join(' ') : undefined;
      at = positionals.length;
      break;
    }
    if (arg.optional) {
      if (spare === 0) continue;
      spare -= 1;
    }
    args[arg.name] = positionals[at++];
  }
  return { args, rest, extra: positionals.at(at) };
}

function splitFlag(body: string): [string, string | undefined] {
  const eq = body.indexOf('=');
  return eq === -1 ? [body, undefined] : [body.slice(0, eq), body.slice(eq + 1)];
}

export function usage(spec: CliCommandSpec): string {
  const args = (spec.args ?? []).map((a) => {
    const name = a.variadic ? `${a.name}...` : a.name;
    return a.optional ? `[${name}]` : `<${name}>`;
  });
  const flags = (spec.flags ?? []).map((f) => `[${flagSyntax(f)}]`);
  return `Usage: statim ${[spec.path, ...args, ...flags].join(' ')}`;
}

export function flagSyntax(flag: CliFlag): string {
  return flag.value ? `--${flag.name} <${flag.value}>` : `--${flag.name}`;
}
