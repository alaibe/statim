/** `./crypto` must evaluate before anything touching @noble/hashes, as WalletConnect does at import time. */
import "./crypto";

import "./walletconnect";

import "./desktop";

import "./verify";
