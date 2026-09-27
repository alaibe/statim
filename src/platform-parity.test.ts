import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');

const ALLOWED: Record<string, string> = {
  'src/storage/media: mediaDirectory is native only':
    'An expo-file-system handle for media-store.ts, whose desktop neighbour does not use it',
  'src/storage/media: mediaFile is native only': 'The same, for a single file',
};

const pairs = readdirSync(path.join(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.web\.tsx?$/.test(file))
  .map((file) => {
    const base = path.join('src', file.replace(/\.web\.tsx?$/, ''));
    const native = ['.ts', '.tsx'].map((ext) => base + ext).find((f) => existsSync(`${ROOT}/${f}`));
    return { name: base, web: path.join('src', file), native };
  });

it('gives every desktop file a neighbour for tsc and callers to resolve', () => {
  expect(pairs.filter((pair) => !pair.native).map((pair) => pair.name)).toEqual([]);
});

it('keeps each desktop file in step with the neighbour its callers were checked against', () => {
  const config = ts.readConfigFile(`${ROOT}/tsconfig.json`, ts.sys.readFile).config;
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
  const files = pairs.flatMap((pair) => (pair.native ? [pair.web, pair.native] : []));
  const program = ts.createProgram(
    files.map((file) => `${ROOT}/${file}`),
    options
  );
  const checker = program.getTypeChecker();

  const resolve = (symbol: ts.Symbol) =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const typeOf = (symbol: ts.Symbol) => checker.getTypeOfSymbol(resolve(symbol));
  const valuesOf = (file: string) => {
    const module = checker.getSymbolAtLocation(program.getSourceFile(`${ROOT}/${file}`)!)!;
    const values = checker
      .getExportsOfModule(module)
      .filter((s) => resolve(s).flags & ts.SymbolFlags.Value);
    return new Map(values.map((symbol) => [symbol.name, symbol]));
  };

  function differences(label: string, native: ts.Type, desktop: ts.Type): string[] {
    const [call, desktopCall] = [native.getCallSignatures()[0], desktop.getCallSignatures()[0]];
    if (!call || !desktopCall) return [];
    return desktopCall.parameters
      .filter((param, i) => {
        const given = call.parameters[i] ? typeOf(call.parameters[i]) : checker.getUndefinedType();
        return !checker.isTypeAssignableTo(given, typeOf(param));
      })
      .map((param) => `${label} takes a different ${param.name}`);
  }

  const problems = pairs.flatMap(({ name, web, native }) => {
    if (!native) return [];
    const [phone, desktop] = [valuesOf(native), valuesOf(web)];
    const onlyDesktop = [...desktop.keys()].filter((key) => !phone.has(key));
    return [
      ...[...phone].flatMap(([key, symbol]) => {
        const other = desktop.get(key);
        if (!other) return [`${name}: ${key} is native only`];
        return differences(`${name}: ${key}`, typeOf(symbol), typeOf(other));
      }),
      ...onlyDesktop.map((key) => `${name}: ${key} is desktop only`),
    ];
  });

  expect(problems.filter((problem) => !(problem in ALLOWED))).toEqual([]);
  expect(Object.keys(ALLOWED).filter((problem) => !problems.includes(problem))).toEqual([]);
}, 30_000);
