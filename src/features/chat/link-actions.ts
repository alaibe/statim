import { errorMessage } from "@/core/errors";
import { EXPLORERS, type LinkSegment } from "@/core/messaging/links";
import { mapsLinks, parseLocation } from "@/core/messaging/locations";
import { copyText, type MenuItem, toast } from "@/design";
import { openExternal, openInBrowser } from "@/lib/open-url";

export function openUrlQuietly(url: string) {
  openInBrowser(url).catch(() => {});
}

export function openLink(link: LinkSegment) {
  const open =
    link.kind === "phone" || link.kind === "email"
      ? openExternal(link.href)
      : isPlace(link)
        ? openInMaps(link.href)
        : openInBrowser(link.href);
  open.catch((error) => toast.error(errorMessage(error, "Could not open that")));
}

const isPlace = (link: LinkSegment) =>
  link.kind === "location" || (link.kind === "url" && parseLocation(link.href) !== null);

export function openInMaps(url: string): Promise<unknown> {
  const location = parseLocation(url);
  if (!location) return openExternal(url);
  const links = mapsLinks(location);
  return openExternal(process.env.EXPO_OS === "android" ? links.geo : links.apple);
}

export function linkActions(link: LinkSegment, onCommand?: (command: string) => void): MenuItem[] {
  const copy = (label: string): MenuItem => ({
    label,
    icon: "copy",
    onPress: () => copyText(link.kind === "url" ? link.href : link.text),
  });
  const open = (label: string, icon: MenuItem["icon"]): MenuItem => ({
    label,
    icon,
    onPress: () => openLink(link),
  });
  const send: MenuItem[] = onCommand
    ? [
        {
          label: "Send funds",
          icon: "circle-arrow-up",
          onPress: () => onCommand(`/send ${link.text}`),
        },
      ]
    : [];

  switch (link.kind) {
    case "url":
      return isPlace(link)
        ? [open("Open in Maps", "map-pin"), copy("Copy link")]
        : [open("Open link", "arrow-up-right"), copy("Copy link")];
    case "phone":
      return [open("Call", "phone"), copy("Copy number")];
    case "email":
      return [open("Write an email", "mail"), copy("Copy address")];
    case "location":
      return [open("Open in Maps", "map-pin"), copy("Copy")];
    case "address":
      return [open(`View on ${EXPLORERS[link.family].name}`, "arrow-up-right"), copy("Copy address"), ...send];
    case "ens":
      return [open("View on ENS", "arrow-up-right"), copy("Copy name"), ...send];
  }
}
