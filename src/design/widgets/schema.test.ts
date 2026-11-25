import {
  displayValues,
  fillCommand,
  fillText,
  isWidget,
  normaliseDecimal,
  resolveValues,
  visibleOptions,
  W,
} from "./schema";

describe("code", () => {
  it("makes code copyable by default, since identifiers exist to be pasted", () => {
    expect(W.code("bc1q…")).toMatchObject({ copyable: true });
    expect(W.code("bc1q…", { copyable: false })).toMatchObject({ copyable: false });
  });
});

describe("follow-up actions", () => {
  it("keeps commands as strings, so a widget stays serialisable", () => {
    const widget = W.rows([
      {
        label: "Base",
        value: "1.24 ETH",
        actions: [{ label: "Send", command: "/draft /send --chain base" }],
      },
    ]);

    expect(JSON.parse(JSON.stringify(widget))).toEqual(widget);
  });
});

describe("form", () => {
  it("fills placeholders with what was typed", () => {
    expect(fillCommand("/send {amount} {to}", { amount: "0.01", to: "vitalik.eth" })).toBe("/send 0.01 vitalik.eth");
  });

  it("quotes a value containing a space", () => {
    // The command parser splits on whitespace.
    expect(fillCommand("/request {amount} {note}", { amount: "5", note: "two coffees" })).toBe(
      '/request 5 "two coffees"',
    );
  });

  it("leaves an unfilled placeholder empty rather than literal", () => {
    expect(fillCommand("/request {amount} {note}", { amount: "5" })).toBe("/request 5 ");
  });

  it("trims, so a stray space does not become a quoted argument", () => {
    expect(fillCommand("/send {amount}", { amount: "  0.01  " })).toBe("/send 0.01");
  });
});

describe("decimal answers", () => {
  it("reads the decimal comma of a comma locale as a point", () => {
    expect(normaliseDecimal("0,01", ",")).toBe("0.01");
  });

  it("keeps a point typed in a comma locale", () => {
    expect(normaliseDecimal("0.01", ",")).toBe("0.01");
  });

  it("leaves a thousands comma alone, so 1,000 is refused rather than sent as 1", () => {
    expect(normaliseDecimal("1,000", ".")).toBe("1,000");
  });

  it("never drops a grouping separator, which could turn 0.01 into 1", () => {
    expect(normaliseDecimal("1.000,5", ",")).toBe("1.000.5");
  });
});

describe("dependent fields", () => {
  const fields = [
    {
      id: "chain",
      label: "Chain",
      options: [
        { label: "Ethereum", value: "ethereum" },
        { label: "Bitcoin", value: "bitcoin" },
      ],
    },
    {
      id: "token",
      label: "Token",
      options: [
        { label: "ETH", value: "ETH", when: { chain: "ethereum" } },
        { label: "BTC", value: "BTC", when: { chain: "bitcoin" } },
      ],
    },
    { id: "amount", label: "Amount in {token}" },
    { id: "note", label: "What for", optional: true },
  ];

  it("offers only the options the current answers allow", () => {
    expect(visibleOptions(fields[1], { chain: "bitcoin" }).map((o) => o.value)).toEqual(["BTC"]);
    expect(visibleOptions(fields[1], { chain: "ethereum" }).map((o) => o.value)).toEqual(["ETH"]);
  });

  it("offers nothing when the field it depends on is unanswered", () => {
    expect(visibleOptions(fields[1], {})).toEqual([]);
  });

  it("leaves a field with no conditions alone", () => {
    expect(visibleOptions(fields[0], {}).map((o) => o.value)).toEqual(["ethereum", "bitcoin"]);
  });

  it("reads a choice by its label, not the value it submits", () => {
    const display = displayValues(fields, { chain: "bitcoin", token: "BTC", amount: "0.01" });
    expect(display.chain).toBe("Bitcoin");
    expect(fillText("Amount in {token}", display)).toBe("Amount in BTC");
    expect(fillText("{chain} address", display)).toBe("Bitcoin address");
  });

  it("labels a shared native token value using the selected chain", () => {
    const nativeFields = [
      fields[0],
      {
        ...fields[1],
        options: [
          { label: "ETH", value: "native", when: { chain: "ethereum" } },
          { label: "BTC", value: "native", when: { chain: "bitcoin" } },
        ],
      },
    ];
    const bitcoin = displayValues(nativeFields, { chain: "bitcoin", token: "native" });
    expect(fillText("Amount in {token}", bitcoin)).toBe("Amount in BTC");
    const ethereum = displayValues(nativeFields, { chain: "ethereum", token: "native" });
    expect(fillText("Amount in {token}", ethereum)).toBe("Amount in ETH");
  });

  it("keeps a placeholder nobody filled in rather than blanking it", () => {
    expect(fillText("Amount in {token}", displayValues(fields, {}))).toBe("Amount in {token}");
  });

  it("still submits the value, not the label", () => {
    expect(fillCommand("/send {amount} --chain {chain}", { amount: "0.01", chain: "bitcoin" })).toBe(
      "/send 0.01 --chain bitcoin",
    );
  });

  it("moves a stale choice onto the chain that is now selected", () => {
    const answers = resolveValues(fields, { chain: "bitcoin", token: "ETH", amount: "0.01" });
    expect(answers.token).toBe("BTC");
    expect(answers.amount).toBe("0.01");
  });

  it("fills in a choice nobody has made yet", () => {
    expect(resolveValues(fields, { chain: "ethereum" }).token).toBe("ETH");
  });

  it("leaves a choice alone when it is still on offer", () => {
    const values = { chain: "ethereum", token: "ETH" };
    expect(resolveValues(fields, values)).toBe(values);
  });
});

describe("isWidget", () => {
  const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  it("accepts every kind as it arrives over the wire", () => {
    const widgets = [
      W.stat("1", { label: "Supply", tone: "brand", actions: [{ label: "Go", command: "/go" }] }),
      W.rows([{ label: "a", value: "b", state: "on" }]),
      W.list([{ title: "Item", subtitle: "sub", icon: "wallet" }]),
      W.text("t"),
      W.code("0xabc"),
      W.card([W.text("inside")], { title: "Card" }),
      W.badges([{ label: "live", tone: "success" }]),
      W.actions([{ label: "Go", command: "/balance" }]),
      W.link("Open", "https://example.com"),
      W.form(
        [
          {
            id: "amount",
            label: "Amount",
            keyboard: "decimal",
            options: [{ label: "1", value: "1" }],
          },
        ],
        { label: "Send", command: "/send {amount}" },
      ),
    ];
    for (const widget of widgets) expect(isWidget(wire(widget))).toBe(true);
  });

  it.each([
    ["null", null],
    ["an array", [W.text("t")]],
    ["a kind this build does not know", { kind: "chart", points: [] }],
    ["rows that are not a list", { kind: "rows", rows: 5 }],
    ["text that is an object", { kind: "text", text: { bold: "x" } }],
    ["an action with no command", W.actions([{ label: "Go" } as never])],
    ["a tone no button has", W.actions([{ label: "Go", command: "/go", tone: "info" as never }])],
    ["a card with a broken child", W.card([{ kind: "rows" } as never])],
  ])("refuses %s", (_, value) => {
    expect(isWidget(wire(value))).toBe(false);
  });

  it("lets a card carry a kind from a newer build, which renders as nothing", () => {
    expect(isWidget(wire(W.card([W.text("known"), { kind: "chart" } as never])))).toBe(true);
  });

  it("accepts an icon this build does not have", () => {
    expect(isWidget(wire(W.link("Open", "https://example.com", "rocket" as never)))).toBe(true);
  });
});
