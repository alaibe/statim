/**
 * Two independent gates decide what a chat offers: `showIn` asks what
 * *kind* of place this is, ownership asks *whose chat* it is. Both must pass.
 *
 * Gating happens before de-duplication, which is what lets every protocol
 * define its own `/balance`: in any one chat at most one survives.
 */
import { reportError } from '../app/report-error';
import { botChatId, type Bot } from '../messaging/bots';
import { inScope, type ChatScope } from '../messaging/chat-scope';
import { supports } from '../messaging/capability';
import type { ChatSession } from '../messaging/protocol';
import type { ChatId, LiveView, ParticipantId } from '../messaging/types';
import type {
  ActivePlugin,
  ComposerAction,
  Plugin,
  PluginContentType,
  PluginContext,
  PluginId,
  PluginOverlay,
  PluginView,
  SlashCommand,
} from './types';

interface CommandEntry {
  command: SlashCommand;
  context: PluginContext;
  pluginId: PluginId;
}

export function worksOn(command: SlashCommand, session: ChatSession | undefined): boolean {
  if (command.sendsCustom && !session?.sendsCustom) return false;
  return !command.requires || supports(session, command.requires);
}

export const CORE_ID = 'statim';

const CORE_CONTEXT = new Proxy({} as PluginContext, {
  get(_target, property) {
    throw new Error(
      `A core command reached for context.${String(property)}. Core commands have no plugin ` +
        'context: use the store directly, or make it a plugin.'
    );
  },
});

/** Commands that ship with the app but are offered only while their switch in Settings is on. */
export interface CoreFeature {
  commands: SlashCommand[];
  composerActions?: ComposerAction[];
  isOn(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface CoreContribution {
  commands?: SlashCommand[];
  composerActions?: ComposerAction[];
  features?: CoreFeature[];
}

function indexCommands(
  entries: Iterable<CommandEntry>,
  onClash?: (key: string, pluginId: PluginId) => void
): Map<string, CommandEntry> {
  const out = new Map<string, CommandEntry>();
  for (const entry of entries) {
    for (const key of [entry.command.name, ...(entry.command.aliases ?? [])]) {
      if (out.has(key)) onClash?.(key, entry.pluginId);
      else out.set(key, entry);
    }
  }
  return out;
}

export class PluginRegistry {
  private readonly available = new Map<PluginId, Plugin>();
  private readonly active = new Map<PluginId, ActivePlugin>();
  private readonly core: CoreContribution;

  private cache: {
    commands?: Map<string, CommandEntry>;
    contentTypes?: Map<string, { spec: PluginContentType; context: PluginContext }>;
    specs?: PluginContentType[];
    composerActions?: { action: ComposerAction; context: PluginContext; pluginId: PluginId }[];
    channelOwners?: Map<ChatId, PluginId>;
    overlays?: { overlay: PluginOverlay; pluginId: PluginId }[];
    bots?: Bot[];
    lists?: Map<string, unknown>;
  } = {};

  private readonly listeners = new Set<() => void>();

  private invalidate() {
    this.cache = {};
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private memo<T>(key: string, compute: () => T): T {
    const lists = (this.cache.lists ??= new Map());
    if (!lists.has(key)) lists.set(key, compute());
    return lists.get(key) as T;
  }

  constructor(plugins: Plugin[] = [], core: CoreContribution = {}) {
    this.core = core;
    for (const plugin of plugins) this.register(plugin);
    for (const feature of core.features ?? []) feature.subscribe(() => this.invalidate());
  }

  private coreCommands(): SlashCommand[] {
    const on = (this.core.features ?? []).filter((feature) => feature.isOn());
    return [...(this.core.commands ?? []), ...on.flatMap((feature) => feature.commands)];
  }

  private coreComposerActions(): ComposerAction[] {
    const on = (this.core.features ?? []).filter((feature) => feature.isOn());
    return [
      ...(this.core.composerActions ?? []),
      ...on.flatMap((feature) => feature.composerActions ?? []),
    ];
  }

  register(plugin: Plugin) {
    if (this.available.has(plugin.manifest.id)) {
      throw new Error(`Duplicate plugin id "${plugin.manifest.id}"`);
    }
    this.available.set(plugin.manifest.id, plugin);
  }

  list(): Plugin[] {
    return [...this.available.values()];
  }

  get(id: PluginId): Plugin | undefined {
    return this.available.get(id);
  }

  isActive(id: PluginId): boolean {
    return this.active.has(id);
  }

  activeIds(): PluginId[] {
    return [...this.active.keys()];
  }

  async activate(
    id: PluginId,
    makeContext: (plugin: Plugin) => PluginContext,
    revoke?: () => void
  ): Promise<void> {
    if (this.active.has(id)) return;

    const plugin = this.available.get(id);
    if (!plugin) throw new Error(`Unknown plugin "${id}"`);

    const context = makeContext(plugin);

    let contribution;
    try {
      contribution = plugin.setup(context);
    } catch (error) {
      revoke?.();
      console.error(`[plugins] "${id}" failed to set up and was skipped`, error);
      reportError(error);
      return;
    }

    const entry: ActivePlugin = { plugin, contribution, context, revoke };
    this.active.set(id, entry);
    this.invalidate();

    if (contribution.start) {
      try {
        const dispose = await contribution.start();
        if (typeof dispose === 'function') {
          if (this.active.get(id) === entry) entry.dispose = dispose;
          else dispose();
        }
      } catch (error) {
        console.warn(`[plugins] "${id}" failed to start`, error);
      }
    }
  }

  async deactivate(id: PluginId): Promise<void> {
    const entry = this.active.get(id);
    if (!entry) return;
    entry.revoke?.();
    try {
      entry.dispose?.();
    } catch (error) {
      console.warn(`[plugins] "${id}" failed to dispose`, error);
    }
    this.active.delete(id);
    this.invalidate();
  }

  async deactivateAll(): Promise<void> {
    await Promise.all(this.activeIds().map((id) => this.deactivate(id)));
  }

  commands(): Map<string, CommandEntry> {
    this.cache.commands ??= indexCommands(this.entries(), (key, pluginId) => {
      console.warn(`[plugins] command "/${key}" already claimed; "${pluginId}" ignored`);
    });
    return this.cache.commands;
  }

  channelOwner(chatId: ChatId): PluginId | undefined {
    if (!this.cache.channelOwners) {
      const owners = new Map<ChatId, PluginId>();
      for (const [pluginId, entry] of this.active) {
        for (const bot of entry.contribution.bots ?? []) {
          owners.set(botChatId(bot.id), pluginId);
        }
      }
      this.cache.channelOwners = owners;
    }
    return this.cache.channelOwners.get(chatId);
  }

  private inScope(chatId: ChatId, pluginId: PluginId, global?: boolean): boolean {
    const owner = this.channelOwner(chatId);
    return owner === undefined || owner === pluginId || global === true;
  }

  commandsFor(chatId: ChatId, scope?: ChatScope): Map<string, CommandEntry> {
    return indexCommands(this.entries(chatId, scope));
  }

  commandListFor(
    chatId: ChatId,
    scope?: ChatScope
  ): { command: SlashCommand; pluginId: PluginId }[] {
    return this.memo(`commands:${chatId}:${scope}`, () => {
      const seen = new Set<string>();
      const out: { command: SlashCommand; pluginId: PluginId }[] = [];
      for (const { command, pluginId } of this.entries(chatId, scope)) {
        // Hidden only from the list. `commandsFor` still dispatches it, which is
        // the point: a bot's buttons must keep working.
        if (command.hidden || seen.has(command.name)) continue;
        seen.add(command.name);
        out.push({ command, pluginId });
      }
      return out.sort((a, b) => a.command.name.localeCompare(b.command.name));
    });
  }

  /** Core first, then plugins. No scope skips the `showIn` gate; no chat skips ownership. */
  private *entries(chatId?: ChatId, scope?: ChatScope): Generator<CommandEntry> {
    for (const command of this.coreCommands()) {
      if (scope !== undefined && !inScope(command.showIn, scope)) continue;
      yield { command, context: CORE_CONTEXT, pluginId: CORE_ID };
    }
    for (const [pluginId, entry] of this.active) {
      for (const command of entry.contribution.commands ?? []) {
        if (!this.offers(chatId, pluginId, command.global, command.showIn, scope)) continue;
        yield { command, context: entry.context, pluginId };
      }
    }
  }

  composerActionsFor(
    chatId: ChatId,
    scope?: ChatScope
  ): { action: ComposerAction; context: PluginContext; pluginId: PluginId }[] {
    return this.memo(`actions:${chatId}:${scope}`, () => {
      const core = this.coreComposerActions()
        .filter((action) => scope === undefined || inScope(action.showIn, scope))
        .map((action) => ({ action, context: CORE_CONTEXT, pluginId: CORE_ID }));

      return [
        ...core,
        ...this.composerActions().filter((e) =>
          this.offers(chatId, e.pluginId, e.action.global, e.action.showIn, scope)
        ),
      ];
    });
  }

  private offers(
    chatId: ChatId | undefined,
    pluginId: PluginId,
    global: boolean | undefined,
    showIn: readonly ChatScope[] | undefined,
    scope: ChatScope | undefined
  ): boolean {
    if (scope !== undefined && !inScope(showIn, scope)) return false;
    return chatId === undefined || this.inScope(chatId, pluginId, global);
  }

  private contentTypes(): Map<string, { spec: PluginContentType; context: PluginContext }> {
    if (this.cache.contentTypes) return this.cache.contentTypes;
    const out = new Map<string, { spec: PluginContentType; context: PluginContext }>();
    for (const entry of this.active.values()) {
      for (const spec of entry.contribution.contentTypes ?? []) {
        out.set(spec.typeId, { spec, context: entry.context });
      }
    }
    this.cache.contentTypes = out;
    return out;
  }

  customRenderer(typeId: string, data: unknown) {
    const entry = this.contentTypes().get(typeId);
    return entry?.spec.is(data)
      ? { render: entry.spec.render, context: entry.context, data }
      : null;
  }

  /** Plain data, not protocol codecs: turning these into codecs is each adapter's job. */
  contentTypeSpecs(): PluginContentType[] {
    if (this.cache.specs) return this.cache.specs;
    this.cache.specs = [...this.contentTypes().values()].map(({ spec }) => spec);
    return this.cache.specs;
  }

  botsOf(id: PluginId): Bot[] {
    return this.active.get(id)?.contribution.bots ?? [];
  }

  view(pluginId: PluginId, name: string): PluginView | undefined {
    return this.active.get(pluginId)?.contribution.views?.[name];
  }

  textPreview(text: string): LiveView | null {
    for (const [pluginId, entry] of this.active) {
      for (const preview of entry.contribution.textPreviews ?? []) {
        const args = preview.match(text);
        if (args) return { pluginId, view: preview.view, args };
      }
    }
    return null;
  }

  async participantNames(): Promise<Record<ParticipantId, string>> {
    const all = await Promise.all(
      [...this.active.values()].map((entry) => entry.contribution.names?.().catch(() => ({})))
    );
    return Object.assign({}, ...all);
  }

  bots(): Bot[] {
    if (this.cache.bots) return this.cache.bots;
    const out: Bot[] = [];
    for (const entry of this.active.values()) {
      out.push(...(entry.contribution.bots ?? []));
    }
    this.cache.bots = out;
    return out;
  }

  composerActions(): { action: ComposerAction; context: PluginContext; pluginId: PluginId }[] {
    if (this.cache.composerActions) return this.cache.composerActions;
    const out: { action: ComposerAction; context: PluginContext; pluginId: PluginId }[] = [];
    for (const [pluginId, entry] of this.active) {
      for (const action of entry.contribution.composerActions ?? []) {
        out.push({ action, context: entry.context, pluginId });
      }
    }
    this.cache.composerActions = out;
    return out;
  }

  overlays(): { overlay: PluginOverlay; pluginId: PluginId }[] {
    if (this.cache.overlays) return this.cache.overlays;
    const out: { overlay: PluginOverlay; pluginId: PluginId }[] = [];
    for (const [pluginId, entry] of this.active) {
      for (const overlay of entry.contribution.overlays ?? []) out.push({ overlay, pluginId });
    }
    this.cache.overlays = out;
    return out;
  }

  async handleUri(url: string): Promise<boolean> {
    const scheme = url.split(':')[0]?.toLowerCase();
    if (!scheme) return false;

    for (const entry of this.active.values()) {
      for (const handler of entry.contribution.uriHandlers ?? []) {
        if (!handler.schemes.includes(scheme)) continue;
        try {
          if (await handler.handle(url, entry.context)) return true;
        } catch (error) {
          console.warn(`[plugins] URI handler failed for ${scheme}:`, error);
        }
      }
    }
    return false;
  }
}
