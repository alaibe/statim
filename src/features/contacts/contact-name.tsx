import { Text } from "@/design";

interface ContactNameProps {
  given?: string | null;
  family?: string | null;
}

export function ContactName({ given, family }: ContactNameProps) {
  const first = given?.trim();
  const last = family?.trim();

  if (!first && !last) return <>Unknown</>;
  if (!last) return <>{first}</>;
  if (!first) return <Text strong>{last}</Text>;

  return (
    <>
      {first} <Text strong>{last}</Text>
    </>
  );
}
