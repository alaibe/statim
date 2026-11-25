import { View } from "react-native";

import { Icon, type IconName, Row, RowGroup, SECTION_GAP, Section, SettingsRow, Tag, type TagTone } from "@/design";
import type { PressHandler } from "@/design/lib/press";

/** A group of settings: a Section on its own page, rows under a label in the desktop's list column. */
export function SettingsGroup({
  label,
  compact,
  danger = false,
  children,
}: {
  label: string;
  compact: boolean;
  /** The screen's one raised section: what can't be undone. */
  danger?: boolean;
  children: React.ReactNode;
}) {
  if (compact) return <RowGroup label={label}>{children}</RowGroup>;
  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <Section label={label} danger={danger}>
        {children}
      </Section>
    </View>
  );
}

export interface PageLinkProps {
  compact: boolean;
  testID?: string;
  label: string;
  description?: string;
  icon: IconName;
  selected?: boolean;
  danger?: boolean;
  tag?: { label: string; tone: TagTone };
  /** Opens something outside the app. */
  external?: boolean;
  onPress: PressHandler;
}

/** A link to a settings page: a row in the desktop's list, a settings row with a chevron on its own page. */
export function PageLink({
  compact,
  testID,
  label,
  description,
  icon,
  selected,
  danger,
  tag,
  external,
  onPress,
}: PageLinkProps) {
  if (compact) {
    return (
      <Row
        testID={testID}
        title={label}
        leading={<Icon name={icon} size={16} tone={danger ? "danger" : selected ? "accent" : "muted"} />}
        meta={tag ? <Tag tone={tag.tone} label={tag.label} /> : undefined}
        selected={selected}
        onPress={onPress}
      />
    );
  }
  return (
    <SettingsRow
      testID={testID}
      label={label}
      description={description}
      icon={icon}
      danger={danger}
      selected={selected}
      control={tag ? <Tag tone={tag.tone} label={tag.label} /> : undefined}
      external={external}
      onPress={onPress}
    />
  );
}
