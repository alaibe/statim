import { copyText, type SheetAction, toast } from '@/design';
import { errorMessage } from '@/core/errors';
import { EXPLORERS, type LinkSegment } from '@/core/messaging/links';
import { mapsLinks, parseLocation } from '@/core/messaging/locations';
import { openExternal, openInBrowser } from '@/lib/open-url';

export function openUrlQuietly(url: string) {
  openInBrowser(url).catch(() => {});
}

export function openLink(link: LinkSegment) {
  const open =
    link.kind === 'phone' || link.kind === 'email'
      ? openExternal(link.href)
      : isPlace(link)
        ? openInMaps(link.href)
        : openInBrowser(link.href);
  open.catch((error) => toast.error(errorMessage(error, 'Could not open that')));
}

const isPlace = (link: LinkSegment) =>
  link.kind === 'location' || (link.kind === 'url' && parseLocation(link.href) !== null);

/** Hands a place to the device's maps app rather than a web page. */
export function openInMaps(url: string): Promise<unknown> {
  const location = parseLocation(url);
  if (!location) return openExternal(url);
  const links = mapsLinks(location);
  return openExternal(process.env.EXPO_OS === 'android' ? links.geo : links.apple);
}

export function linkActions(
  link: LinkSegment,
  onCommand?: (command: string) => void
): SheetAction[] {
  const copy = (label: string): SheetAction => ({
    label,
    icon: 'copy-outline',
    onPress: () => void copyText(link.kind === 'url' ? link.href : link.text),
  });
  const open = (label: string, icon: SheetAction['icon']): SheetAction => ({
    label,
    icon,
    onPress: () => openLink(link),
  });
  const send: SheetAction[] = onCommand
    ? [
        {
          label: 'Send funds',
          icon: 'arrow-up-circle-outline',
          onPress: () => onCommand(`/send ${link.text}`),
        },
      ]
    : [];

  switch (link.kind) {
    case 'url':
      return isPlace(link)
        ? [open('Open in Maps', 'location-outline'), copy('Copy link')]
        : [open('Open link', 'open-outline'), copy('Copy link')];
    case 'phone':
      return [open('Call', 'call-outline'), copy('Copy number')];
    case 'email':
      return [open('Write an email', 'mail-outline'), copy('Copy address')];
    case 'location':
      return [open('Open in Maps', 'location-outline'), copy('Copy')];
    case 'address':
      return [
        open(`View on ${EXPLORERS[link.family].name}`, 'open-outline'),
        copy('Copy address'),
        ...send,
      ];
    case 'ens':
      return [open('View on ENS', 'open-outline'), copy('Copy name'), ...send];
  }
}
