import { act, create } from "react-test-renderer";

import { PrimaryScope, TwoPrimaries, usePrimaryClaim } from "./primary";

function Primary() {
  usePrimaryClaim(true);
  return null;
}

function Secondary() {
  usePrimaryClaim(false);
  return null;
}

describe("one primary button per screen", () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => error.mockClear());

  it("lets a screen have one primary and any number of others", async () => {
    await act(async () => {
      create(
        <PrimaryScope>
          <Primary />
          <Secondary />
          <Secondary />
        </PrimaryScope>,
      );
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("reports a second primary on the same screen", async () => {
    await act(async () => {
      create(
        <PrimaryScope>
          <Primary />
          <Primary />
        </PrimaryScope>,
      );
    });
    expect(error).toHaveBeenCalledWith(new TwoPrimaries().message);
  });

  it("counts a dialog's primary apart from its screen's", async () => {
    await act(async () => {
      create(
        <PrimaryScope>
          <Primary />
          <PrimaryScope>
            <Primary />
          </PrimaryScope>
        </PrimaryScope>,
      );
    });
    expect(error).not.toHaveBeenCalled();
  });
});
