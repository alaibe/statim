import { initialsOf } from "./avatar-and-badge";

jest.mock("@/lib/loadable-uri", () => ({ useLoadableUri: () => null }));

describe("initialsOf", () => {
  it("takes a name's first two words, or its first two characters", () => {
    expect(initialsOf("Alice Martin")).toBe("AM");
    expect(initialsOf("statim")).toBe("ST");
  });

  it("reads an address from after its 0x, never as 0X", () => {
    expect(initialsOf("0xFE0EDFD8b5C80beD")).toBe("FE");
    expect(initialsOf("0xab12…34cd")).toBe("AB");
  });
});
